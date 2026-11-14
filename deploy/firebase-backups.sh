#!/usr/bin/env bash
# Turns on Firestore point-in-time recovery (7 days, per-minute) and a daily managed backup kept 14 days for
# the given Firebase project. Both need the Blaze plan; the command says so if billing is off. Safe to re-run:
# an existing daily schedule is left as it is.
#
#   ./deploy/firebase-backups.sh vernox-shop [--account you@example.com]
#
# Runs from any machine with the Firebase CLI signed in to an owner of the project (not from the VM).
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=deploy/lib.sh
. deploy/lib.sh

PROJECT="${1:-}"
[ -n "$PROJECT" ] || die "usage: $0 <firebase-project-id> [--account email]"
shift
command -v firebase >/dev/null 2>&1 || die "the Firebase CLI is not installed (npm i -g firebase-tools)"
FB=(firebase --project "$PROJECT" "$@")

info "Point-in-time recovery on project $PROJECT"
"${FB[@]}" firestore:databases:update "(default)" --point-in-time-recovery ENABLED >/dev/null \
  || die "could not enable point-in-time recovery (is the project on the Blaze plan?)"
ok "point-in-time recovery enabled (any minute of the last 7 days can be read back)"

info "Daily backup schedule"
if "${FB[@]}" firestore:backups:schedules:list --database "(default)" 2>/dev/null | grep -qi daily; then
  ok "a daily schedule already exists"
else
  "${FB[@]}" firestore:backups:schedules:create --database "(default)" --recurrence DAILY --retention 14d >/dev/null \
    || die "could not create the daily backup schedule"
  ok "daily backups kept for 14 days"
fi
rm -f firebase-debug.log
