#!/usr/bin/env bash
# Gentle rate-limit probe for a single endpoint.
#
# Fires requests at 1 per second (never a burst) until the first 429 or a
# hard cap of 8 requests, then STOPS and waits out the 10s window. This is
# for discovering a limit, never for stressing the service. Do not loop this
# script and do not lower the sleep below 1s.
#
# Usage: scripts/probe-rate-limits.sh <url>
set -u
URL="${1:?usage: probe-rate-limits.sh <url>}"
MAX=8
echo "probing $URL (max $MAX requests, 1/s, stop at first 429)"
for i in $(seq 1 "$MAX"); do
  out=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL")
  echo "request $i -> HTTP $out"
  if [ "$out" = "429" ]; then
    echo "limit found at request $i; stopping and waiting 10s out of respect"
    sleep 10
    exit 0
  fi
  sleep 1
done
echo "no 429 within $MAX requests at 1/s; either the limit is higher or measured per longer window. stop here."
