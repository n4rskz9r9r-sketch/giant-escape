#!/usr/bin/env bash
# 거인과 도망자 3D — 라이브 송출 파이프라인 (YouTube · SOOP · 아무 RTMP 서버)
#   Xvfb(가상 화면) → Chrome 키오스크(방송 모드 ?stream=1) → ffmpeg x11grab → RTMP
#
# 사용법:
#   YOUTUBE_STREAM_KEY=... ./start_stream.sh        # YouTube 송출 (백그라운드 감시 프로세스로 실행)
#   ./start_stream.sh --env ~/.cache/giant-escape-stream/soop.env   # 설정 파일의 STREAM_URL/STREAM_KEY 로 송출 (SOOP 등)
#   STREAM_URL=rtmp://서버/app STREAM_KEY=... ./start_stream.sh     # 환경 변수로 아무 RTMP 서버에 송출
#      설정 파일 형식(웹 루트 밖, chmod 600):  STREAM_URL=rtmp://stream.soop.live/app   STREAM_KEY=...
#      최종 주소 = STREAM_URL/STREAM_KEY
#   ./start_stream.sh --test [초]                    # 테스트: YouTube 대신 ~/.cache/giant-escape-stream/test.mp4 로 녹화 (기본 20초)
#   ./stop_stream.sh                                 # 중지
#
# 환경 변수(선택): STREAM_RES=1280x720  STREAM_FPS=30  STREAM_BITRATE=3500k  DISPLAY_NUM=99
#                  GAME_URL="http://localhost:8765/?stream=1&q=0.75"   (q=렌더 배율, &shadow=0 그림자 끄기)
# 스트림 키는 화면/로그/디스크 어디에도 쓰지 않습니다 (로그는 키를 가린 채 저장).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${STREAM_STATE_DIR:-$HOME/.cache/giant-escape-stream}"; LOG_DIR="$STATE_DIR/logs"; RUN_DIR="$STATE_DIR/run"; PROFILE="$STATE_DIR/chrome-profile"  # 웹 루트(터널로 공개됨) 밖에 보관
mkdir -p "$LOG_DIR" "$RUN_DIR"
RES="${STREAM_RES:-1280x720}"; FPS="${STREAM_FPS:-30}"; BITRATE="${STREAM_BITRATE:-3500k}"
DISPLAY_NUM="${DISPLAY_NUM:-99}"; DISP=":$DISPLAY_NUM"
GAME_URL="${GAME_URL:-http://localhost:8765/?stream=1&q=0.75}"
# 3D 렌더 백엔드: gl = Mesa llvmpipe(기본, swiftshader보다 약 2배 빠르고 CPU 절반), swiftshader = 대체용
CHROME_GL="${CHROME_GL:-gl}"
export LP_NUM_THREADS="${LP_NUM_THREADS:-4}"   # llvmpipe 렌더 스레드 수 상한
# --env 파일: 셸로 실행하지 않고 STREAM_URL / STREAM_KEY 두 줄만 읽음 (권한이 600 이 아니면 거부)
if [ "${1:-}" = "--env" ]; then STREAM_ENV_FILE="${2:-}"; shift 2 || true; export STREAM_ENV_FILE; fi
if [ -n "${STREAM_ENV_FILE:-}" ]; then
  [ -f "$STREAM_ENV_FILE" ] || { echo "오류: 설정 파일이 없습니다: $STREAM_ENV_FILE" >&2; exit 1; }
  [ "$(stat -c %a "$STREAM_ENV_FILE")" = "600" ] || { echo "오류: $STREAM_ENV_FILE 권한을 600 으로 하세요 (chmod 600)" >&2; exit 1; }
  STREAM_URL="$(sed -n 's/^[[:space:]]*STREAM_URL=//p' "$STREAM_ENV_FILE" | tail -1 | tr -d '\r"'"'"' ')"
  STREAM_KEY="$(sed -n 's/^[[:space:]]*STREAM_KEY=//p' "$STREAM_ENV_FILE" | tail -1 | tr -d '\r"'"'"' ')"
fi
# 송출 대상: STREAM_URL+STREAM_KEY(일반 RTMP) 우선, 없으면 YOUTUBE_STREAM_KEY(YouTube)
if [ -n "${STREAM_KEY:-}" ]; then
  RTMP_BASE="${STREAM_URL:-${RTMP_BASE:-rtmp://a.rtmp.youtube.com/live2}}"; OUT_KEY="$STREAM_KEY"
else
  RTMP_BASE="${RTMP_BASE:-rtmp://a.rtmp.youtube.com/live2}"; OUT_KEY="${YOUTUBE_STREAM_KEY:-}"   # RTMP_BASE 는 로컬 점검용으로만 바꾸세요
fi
RTMP_BASE="${RTMP_BASE%/}"
export REDACT_KEY="$OUT_KEY"
W="${RES%x*}"; H="${RES#*x}"
BUF="$(( ${BITRATE%k} * 2 ))k"; GOP="$(( FPS * 2 ))"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" | redact | tee -a "$LOG_DIR/stream.log" >&2; }
# 키 가리기: 환경 변수의 키 문자열 + rtmp 주소 뒤쪽을 모두 마스킹 (키는 perl 인자로 넘기지 않음)
redact() { perl -pe 'BEGIN{ $k = $ENV{REDACT_KEY} // ""; $|=1 } s/\Q$k\E/***REDACTED***/g if length $k; s#(rtmps?://[^/\s]+/[^/\s]+/)[^\s"'"'"']+#$1***REDACTED***#g'; }

find_chrome() { for c in google-chrome google-chrome-stable chromium chromium-browser; do command -v "$c" >/dev/null 2>&1 && { command -v "$c"; return 0; }; done; return 1; }

ensure_deps() {
  local missing=()
  command -v ffmpeg >/dev/null || missing+=(ffmpeg)
  command -v Xvfb >/dev/null || missing+=(xvfb)
  command -v perl >/dev/null || missing+=(perl)
  find_chrome >/dev/null || missing+=(chromium)
  if ((${#missing[@]})); then
    log "필요한 패키지 설치: ${missing[*]}"
    if command -v apt-get >/dev/null && sudo -n true 2>/dev/null; then
      sudo -n apt-get update -qq && sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${missing[@]}" || { log "패키지 설치 실패"; exit 1; }
    else log "오류: ${missing[*]} 이(가) 없고 자동 설치할 수 없습니다"; exit 1; fi
  fi
}

check_game() {
  local base="${GAME_URL%%\?*}"
  curl -sf -o /dev/null --max-time 5 "$base" || { log "오류: 게임 서버($base)에 연결할 수 없습니다. python3 -m http.server 8765 가 실행 중인지 확인하세요."; exit 1; }
}

start_xvfb() {
  if [ -S "/tmp/.X11-unix/X$DISPLAY_NUM" ] && [ -f "$RUN_DIR/xvfb.pid" ] && kill -0 "$(cat "$RUN_DIR/xvfb.pid")" 2>/dev/null; then return 0; fi
  # 우리 Xvfb 가 죽고 소켓·잠금 파일만 남은 경우 정리 (감시 루프가 다시 띄울 수 있게)
  if [ -f "$RUN_DIR/xvfb.pid" ] && ! kill -0 "$(cat "$RUN_DIR/xvfb.pid")" 2>/dev/null; then
    lp=$(cat "/tmp/.X$DISPLAY_NUM-lock" 2>/dev/null | tr -d ' '); if [ -z "$lp" ] || ! kill -0 "$lp" 2>/dev/null; then rm -f "/tmp/.X11-unix/X$DISPLAY_NUM" "/tmp/.X$DISPLAY_NUM-lock"; fi; rm -f "$RUN_DIR/xvfb.pid"
  fi
  if [ -S "/tmp/.X11-unix/X$DISPLAY_NUM" ]; then log "오류: 디스플레이 $DISP 를 이미 다른 프로그램이 쓰고 있습니다 (DISPLAY_NUM 으로 변경 가능)"; exit 1; fi
  Xvfb "$DISP" -screen 0 "${W}x${H}x24" -nolisten tcp -noreset >>"$LOG_DIR/xvfb.log" 2>&1 &
  echo $! > "$RUN_DIR/xvfb.pid"
  for _ in $(seq 1 50); do [ -S "/tmp/.X11-unix/X$DISPLAY_NUM" ] && break; sleep 0.1; done
  [ -S "/tmp/.X11-unix/X$DISPLAY_NUM" ] || { log "오류: Xvfb 시작 실패"; exit 1; }
  log "Xvfb $DISP (${W}x${H}) 시작"
}

start_chrome() {
  if [ -f "$RUN_DIR/chrome.pid" ] && kill -0 "$(cat "$RUN_DIR/chrome.pid")" 2>/dev/null; then return 0; fi
  local chrome; chrome="$(find_chrome)"
  mkdir -p "$PROFILE"
  # 비정상 종료 후 '페이지 복구' 말풍선이 뜨지 않게
  [ -f "$PROFILE/Default/Preferences" ] && sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "$PROFILE/Default/Preferences" 2>/dev/null
  local pin=(); [ -n "${CHROME_CPUS:-}" ] && command -v taskset >/dev/null && pin=(taskset -c "$CHROME_CPUS")
  DISPLAY="$DISP" "${pin[@]}" "$chrome" \
    --user-data-dir="$PROFILE" --lang=ko --no-first-run --no-default-browser-check --password-store=basic \
    --kiosk --window-position=0,0 --window-size="$W,$H" --hide-scrollbars \
    --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-features=Translate,MediaRouter \
    --use-gl=angle --use-angle="$CHROME_GL" --enable-unsafe-swiftshader --ignore-gpu-blocklist \
    --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows \
    --autoplay-policy=no-user-gesture-required --mute-audio \
    ${CHROME_EXTRA_FLAGS:-} "$GAME_URL" >>"$LOG_DIR/chrome.log" 2>&1 &
  echo $! > "$RUN_DIR/chrome.pid"
  log "Chrome 키오스크 시작 → $GAME_URL"
}

ffmpeg_args() { # $@ = 출력 인자
  echo -hide_banner -loglevel warning -nostdin \
    -thread_queue_size 1024 -f x11grab -draw_mouse 0 -framerate "$FPS" -video_size "${W}x${H}" -i "$DISP.0+0,0" \
    -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" \
    -map 0:v -map 1:a \
    -c:v libx264 -preset veryfast -b:v "$BITRATE" -maxrate "$BITRATE" -bufsize "$BUF" \
    -pix_fmt yuv420p -g "$GOP" -keyint_min "$GOP" -sc_threshold 0 -r "$FPS" \
    -c:a aac -b:a 128k -ar 44100
}

# ffmpeg -progress 를 파이프로 받아 마지막 상태만 파일에 덮어씀 (frame/fps/bitrate/total_size/out_time/speed — 주소·키 없음)
progress_keeper() { local f="$RUN_DIR/progress.txt" blk=""; while IFS= read -r l; do blk+="$l"$'\n'; case "$l" in progress=*) printf '%s' "updated=$(ts)"$'\n'"$blk" > "$f.tmp" && mv -f "$f.tmp" "$f"; blk="";; esac; done; }
calc() { awk "BEGIN{ printf \"%.4f\", $* }"; }
proc_ticks() { # 주어진 PID들의 누적 CPU 틱 합
  local t=0 p f
  for p in "$@"; do f="/proc/$p/stat"; [ -r "$f" ] || continue; t=$(( t + $(awk '{print $14+$15}' "$f" 2>/dev/null || echo 0) )); done
  echo "$t"
}
chrome_pids() { pgrep -f -- "--user-data-dir=$PROFILE" | tr '\n' ' '; }

# ---------------- 테스트 모드 ----------------
if [ "${1:-}" = "--test" ]; then
  SECS="${2:-20}"
  ensure_deps; check_game
  if [ -f "$RUN_DIR/supervisor.pid" ] && kill -0 "$(cat "$RUN_DIR/supervisor.pid")" 2>/dev/null; then log "오류: 실제 송출이 실행 중입니다. 먼저 ./stop_stream.sh"; exit 1; fi
  start_xvfb; start_chrome
  log "페이지 로딩 대기 (10초)…"; sleep 10
  OUT="$STATE_DIR/test.mp4"; rm -f "$OUT"
  HZ=$(getconf CLK_TCK); NCPU=$(nproc)
  C0=$(proc_ticks $(chrome_pids)); X0=$(proc_ticks "$(cat "$RUN_DIR/xvfb.pid")"); T0=$(date +%s.%N)
  log "테스트 녹화 ${SECS}초 → $OUT"
  # shellcheck disable=SC2046
  ffmpeg $(ffmpeg_args) -t "$SECS" -movflags +faststart "$OUT" -y 2>&1 | redact >>"$LOG_DIR/ffmpeg-test.log" &
  FF_PID=$!; sleep 2; FFP=$(pgrep -n -x ffmpeg); F0=$(proc_ticks "$FFP")
  sleep $(( SECS - 4 )); F1=$(proc_ticks "$FFP"); C1=$(proc_ticks $(chrome_pids)); X1=$(proc_ticks "$(cat "$RUN_DIR/xvfb.pid")"); T1=$(date +%s.%N)
  wait "$FF_PID"
  EL=$(calc "$T1 - $T0")
  CH=$(calc "($C1-$C0)/$HZ/$EL*100"); XV=$(calc "($X1-$X0)/$HZ/$EL*100"); FF=$(calc "($F1-$F0)/$HZ/($SECS-4)*100")
  printf -v CPU 'CPU 사용(코어 1개=100%%, 총 %d코어): Chrome %.0f%%, ffmpeg %.0f%%, Xvfb %.0f%% → 합계 %.0f%% (전체의 %.0f%%)' "$NCPU" "$CH" "$FF" "$XV" "$(calc "$CH+$FF+$XV")" "$(calc "($CH+$FF+$XV)/$NCPU")"
  log "$CPU"
  log "로드 평균: $(cut -d' ' -f1-3 /proc/loadavg)"
  if [ -s "$OUT" ]; then
    DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")
    INFO=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,avg_frame_rate,pix_fmt -of csv=p=0 "$OUT")
    AINFO=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels -of csv=p=0 "$OUT")
    FR=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$OUT")
    ffmpeg -v error -ss "$(calc "$DUR*0.75")" -i "$OUT" -frames:v 1 -y "$STATE_DIR/test_frame.png"
    YAVG=$(ffmpeg -v info -i "$STATE_DIR/test_frame.png" -vf signalstats,metadata=print:key=lavfi.signalstats.YAVG -f null - 2>&1 | grep -o 'YAVG=[0-9.]*' | head -1)
    log "결과: $OUT 길이 ${DUR}s, 영상 $INFO, 프레임 $FR, 오디오 $AINFO"
    log "프레임: $STATE_DIR/test_frame.png ($YAVG — 0에 가까우면 검은 화면)"
  else log "오류: 테스트 영상이 만들어지지 않았습니다 (logs/ffmpeg-test.log 확인)"; fi
  "$DIR/stop_stream.sh" --quiet
  exit 0
fi

# ---------------- 감시 루프 (내부용) ----------------
if [ "${1:-}" = "--supervise" ]; then
  echo $$ > "$RUN_DIR/supervisor.pid"
  STOP=0; trap 'STOP=1; [ -n "${FFPID:-}" ] && kill "$FFPID" 2>/dev/null' TERM INT
  BACKOFF=5; sleep 10
  while [ "$STOP" -eq 0 ]; do
    start_xvfb; start_chrome
    log "ffmpeg 송출 시작 (${W}x${H} ${FPS}fps ${BITRATE}) → $RTMP_BASE/<키>"
    START=$(date +%s)
    # shellcheck disable=SC2046
    ffmpeg $(ffmpeg_args) -stats_period 2 -progress pipe:3 -f flv "$RTMP_BASE/$OUT_KEY" 2> >(redact >>"$LOG_DIR/ffmpeg.log") 3> >(progress_keeper) &
    FFPID=$!; echo "$FFPID" > "$RUN_DIR/ffmpeg.pid"
    # ffmpeg 가 도는 동안 5초마다 Chrome 생존 확인 (죽으면 다시 띄움 — 송출은 끊지 않음)
    while [ "$STOP" -eq 0 ] && kill -0 "$FFPID" 2>/dev/null; do
      sleep 5 & wait $!
      if ! { [ -f "$RUN_DIR/chrome.pid" ] && kill -0 "$(cat "$RUN_DIR/chrome.pid")" 2>/dev/null; }; then log "Chrome 이 종료됨 → 재시작"; start_chrome; fi
    done
    wait "$FFPID"; CODE=$?; FFPID=""
    [ "$STOP" -eq 1 ] && break
    RAN=$(( $(date +%s) - START )); [ "$RAN" -gt 30 ] && BACKOFF=5
    log "ffmpeg 종료 (코드 $CODE, ${RAN}초 동안 송출). ${BACKOFF}초 후 재시작"
    sleep "$BACKOFF"; BACKOFF=$(( BACKOFF * 2 > 60 ? 60 : BACKOFF * 2 ))
  done
  log "감시 루프 종료"; rm -f "$RUN_DIR/supervisor.pid" "$RUN_DIR/ffmpeg.pid"
  exit 0
fi

# ---------------- 실제 송출 시작 ----------------
if [ -z "${OUT_KEY:-}" ]; then
  echo "오류: 스트림 키가 없습니다. 예) YOUTUBE_STREAM_KEY=xxxx $0  /  $0 --env ~/.cache/giant-escape-stream/soop.env  /  STREAM_URL=rtmp://… STREAM_KEY=… $0" >&2
  echo "      (송출 없이 점검하려면: $0 --test)" >&2
  exit 1
fi
if [ -f "$RUN_DIR/supervisor.pid" ] && kill -0 "$(cat "$RUN_DIR/supervisor.pid")" 2>/dev/null; then echo "이미 송출 중입니다 (중지: $DIR/stop_stream.sh)" >&2; exit 1; fi
ensure_deps; check_game
start_xvfb; start_chrome
setsid nohup "$0" --supervise >/dev/null 2>&1 < /dev/null &
sleep 1
log "송출 대상: $RTMP_BASE/<키>"
log "송출 시작됨: 감시 PID $(cat "$RUN_DIR/supervisor.pid" 2>/dev/null || echo '?'), 로그 $LOG_DIR/ (중지: $DIR/stop_stream.sh)"
