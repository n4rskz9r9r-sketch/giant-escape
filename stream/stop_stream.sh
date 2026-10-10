#!/usr/bin/env bash
# 거인과 도망자 송출 중지: 감시 루프 → ffmpeg → Chrome → Xvfb 순서로 종료 (게임 서버·터널은 건드리지 않음)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; STATE_DIR="${STREAM_STATE_DIR:-$HOME/.cache/giant-escape-stream}"; RUN_DIR="$STATE_DIR/run"; PROFILE="$STATE_DIR/chrome-profile"  # 웹 루트(터널로 공개됨) 밖에 보관
Q=0; [ "${1:-}" = "--quiet" ] && Q=1
mkdir -p "$STATE_DIR/logs"
say() { [ "$Q" -eq 1 ] || echo "$*"; echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$STATE_DIR/logs/stream.log"; }
stop_pid() { local f="$RUN_DIR/$1.pid"; [ -f "$f" ] || return 0; local p; p=$(cat "$f"); if kill -0 "$p" 2>/dev/null; then kill "$p" 2>/dev/null; for _ in $(seq 1 30); do kill -0 "$p" 2>/dev/null || break; sleep 0.2; done; kill -9 "$p" 2>/dev/null; say "$1 중지 (PID $p)"; fi; rm -f "$f"; }
stop_pid supervisor
stop_pid ffmpeg
stop_pid chrome
pkill -f -- "--user-data-dir=$PROFILE" 2>/dev/null && sleep 1
pkill -9 -f -- "--user-data-dir=$PROFILE" 2>/dev/null
stop_pid xvfb
say "송출 파이프라인 중지 완료"
