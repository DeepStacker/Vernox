#!/usr/bin/env bash
# Shared helpers for install.sh and update.sh. Sourced, never run directly.
# shellcheck shell=bash

ENV_FILE="${ENV_FILE:-.env.production}"
FIREBASE_TOOLS_VERSION="${FIREBASE_TOOLS_VERSION:-latest}"
NODE_IMAGE="${NODE_IMAGE:-node:20-alpine}"

if [ -t 1 ]; then BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'; else BOLD=''; RED=''; GREEN=''; YELLOW=''; RESET=''; fi
info() { printf '%s==>%s %s\n' "$BOLD" "$RESET" "$*"; }
ok()   { printf '%s ok%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%swarning:%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die()  { printf '%serror:%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

# ---- docker ------------------------------------------------------------------------------------------------

DOCKER=(docker)

# Picks `docker` or `sudo docker` depending on whether this user may talk to the daemon.
detect_docker() {
  command -v docker >/dev/null 2>&1 || return 1
  if docker info >/dev/null 2>&1; then DOCKER=(docker)
  elif command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then DOCKER=(sudo docker)
  else return 1; fi
  "${DOCKER[@]}" compose version >/dev/null 2>&1
}

compose() { "${DOCKER[@]}" compose --env-file "$ENV_FILE" "$@"; }

# ---- .env.production ---------------------------------------------------------------------------------------

env_get() { # env_get KEY -> value of KEY in $ENV_FILE (empty if absent)
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true
}

env_set() { # env_set KEY VALUE: replaces or appends; every other line is left alone
  local tmp
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  { [ -f "$ENV_FILE" ] && grep -v -E "^$1=" "$ENV_FILE" || true; printf '%s=%s\n' "$1" "$2"; } >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

# ---- waiting for the app -----------------------------------------------------------------------------------

wait_ready() { # wait_ready [seconds]: polls /readyz inside the app container
  local limit="${1:-150}" waited=0
  while [ "$waited" -lt "$limit" ]; do
    if compose exec -T app node -e "fetch('http://127.0.0.1:3001/readyz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3; waited=$((waited + 3))
  done
  return 1
}

# ---- Firestore + Storage rules and indexes -------------------------------------------------------------------

# Runs firebase-tools in a throwaway Node container, so the host needs nothing but Docker.
# Uses the service account stored in $ENV_FILE, written to a private temp directory that is removed afterwards.
deploy_firebase_rules() { # deploy_firebase_rules PROJECT_ID
  local project="$1" work status=0
  work="$(mktemp -d)"
  chmod 700 "$work"
  # Only the rules files go into the container, in a scratch copy: firebase-tools writes logs next to firebase.json.
  cp firebase.json firestore.rules firestore.indexes.json storage.rules "$work/"
  env_get FIREBASE_SERVICE_ACCOUNT_BASE64 | base64 -d >"$work/credentials.json" 2>/dev/null || { rm -rf "$work"; return 1; }
  chmod 644 "$work/credentials.json" # readable by the container user; the directory itself is 700 and removed below
  "${DOCKER[@]}" run --rm \
    -u "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
    -v "$work:/work" -w /work \
    -e GOOGLE_APPLICATION_CREDENTIALS=/work/credentials.json \
    "$NODE_IMAGE" \
    npx --yes "firebase-tools@${FIREBASE_TOOLS_VERSION}" deploy --only firestore,storage \
      --project "$project" --non-interactive || status=$?
  rm -rf "$work"
  return "$status"
}

print_rules_manual_hint() {
  cat <<EOF
  The rules were not deployed. Until they are, the database is not protected the way the app expects.
  Deploy them from any machine with the Firebase CLI:
    firebase deploy --only firestore,storage --project $1
  or re-run:  ./install.sh --rules-only
  (the service account needs the "Firebase Rules Admin" and "Cloud Datastore Index Admin" roles).
EOF
}
