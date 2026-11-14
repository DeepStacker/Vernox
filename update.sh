#!/usr/bin/env bash
# Upgrade a running install: fetch the new code, rebuild the image, restart the app, wait until it is ready.
# Caddy keeps the connection for up to 15 s while the app restarts (deploy/Caddyfile), so visitors see a short
# pause at most. Secrets and answers in .env.production are untouched.
#
#   ./update.sh                          # git pull --ff-only, then rebuild and restart
#   ./update.sh --tarball release.tgz    # unpack a new release over this folder instead (no git needed)
#   ./update.sh --rules                  # also redeploy Firestore/Storage rules and indexes
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=deploy/lib.sh
. deploy/lib.sh

TARBALL=""; WITH_RULES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --tarball) TARBALL="${2:?--tarball needs a file}"; shift 2 ;;
    --rules) WITH_RULES=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found: run ./install.sh first"
detect_docker || die "Docker with the compose plugin is required"

if [ -n "$TARBALL" ]; then
  [ -r "$TARBALL" ] || die "cannot read $TARBALL"
  info "Unpacking $TARBALL"
  # A release archive has one top-level folder; .env.production is not part of it, so it survives.
  tar -xzf "$TARBALL" --strip-components=1
elif [ -d .git ]; then
  command -v git >/dev/null 2>&1 || die "git is required to update from a clone"
  if git symbolic-ref -q HEAD >/dev/null; then
    info "Pulling the latest code"
    git pull --ff-only
  else
    # A rollback (`git checkout <previous commit>`) leaves HEAD detached: rebuild that commit as it is.
    info "Pinned to $(git rev-parse --short HEAD); rebuilding it without pulling (git switch main to follow updates again)"
  fi
else
  die "this folder is not a git clone: use ./update.sh --tarball <release.tgz>"
fi

info "Rebuilding the image"
compose build app

info "Restarting the app"
compose up -d --no-deps app
compose up -d # Caddy, if its image or config changed

info "Waiting for /readyz"
if wait_ready 150; then ok "Updated and ready"; else compose logs --tail 40 app || true; die "The new version did not become ready; the log is above. Roll back with: git checkout <previous commit> && ./update.sh"; fi

if [ "$WITH_RULES" -eq 1 ]; then
  info "Deploying Firestore and Storage rules and indexes"
  deploy_firebase_rules "$(env_get FIREBASE_PROJECT_ID)" || { warn "Rules deployment failed."; print_rules_manual_hint "$(env_get FIREBASE_PROJECT_ID)"; }
fi

"${DOCKER[@]}" image prune -f >/dev/null 2>&1 || true
