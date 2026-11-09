#!/bin/bash
set -euo pipefail

DATA="$HOME/.civicwatch"
for service in web api; do
  pid_file="$DATA/$service.pid"
  if [[ -f "$pid_file" ]]; then
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      child_pids="$(pgrep -P "$pid" || true)"
      if [[ -n "$child_pids" ]]; then
        kill $child_pids 2>/dev/null || true
      fi
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
done

# Fallback cleanup for the two ports reserved by CivicWatch.
for port in 5173 8000; do
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    kill $pids 2>/dev/null || true
  fi
done

echo "CivicWatch stop requested."
