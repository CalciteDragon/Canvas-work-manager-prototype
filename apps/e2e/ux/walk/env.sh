#!/usr/bin/env bash
# Start one isolated audit environment: a prototype host on its own port with its own scratch
# data file, plus a walkthrough daemon. Both exit when this script is killed.
# Usage: env.sh [--print-paths] <name> <hostPort> <ctlPort> [daemon args...]
#   --print-paths prints the paths it would use (out=, data=, hostLog=, walkdLog=) and exits.
# Works under Git Bash on Windows (`pwd -W`) and on Linux/macOS (`pwd`). From a foreground-only
# session start it detached and stop it with `walk.mjs <ctl> quit` plus a kill of its process group:
#   setsid bash apps/e2e/ux/walk/env.sh w1 4322 5322 >log 2>&1 </dev/null &
set -u
PRINT=0
if [ "${1:-}" = "--print-paths" ]; then PRINT=1; shift; fi
NAME=$1; HOSTPORT=$2; CTL=$3; shift 3
abs() { (cd "$1" && { pwd -W 2>/dev/null || pwd; }); }
RIG=$(abs "$(dirname "$0")")
REPO=$(abs "$(dirname "$0")/../../../..")
OUT="$REPO/apps/e2e/ux-output/walk-env"
DATA="$OUT/$NAME.json"
if [ "$PRINT" = 1 ]; then
  printf 'out=%s\ndata=%s\nhostLog=%s\nwalkdLog=%s\n' "$OUT" "$DATA" "$OUT/$NAME-host.log" "$OUT/$NAME-walkd.log"
  exit 0
fi
mkdir -p "$OUT"
cp "$REPO/prototype/seeds/empty.json" "$DATA"
cd "$REPO"
CWM_HOST_PORT=$HOSTPORT CWM_DATA_FILE="$DATA" pnpm --filter @cwm/prototype-host start > "$OUT/$NAME-host.log" 2>&1 &
HOSTPID=$!
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$HOSTPORT/prototype/state" > /dev/null && break; sleep 1; done
node "$RIG/walkd.mjs" --name "$NAME" --host "$HOSTPORT" --ctl "$CTL" "$@" > "$OUT/$NAME-walkd.log" 2>&1 &
WALKPID=$!
trap 'kill $HOSTPID $WALKPID 2>/dev/null' EXIT INT TERM
wait $WALKPID
