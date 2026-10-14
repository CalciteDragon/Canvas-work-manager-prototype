#!/usr/bin/env bash
# Start one isolated audit environment: a prototype host on its own port with its own scratch
# data file, plus a walkthrough daemon. Run in the background; both exit when killed.
# Usage: env.sh <name> <hostPort> <ctlPort> [daemon args...]
set -u
NAME=$1; HOSTPORT=$2; CTL=$3; shift 3
RIG=$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)
REPO=$(cd "$(dirname "$0")/../../../.." && pwd -W 2>/dev/null || pwd)
OUT="$REPO/apps/e2e/ux-output/walk-env"
DATA="$OUT/$NAME.json"
mkdir -p "$OUT"
cp "$REPO/prototype/seeds/empty.json" "$DATA"
cd "$REPO"
CWM_HOST_PORT=$HOSTPORT CWM_DATA_FILE="$(cd "$(dirname "$DATA")" && pwd -W)/$NAME.json" pnpm --filter @cwm/prototype-host start > "$OUT/$NAME-host.log" 2>&1 &
HOSTPID=$!
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$HOSTPORT/prototype/state" > /dev/null && break; sleep 1; done
node "$RIG/walkd.mjs" --name "$NAME" --host "$HOSTPORT" --ctl "$CTL" "$@" > "$OUT/$NAME-walkd.log" 2>&1 &
WALKPID=$!
trap 'kill $HOSTPID $WALKPID 2>/dev/null' EXIT INT TERM
wait $WALKPID
