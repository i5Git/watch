#!/usr/bin/env bash
set -Eeuo pipefail

readonly DEFAULT_REPO_URL="https://github.com/i5Git/watch.git"
readonly DEFAULT_INSTALL_DIR="/opt/watch"
readonly SERVICE_NAME="watch"

SUDO=()
if [[ "${EUID}" -ne 0 ]]; then
  SUDO=(sudo)
fi

run_privileged() {
  "${SUDO[@]}" "$@"
}

log() {
  printf '\n[Watch] %s\n' "$1"
}

fail() {
  printf '\n[Watch] ERROR: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Install Watch on Ubuntu/Debian with Docker Compose:

  curl -fsSL https://raw.githubusercontent.com/i5Git/watch/main/scripts/install-ubuntu.sh | bash -s -- --yes

Options:
  --yes                 Accept defaults without prompting.
  --update              Pull the existing checkout and rebuild it.
  --advanced            Prompt for optional TURN, YouTube, database, and Redis values.
  --mode docker|native  Deployment mode. Docker is the default.
  --dir PATH            Installation directory. Default: /opt/watch.
  --port PORT           Public host port. Default: 8080.
  --host HOST           Public hostname or IP used in the final URL.
  --repo URL            Git repository to install.
  --help                Show this help.
EOF
}

SCRIPT_DIR=""
if SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P)"; then
  :
else
  SCRIPT_DIR=""
fi

LOCAL_REPO_DIR=""
if [[ -n "${SCRIPT_DIR}" && -f "${SCRIPT_DIR}/../package.json" ]]; then
  LOCAL_REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
fi

INSTALL_USER="${SUDO_USER:-$(id -un)}"
INSTALL_GROUP="$(id -gn "${INSTALL_USER}" 2>/dev/null || printf '%s' "${INSTALL_USER}")"
DEFAULT_HOST="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
DEFAULT_HOST="${DEFAULT_HOST:-localhost}"

REPO_URL="${WATCH_REPO_URL:-${DEFAULT_REPO_URL}}"
INSTALL_DIR="${WATCH_INSTALL_DIR:-${DEFAULT_INSTALL_DIR}}"
APP_PORT="${WATCH_PORT:-8080}"
PUBLIC_HOST="${WATCH_HOST:-${DEFAULT_HOST}}"
DEPLOY_MODE="docker"
UPDATE_ONLY="0"
ASSUME_YES="0"
ADVANCED="0"

VITE_SERVER_HOST=""
VITE_OAUTH_REDIRECT_HOSTNAME=""
VITE_TURN_SERVERS=""
VITE_TURN_USERNAME=""
VITE_TURN_CREDENTIAL=""
ADMIN_USERNAME="${WATCH_ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${WATCH_ADMIN_PASSWORD:-}"
GENERATED_ADMIN_PASSWORD="0"
YOUTUBE_API_KEY=""
DATABASE_URL=""
REDIS_URL=""

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --yes)
      ASSUME_YES="1"
      ;;
    --update)
      UPDATE_ONLY="1"
      ;;
    --advanced)
      ADVANCED="1"
      ;;
    --mode)
      shift
      DEPLOY_MODE="${1:-}"
      ;;
    --mode=*)
      DEPLOY_MODE="${1#*=}"
      ;;
    --dir)
      shift
      INSTALL_DIR="${1:-}"
      ;;
    --dir=*)
      INSTALL_DIR="${1#*=}"
      ;;
    --port)
      shift
      APP_PORT="${1:-}"
      ;;
    --port=*)
      APP_PORT="${1#*=}"
      ;;
    --host)
      shift
      PUBLIC_HOST="${1:-}"
      ;;
    --host=*)
      PUBLIC_HOST="${1#*=}"
      ;;
    --repo)
      shift
      REPO_URL="${1:-}"
      ;;
    --repo=*)
      REPO_URL="${1#*=}"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1. Use --help for usage."
      ;;
  esac
  shift
done

[[ "${DEPLOY_MODE}" == "docker" || "${DEPLOY_MODE}" == "native" ]] ||
  fail "Deployment mode must be docker or native."
[[ "${APP_PORT}" =~ ^[0-9]+$ ]] || fail "Port must be a number."
(( APP_PORT >= 1 && APP_PORT <= 65535 )) || fail "Port must be between 1 and 65535."
[[ -n "${INSTALL_DIR}" ]] || fail "Installation directory cannot be empty."
[[ -n "${REPO_URL}" ]] || fail "Repository URL cannot be empty."

if [[ -n "${LOCAL_REPO_DIR}" && "${INSTALL_DIR}" == "${DEFAULT_INSTALL_DIR}" ]]; then
  INSTALL_DIR="${LOCAL_REPO_DIR}"
fi

if [[ "${UPDATE_ONLY}" == "1" && -f "${INSTALL_DIR}/.env" ]]; then
  existing_port="$(grep -E '^APP_PORT=' "${INSTALL_DIR}/.env" | head -n 1 | cut -d= -f2- || true)"
  APP_PORT="${existing_port:-${APP_PORT}}"
fi

prompt_default() {
  local prompt="$1"
  local default_value="$2"
  local variable_name="$3"
  local value
  read -r -p "${prompt} [${default_value}]: " value
  printf -v "${variable_name}" '%s' "${value:-${default_value}}"
}

prompt_secret() {
  local prompt="$1"
  local variable_name="$2"
  local value
  read -r -s -p "${prompt} (optional): " value
  printf '\n'
  printf -v "${variable_name}" '%s' "${value}"
}

if [[ "${ASSUME_YES}" != "1" ]]; then
  prompt_default "Install directory" "${INSTALL_DIR}" INSTALL_DIR
  prompt_default "Public port" "${APP_PORT}" APP_PORT
  prompt_default "Public hostname or IP" "${PUBLIC_HOST}" PUBLIC_HOST
  prompt_default "Deployment mode (docker/native)" "${DEPLOY_MODE}" DEPLOY_MODE
  prompt_default "Admin username" "${ADMIN_USERNAME}" ADMIN_USERNAME
  prompt_secret "Admin password (leave blank to generate one)" ADMIN_PASSWORD

  if [[ "${ADVANCED}" == "1" ]]; then
    prompt_default "API origin (blank for same origin)" "${VITE_SERVER_HOST}" VITE_SERVER_HOST
    prompt_default "OAuth redirect origin" \
      "${VITE_OAUTH_REDIRECT_HOSTNAME:-http://${PUBLIC_HOST}:${APP_PORT}}" \
      VITE_OAUTH_REDIRECT_HOSTNAME
    prompt_default "TURN server URLs" "${VITE_TURN_SERVERS}" VITE_TURN_SERVERS
    prompt_secret "TURN username" VITE_TURN_USERNAME
    prompt_secret "TURN credential" VITE_TURN_CREDENTIAL
    prompt_secret "YouTube API key" YOUTUBE_API_KEY
    prompt_secret "Postgres connection URL" DATABASE_URL
    prompt_secret "Redis connection URL" REDIS_URL
  fi
fi

[[ "${DEPLOY_MODE}" == "docker" || "${DEPLOY_MODE}" == "native" ]] ||
  fail "Deployment mode must be docker or native."
[[ "${APP_PORT}" =~ ^[0-9]+$ ]] || fail "Port must be a number."
(( APP_PORT >= 1 && APP_PORT <= 65535 )) || fail "Port must be between 1 and 65535."

prepare_directory() {
  if [[ -d "${INSTALL_DIR}" ]]; then
    return
  fi
  run_privileged mkdir -p "${INSTALL_DIR}"
  run_privileged chown "${INSTALL_USER}:${INSTALL_GROUP}" "${INSTALL_DIR}"
}

update_or_clone_source() {
  if [[ -f "${INSTALL_DIR}/package.json" ]]; then
    if [[ "${UPDATE_ONLY}" == "1" && -d "${INSTALL_DIR}/.git" ]]; then
      log "Updating the existing Watch checkout."
      local current_remote current_branch
      if [[ -w "${INSTALL_DIR}/.git/FETCH_HEAD" || "${EUID}" -eq 0 ]]; then
        current_remote="$(git -C "${INSTALL_DIR}" remote get-url origin 2>/dev/null || true)"
        current_branch="$(git -C "${INSTALL_DIR}" branch --show-current 2>/dev/null || true)"
        if [[ "${current_remote}" != "${REPO_URL}" || "${current_branch}" != "main" ]]; then
          log "Switching the existing checkout to ${REPO_URL} main."
          git -C "${INSTALL_DIR}" remote set-url origin "${REPO_URL}"
          git -C "${INSTALL_DIR}" fetch origin main
          git -C "${INSTALL_DIR}" checkout -B main origin/main
        else
          git -C "${INSTALL_DIR}" pull --ff-only
        fi
      else
        current_remote="$(run_privileged git -C "${INSTALL_DIR}" remote get-url origin 2>/dev/null || true)"
        current_branch="$(run_privileged git -C "${INSTALL_DIR}" branch --show-current 2>/dev/null || true)"
        if [[ "${current_remote}" != "${REPO_URL}" || "${current_branch}" != "main" ]]; then
          log "Switching the existing checkout to ${REPO_URL} main."
          run_privileged git -C "${INSTALL_DIR}" remote set-url origin "${REPO_URL}"
          run_privileged git -C "${INSTALL_DIR}" fetch origin main
          run_privileged git -C "${INSTALL_DIR}" checkout -B main origin/main
        else
          run_privileged git -C "${INSTALL_DIR}" pull --ff-only
        fi
      fi
    elif [[ "${UPDATE_ONLY}" != "1" ]]; then
      log "Existing checkout found at ${INSTALL_DIR}; use --update to fetch the latest Watch version."
    fi
    return
  fi

  if [[ -n "$(find "${INSTALL_DIR}" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    fail "${INSTALL_DIR} is not empty and does not contain a Watch checkout."
  fi

  log "Downloading Watch from ${REPO_URL}."
  run_privileged git clone --depth 1 --branch main "${REPO_URL}" "${INSTALL_DIR}"
  run_privileged chown -R "${INSTALL_USER}:${INSTALL_GROUP}" "${INSTALL_DIR}"
}

escape_env_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "${value}"
}

write_env_value() {
  printf '%s="%s"\n' "$1" "$(escape_env_value "$2")"
}

write_env() {
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    log "Keeping the existing .env file."
    return
  fi

  local redirect_origin
  redirect_origin="${VITE_OAUTH_REDIRECT_HOSTNAME:-http://${PUBLIC_HOST}:${APP_PORT}}"
  umask 077
  {
    printf 'APP_PORT=%s\n' "${APP_PORT}"
    printf 'PORT=8080\n'
    printf 'HOST=0.0.0.0\n'
    printf 'NODE_ENV=production\n'
    write_env_value "VITE_SERVER_HOST" "${VITE_SERVER_HOST}"
    write_env_value "VITE_OAUTH_REDIRECT_HOSTNAME" "${redirect_origin}"
    write_env_value "VITE_TURN_SERVERS" "${VITE_TURN_SERVERS}"
    write_env_value "VITE_TURN_USERNAME" "${VITE_TURN_USERNAME}"
    write_env_value "VITE_TURN_CREDENTIAL" "${VITE_TURN_CREDENTIAL}"
    write_env_value "ADMIN_USERNAME" "${ADMIN_USERNAME}"
    write_env_value "ADMIN_PASSWORD" "${ADMIN_PASSWORD}"
    write_env_value "AUTH_DATA_DIR" "data"
    write_env_value "MEDIA_DATA_DIR" "data/media"
    write_env_value "FFMPEG_PATH" "ffmpeg"
    write_env_value "FFPROBE_PATH" "ffprobe"
    write_env_value "YOUTUBE_API_KEY" "${YOUTUBE_API_KEY}"
    write_env_value "DATABASE_URL" "${DATABASE_URL}"
    write_env_value "REDIS_URL" "${REDIS_URL}"
  } > "${INSTALL_DIR}/.env"
  chmod 600 "${INSTALL_DIR}/.env"
}

install_packages() {
  log "Installing required Ubuntu packages."
  export DEBIAN_FRONTEND=noninteractive
  run_privileged apt-get update
  run_privileged apt-get install -y ca-certificates curl git openssl ffmpeg
}

has_docker_compose() {
  command -v docker >/dev/null 2>&1 || return 1
  docker compose version >/dev/null 2>&1 ||
    run_privileged docker compose version >/dev/null 2>&1
}

install_docker() {
  if has_docker_compose; then
    run_privileged systemctl enable --now docker >/dev/null 2>&1 || true
    return
  fi

  log "Installing Docker Compose."
  if ! run_privileged apt-get install -y docker.io docker-compose-v2; then
    run_privileged apt-get install -y docker.io docker-compose-plugin
  fi
  run_privileged systemctl enable --now docker
}

compose() {
  if docker info >/dev/null 2>&1; then
    docker compose "$@"
  else
    run_privileged docker compose "$@"
  fi
}

install_docker_mode() {
  install_docker
  log "Building and starting Watch with Docker Compose."
  (
    cd "${INSTALL_DIR}"
    compose up -d --build
    compose ps
  )
}

install_node_24() {
  local node_major="0"
  if command -v node >/dev/null 2>&1; then
    node_major="$(node --version | tr -d 'v' | cut -d. -f1)"
  fi
  if [[ "${node_major}" -ge 24 ]]; then
    return
  fi

  log "Installing Node.js 24 for the native systemd path."
  local setup_script
  setup_script="$(mktemp)"
  curl -fsSL https://deb.nodesource.com/setup_24.x > "${setup_script}"
  run_privileged bash "${setup_script}"
  rm -f "${setup_script}"
  run_privileged apt-get install -y nodejs
}

install_native_mode() {
  install_node_24
  command -v node >/dev/null 2>&1 || fail "Node.js was not installed."

  log "Building Watch."
  (
    cd "${INSTALL_DIR}"
    npm ci
    npm run build
  )

  log "Creating the systemd service."
  run_privileged tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=Watch synchronized watch-together server
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=-${INSTALL_DIR}/.env
ExecStart=$(command -v node) server/server.ts
Restart=always
RestartSec=5
User=${INSTALL_USER}

[Install]
WantedBy=multi-user.target
EOF
  run_privileged systemctl daemon-reload
  run_privileged systemctl enable --now "${SERVICE_NAME}.service"
  run_privileged systemctl --no-pager --full status "${SERVICE_NAME}.service" || true
}

command -v apt-get >/dev/null 2>&1 ||
  fail "This installer targets Ubuntu/Debian systems."

install_packages
if [[ -z "${ADMIN_PASSWORD}" ]]; then
  ADMIN_PASSWORD="$(openssl rand -hex 20)"
  GENERATED_ADMIN_PASSWORD="1"
fi
prepare_directory
update_or_clone_source
write_env

if [[ "${DEPLOY_MODE}" == "docker" ]]; then
  install_docker_mode
else
  install_native_mode
fi

log "Installation complete."
printf 'URL: http://%s:%s\n' "${PUBLIC_HOST}" "${APP_PORT}"
printf 'Admin username: %s\n' "${ADMIN_USERNAME}"
if [[ "${GENERATED_ADMIN_PASSWORD}" == "1" ]]; then
  printf 'Generated admin password: %s\n' "${ADMIN_PASSWORD}"
else
  printf 'Admin password: the value configured during installation (stored in %s/.env)\n' "${INSTALL_DIR}"
fi
if [[ "${DEPLOY_MODE}" == "docker" ]]; then
  printf 'Status: cd %s && docker compose ps\n' "${INSTALL_DIR}"
  printf 'Logs:   cd %s && docker compose logs -f --tail=100\n' "${INSTALL_DIR}"
else
  printf 'Status: sudo systemctl status %s.service\n' "${SERVICE_NAME}"
  printf 'Logs:   sudo journalctl -u %s.service -f\n' "${SERVICE_NAME}"
fi
