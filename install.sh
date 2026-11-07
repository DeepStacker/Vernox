#!/usr/bin/env bash
# One command to bring Vernox up in production on any Linux VM (Docker is the only requirement; on Ubuntu/Debian
# it is installed for you). Safe to re-run: existing secrets are kept, existing answers become the defaults.
#
#   ./install.sh                                   # asks for the four bootstrap values
#   ./install.sh --domain shop.example.in --admin-email owner@example.in \
#                --service-account ./service-account.json --web-config ./firebase-web-config.json
#
# Only bootstrap values are asked here: domain, admin email, the Firebase service-account JSON and the Firebase
# web app config (public). Every third-party key (Razorpay, Shiprocket, Resend, MSG91, WhatsApp) is entered later
# in the app: Admin > Settings > Integrations.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=deploy/lib.sh
. deploy/lib.sh

usage() {
  cat <<'EOF'
Usage: ./install.sh [options]

  --domain DOMAIN            public domain, e.g. shop.example.in (env: DOMAIN)
  --admin-email EMAIL        owner account to make super admin; also the Let's Encrypt contact (env: ADMIN_EMAIL)
  --service-account FILE     Firebase service-account JSON key (env: SERVICE_ACCOUNT_FILE)
  --web-config FILE|JSON     Firebase web app config: a file or the pasted snippet with apiKey, authDomain,
                             projectId, storageBucket, messagingSenderId, appId (env: FIREBASE_WEB_CONFIG, or the
                             six FIREBASE_WEB_* variables)
  --non-interactive          never prompt; fail if a value is missing
  --yes                      answer yes to installing Docker
  --skip-rules               do not deploy Firestore/Storage rules and indexes
  --rules-only               only deploy the rules and indexes, then exit
  --grant-admin EMAIL        only make EMAIL a super admin (after they signed up), then exit
  -h, --help                 this text
EOF
}

DOMAIN="${DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
SERVICE_ACCOUNT_FILE="${SERVICE_ACCOUNT_FILE:-}"
WEB_CONFIG="${FIREBASE_WEB_CONFIG:-}"
INTERACTIVE=1; ASSUME_YES=0; SKIP_RULES=0; RULES_ONLY=0; GRANT_ONLY=""
[ -t 0 ] || INTERACTIVE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:?--domain needs a value}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:?--admin-email needs a value}"; shift 2 ;;
    --service-account) SERVICE_ACCOUNT_FILE="${2:?--service-account needs a value}"; shift 2 ;;
    --web-config) WEB_CONFIG="${2:?--web-config needs a value}"; shift 2 ;;
    --non-interactive) INTERACTIVE=0; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --skip-rules) SKIP_RULES=1; shift ;;
    --rules-only) RULES_ONLY=1; shift ;;
    --grant-admin) GRANT_ONLY="${2:?--grant-admin needs an email}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
done

# ---- prompts ---------------------------------------------------------------------------------------------------

ask() { # ask VAR "question" [default]: keeps a value already supplied by a flag, env or the previous run
  local var="$1" question="$2" default="${3:-}" answer
  [ -n "${!var}" ] && return 0
  if [ "$INTERACTIVE" -eq 0 ]; then
    [ -n "$default" ] && { printf -v "$var" '%s' "$default"; return 0; }
    die "$question is required (pass it as a flag or environment variable; see ./install.sh --help)"
  fi
  read -r -p "$question${default:+ [$default]}: " answer
  printf -v "$var" '%s' "${answer:-$default}"
  [ -n "${!var}" ] || die "$question is required"
}

confirm() { # confirm "question": yes by default
  [ "$ASSUME_YES" -eq 1 ] && return 0
  [ "$INTERACTIVE" -eq 0 ] && return 1
  local answer
  read -r -p "$1 [Y/n] " answer
  case "${answer:-y}" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

# Reads `key: "value"` (JS object) or `"key": "value"` (JSON) from text; empty when absent.
json_field() { # json_field KEY TEXT
  printf '%s' "$2" | tr '\n' ' ' | grep -oE "[\"']?$1[\"']?[[:space:]]*:[[:space:]]*[\"'][^\"']*[\"']" | head -n 1 | sed -E "s/^[^:]*:[[:space:]]*[\"']([^\"']*)[\"']\$/\\1/" || true
}

# ---- Docker ----------------------------------------------------------------------------------------------------

ensure_docker() {
  if detect_docker; then ok "Docker and the compose plugin are available"; return; fi
  command -v docker >/dev/null 2>&1 && die "Docker is installed but this user cannot use it or the compose plugin is missing. Add yourself to the docker group (sudo usermod -aG docker \$USER, then log in again) or install docker-compose-plugin."
  [ "$(uname -s)" = "Linux" ] || die "Docker is not installed. Install Docker Desktop or Docker Engine, then re-run."
  local id_like=""
  [ -r /etc/os-release ] && id_like="$(. /etc/os-release && echo "${ID:-} ${ID_LIKE:-}")"
  case "$id_like" in
    *ubuntu*|*debian*) ;;
    *) die "Docker is not installed and this is not Ubuntu/Debian. Install Docker Engine with the compose plugin (https://docs.docker.com/engine/install/), then re-run." ;;
  esac
  confirm "Docker is not installed. Install it now with the official script (https://get.docker.com)? This needs sudo." || die "Docker is required."
  local sudo_cmd=""
  [ "$(id -u)" -eq 0 ] || sudo_cmd="sudo"
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  $sudo_cmd sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
  $sudo_cmd systemctl enable --now docker >/dev/null 2>&1 || true
  detect_docker || die "Docker was installed but is not usable yet. Log out and in again (group membership), then re-run ./install.sh."
  ok "Docker installed"
}

# ---- Firebase service account and web config ----------------------------------------------------------------

load_service_account() {
  if [ -z "$SERVICE_ACCOUNT_FILE" ] && [ -n "$(env_get FIREBASE_SERVICE_ACCOUNT_BASE64)" ]; then
    ok "Keeping the Firebase service account already in $ENV_FILE"
    return
  fi
  ask SERVICE_ACCOUNT_FILE "Path to the Firebase service-account JSON (Firebase console > Project settings > Service accounts > Generate new private key)"
  SERVICE_ACCOUNT_FILE="${SERVICE_ACCOUNT_FILE/#\~/$HOME}"
  [ -r "$SERVICE_ACCOUNT_FILE" ] || die "cannot read $SERVICE_ACCOUNT_FILE"
  local json project_id
  json="$(cat "$SERVICE_ACCOUNT_FILE")"
  for field in project_id client_email private_key; do
    [ -n "$(json_field "$field" "$json")" ] || die "$SERVICE_ACCOUNT_FILE does not look like a service-account key (missing $field)"
  done
  project_id="$(json_field project_id "$json")"
  env_set FIREBASE_SERVICE_ACCOUNT_BASE64 "$(base64 <"$SERVICE_ACCOUNT_FILE" | tr -d '\n')"
  env_set FIREBASE_PROJECT_ID "$project_id"
  ok "Service account for project $project_id stored in $ENV_FILE"
}

load_web_config() {
  local text="$WEB_CONFIG" key value var
  [ -n "$text" ] && [ -r "$text" ] && text="$(cat "$text")"
  local keys=(apiKey authDomain projectId storageBucket messagingSenderId appId)
  local vars=(FIREBASE_WEB_API_KEY FIREBASE_WEB_AUTH_DOMAIN FIREBASE_WEB_PROJECT_ID FIREBASE_WEB_STORAGE_BUCKET FIREBASE_WEB_MESSAGING_SENDER_ID FIREBASE_WEB_APP_ID)
  local i missing=0
  for i in "${!keys[@]}"; do
    key="${keys[$i]}"; var="${vars[$i]}"
    value="${!var:-}"
    [ -z "$value" ] && [ -n "$text" ] && value="$(json_field "$key" "$text")"
    [ -z "$value" ] && value="$(env_get "$var")"
    printf -v "$var" '%s' "$value"
    [ -z "$value" ] && missing=1
  done
  if [ "$missing" -eq 1 ]; then
    [ "$INTERACTIVE" -eq 1 ] || die "Firebase web config is incomplete: pass --web-config or the FIREBASE_WEB_* variables"
    echo "Firebase console > Project settings > General > Your apps > Web app > SDK setup and configuration."
    echo "Paste the firebaseConfig block, then an empty line to finish (or just press Enter to type each value):"
    local pasted="" line
    while IFS= read -r line; do [ -z "$line" ] && break; pasted+="$line"$'\n'; done
    for i in "${!keys[@]}"; do
      key="${keys[$i]}"; var="${vars[$i]}"
      [ -n "${!var}" ] && continue
      value="$(json_field "$key" "$pasted")"
      if [ -z "$value" ]; then read -r -p "  $key: " value; fi
      [ -n "$value" ] || die "$key is required"
      printf -v "$var" '%s' "$value"
    done
  fi
  for i in "${!vars[@]}"; do env_set "${vars[$i]}" "${!vars[$i]}"; done
  ok "Firebase web config stored (public values)"
}

# ---- main ---------------------------------------------------------------------------------------------------------

ensure_docker

if [ -n "$GRANT_ONLY" ]; then
  [ -f "$ENV_FILE" ] || die "$ENV_FILE not found: run ./install.sh first"
  compose run --rm --no-deps app node dist-server/grant-super-admin.js "$GRANT_ONLY"
  exit 0
fi

if [ "$RULES_ONLY" -eq 1 ]; then
  [ -f "$ENV_FILE" ] || die "$ENV_FILE not found: run ./install.sh first"
  deploy_firebase_rules "$(env_get FIREBASE_PROJECT_ID)" || { print_rules_manual_hint "$(env_get FIREBASE_PROJECT_ID)"; exit 1; }
  exit 0
fi

command -v openssl >/dev/null 2>&1 || die "openssl is required (sudo apt-get install -y openssl)"

[ -f "$ENV_FILE" ] || { (umask 077; : >"$ENV_FILE"); }
chmod 600 "$ENV_FILE"

DOMAIN="${DOMAIN:-$(env_get DOMAIN)}"
ADMIN_EMAIL="${ADMIN_EMAIL:-$(env_get ADMIN_EMAIL)}"
ask DOMAIN "Domain the shop will live on (e.g. shop.example.in; DNS must already point to this server)"
DOMAIN="$(printf '%s' "$DOMAIN" | sed -E 's#^https?://##; s#/.*$##; s#^www\.##' | tr 'A-Z' 'a-z')"
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || die "'$DOMAIN' is not a valid domain name"
ask ADMIN_EMAIL "Your admin e-mail (becomes the super admin; also the Let's Encrypt contact)"
[[ "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "'$ADMIN_EMAIL' is not a valid e-mail address"

env_set DOMAIN "$DOMAIN"
env_set ADMIN_EMAIL "$ADMIN_EMAIL"
env_set VITE_SITE_URL "https://$DOMAIN"

load_service_account
load_web_config

# Generated once, never overwritten: SECRETS_ENCRYPTION_KEY encrypts the integration keys stored in the database.
if [ -z "$(env_get SECRETS_ENCRYPTION_KEY)" ]; then env_set SECRETS_ENCRYPTION_KEY "$(openssl rand -hex 32)"; ok "Generated SECRETS_ENCRYPTION_KEY"; fi
if [ -z "$(env_get CRON_SECRET)" ]; then env_set CRON_SECRET "$(openssl rand -hex 24)"; ok "Generated CRON_SECRET"; fi

PROJECT_ID="$(env_get FIREBASE_PROJECT_ID)"
[ "$PROJECT_ID" = "$(env_get FIREBASE_WEB_PROJECT_ID)" ] || warn "The service account is for project '$PROJECT_ID' but the web config is for '$(env_get FIREBASE_WEB_PROJECT_ID)'. They must be the same Firebase project."

info "Building and starting (the first build takes a few minutes)"
compose up -d --build

info "Waiting for the app to reach Firestore (/readyz)"
if wait_ready 180; then
  ok "App is ready"
else
  compose logs --tail 40 app || true
  die "The app did not become ready. Check the log above. Usual causes: the Firestore database was not created yet (Firebase console > Firestore Database > Create database, location asia-south1) or the service account belongs to another project. Fix it, then re-run ./install.sh."
fi

RULES_OK=1
if [ "$SKIP_RULES" -eq 0 ]; then
  info "Deploying Firestore and Storage rules and indexes"
  if deploy_firebase_rules "$PROJECT_ID"; then ok "Rules and indexes deployed"; else RULES_OK=0; warn "Rules deployment failed."; print_rules_manual_hint "$PROJECT_ID"; fi
fi

ADMIN_GRANTED=1
info "Granting the super-admin role to $ADMIN_EMAIL"
if compose run --rm --no-deps app node dist-server/grant-super-admin.js "$ADMIN_EMAIL"; then
  ok "$ADMIN_EMAIL is a super admin"
else
  ADMIN_GRANTED=0
fi

SUDO_PREFIX=""; [ "${DOCKER[0]}" = "sudo" ] && SUDO_PREFIX="sudo "
cat <<EOF

${BOLD}Vernox is running${RESET}

  Shop:   https://$DOMAIN
  Admin:  https://$DOMAIN/admin

EOF
if [ "$ADMIN_GRANTED" -eq 0 ]; then
  cat <<EOF
${BOLD}Admin access${RESET}: $ADMIN_EMAIL has not signed up yet. Open https://$DOMAIN, create the account with that
e-mail (verify it if asked), then run:
    ./install.sh --grant-admin $ADMIN_EMAIL
and sign out and in again.

EOF
fi
cat <<EOF
${BOLD}Do these once${RESET}
  1. DNS: an A (and AAAA) record for $DOMAIN, and optionally www.$DOMAIN, pointing at this server; ports 80 and 443 open.
     The HTTPS certificate is issued automatically on the first visit once DNS resolves.
  2. Firebase console > Authentication > Sign-in method: enable Google and/or Email/Password, and under Settings >
     Authorized domains add $DOMAIN.
  3. Open ${BOLD}Admin > Settings > Integrations${RESET} and add your keys (Razorpay, Shiprocket, Resend, MSG91, WhatsApp).
     Nothing needs a restart.
  4. Paste these webhook URLs into the provider dashboards:
       Razorpay   https://$DOMAIN/api/razorpay-webhook
       Shiprocket https://$DOMAIN/api/courier-webhook
       Meta (WhatsApp)  https://$DOMAIN/api/whatsapp-webhook
  5. Back up $ENV_FILE (it holds SECRETS_ENCRYPTION_KEY: without it the keys saved in the app cannot be read back).

Useful: ${SUDO_PREFIX}docker compose --env-file $ENV_FILE logs -f app    |    ./update.sh to upgrade
EOF
[ "$RULES_OK" -eq 1 ] || echo "${YELLOW}Reminder: deploy the Firestore/Storage rules (see above) before opening the shop.${RESET}"
