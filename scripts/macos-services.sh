#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$ROOT_DIR/.run/logs"
UID_VALUE="$(id -u)"

BOT_LABEL="us.mcbn.tracker-bot"
WEB_LABEL="us.mcbn.web-dev"
BOT_PLIST="$LAUNCH_AGENTS_DIR/$BOT_LABEL.plist"
WEB_PLIST="$LAUNCH_AGENTS_DIR/$WEB_LABEL.plist"
BOT_TEMPLATE="$ROOT_DIR/infra/bot-hosting/launchd/$BOT_LABEL.plist.template"
WEB_TEMPLATE="$ROOT_DIR/infra/web-hosting/launchd/$WEB_LABEL.plist.template"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/macos-services.sh install [bot|web|all]
  ./scripts/macos-services.sh start [bot|web|all]
  ./scripts/macos-services.sh stop [bot|web|all]
  ./scripts/macos-services.sh restart [bot|web|all]
  ./scripts/macos-services.sh status [bot|web|all]
  ./scripts/macos-services.sh logs [bot|web] [out|err]
  ./scripts/macos-services.sh uninstall [bot|web|all]
EOF
}

ensure_dirs() {
  mkdir -p "$LAUNCH_AGENTS_DIR"
  mkdir -p "$LOG_DIR"
}

render_template() {
  local template_path="$1"
  local output_path="$2"
  local out_log="$3"
  local err_log="$4"

  sed \
    -e "s#/ABSOLUTE/PATH/TO/mcbn-xp-tracker#$ROOT_DIR#g" \
    -e "s#/tmp/mcbn-tracker-bot.out.log#$out_log#g" \
    -e "s#/tmp/mcbn-tracker-bot.err.log#$err_log#g" \
    -e "s#/tmp/mcbn-web-dev.out.log#$out_log#g" \
    -e "s#/tmp/mcbn-web-dev.err.log#$err_log#g" \
    "$template_path" > "$output_path"
}

bootout_if_loaded() {
  local label="$1"
  launchctl bootout "gui/$UID_VALUE/$label" >/dev/null 2>&1 || true
}

bootstrap_agent() {
  local plist_path="$1"
  launchctl bootstrap "gui/$UID_VALUE" "$plist_path"
}

start_agent() {
  local label="$1"
  launchctl kickstart -k "gui/$UID_VALUE/$label"
}

is_loaded() {
  local label="$1"
  launchctl print "gui/$UID_VALUE/$label" >/dev/null 2>&1
}

ensure_loaded() {
  local label="$1"
  local plist_path="$2"
  if ! is_loaded "$label"; then
    bootstrap_agent "$plist_path"
  fi
}

install_bot() {
  ensure_dirs
  render_template "$BOT_TEMPLATE" "$BOT_PLIST" "$LOG_DIR/bot.out.log" "$LOG_DIR/bot.err.log"
  bootout_if_loaded "$BOT_LABEL"
  bootstrap_agent "$BOT_PLIST"
  start_agent "$BOT_LABEL"
}

install_web() {
  ensure_dirs
  render_template "$WEB_TEMPLATE" "$WEB_PLIST" "$LOG_DIR/web.out.log" "$LOG_DIR/web.err.log"
  bootout_if_loaded "$WEB_LABEL"
  bootstrap_agent "$WEB_PLIST"
  start_agent "$WEB_LABEL"
}

stop_agent() {
  local label="$1"
  bootout_if_loaded "$label"
}

status_agent() {
  local label="$1"
  launchctl print "gui/$UID_VALUE/$label" >/dev/null 2>&1 \
    && echo "$label: loaded" \
    || echo "$label: not loaded"
}

uninstall_agent() {
  local label="$1"
  local plist_path="$2"
  stop_agent "$label"
  rm -f "$plist_path"
}

tail_logs() {
  local target="$1"
  local stream="${2:-out}"
  local logfile=""
  if [[ "$target" == "bot" ]]; then
    logfile="$LOG_DIR/bot.$stream.log"
  elif [[ "$target" == "web" ]]; then
    logfile="$LOG_DIR/web.$stream.log"
  else
    echo "logs target must be 'bot' or 'web'" >&2
    exit 1
  fi

  if [[ ! -f "$logfile" ]]; then
    echo "Log file not found: $logfile"
    exit 0
  fi
  tail -n 80 -f "$logfile"
}

target="${2:-all}"
command="${1:-}"

if [[ -z "$command" ]]; then
  usage
  exit 1
fi

case "$command" in
  install)
    case "$target" in
      bot) install_bot ;;
      web) install_web ;;
      all) install_web; install_bot ;;
      *) usage; exit 1 ;;
    esac
    ;;
  start)
    case "$target" in
      bot) ensure_loaded "$BOT_LABEL" "$BOT_PLIST"; start_agent "$BOT_LABEL" ;;
      web) ensure_loaded "$WEB_LABEL" "$WEB_PLIST"; start_agent "$WEB_LABEL" ;;
      all) ensure_loaded "$WEB_LABEL" "$WEB_PLIST"; start_agent "$WEB_LABEL"; ensure_loaded "$BOT_LABEL" "$BOT_PLIST"; start_agent "$BOT_LABEL" ;;
      *) usage; exit 1 ;;
    esac
    ;;
  stop)
    case "$target" in
      bot) stop_agent "$BOT_LABEL" ;;
      web) stop_agent "$WEB_LABEL" ;;
      all) stop_agent "$BOT_LABEL"; stop_agent "$WEB_LABEL" ;;
      *) usage; exit 1 ;;
    esac
    ;;
  restart)
    case "$target" in
      bot) stop_agent "$BOT_LABEL"; install_bot ;;
      web) stop_agent "$WEB_LABEL"; install_web ;;
      all) stop_agent "$BOT_LABEL"; stop_agent "$WEB_LABEL"; install_web; install_bot ;;
      *) usage; exit 1 ;;
    esac
    ;;
  status)
    case "$target" in
      bot) status_agent "$BOT_LABEL" ;;
      web) status_agent "$WEB_LABEL" ;;
      all) status_agent "$WEB_LABEL"; status_agent "$BOT_LABEL" ;;
      *) usage; exit 1 ;;
    esac
    ;;
  logs)
    tail_logs "$target" "${3:-out}"
    ;;
  uninstall)
    case "$target" in
      bot) uninstall_agent "$BOT_LABEL" "$BOT_PLIST" ;;
      web) uninstall_agent "$WEB_LABEL" "$WEB_PLIST" ;;
      all) uninstall_agent "$BOT_LABEL" "$BOT_PLIST"; uninstall_agent "$WEB_LABEL" "$WEB_PLIST" ;;
      *) usage; exit 1 ;;
    esac
    ;;
  *)
    usage
    exit 1
    ;;
esac
