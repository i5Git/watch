#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="watchparty"
REPO_URL="https://github.com/i5Git/watch.git"
INSTALL_DIR="/opt/${APP_NAME}"
UI_PORT="4173"
SERVER_PORT="8080"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

[[ ${EUID:-$(id -u)} -eq 0 ]] || fail "Run this installer as root: sudo bash install.sh"
command -v apt-get >/dev/null 2>&1 || fail "This installer supports Ubuntu/Debian systems using apt."

export DEBIAN_FRONTEND=noninteractive

log "Installing system dependencies"
apt-get update -y
apt-get install -y ca-certificates curl git gnupg ufw

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])' 2>/dev/null || echo 0)" -lt 20 ]]; then
  log "Installing Node.js 22"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2"
  npm install -g pm2
fi

DEFAULT_HOST="$(curl -4fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
read -r -p "Public IP or domain for this server [${DEFAULT_HOST}]: " PUBLIC_HOST
PUBLIC_HOST="${PUBLIC_HOST:-$DEFAULT_HOST}"
[[ -n "$PUBLIC_HOST" ]] || fail "Could not determine a public host. Run again and enter your VPS IP or domain."

read -r -p "Use HTTPS? [y/N]: " HTTPS_REPLY
if [[ "$HTTPS_REPLY" =~ ^[Yy]$ ]]; then
  SCHEME="https"
else
  SCHEME="http"
fi

log "Downloading application"
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  git -C "$INSTALL_DIR" fetch --all --prune
  git -C "$INSTALL_DIR" reset --hard origin/master
else
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
  else
    touch .env
  fi
fi

# Ensure the backend binds publicly and uses the chosen port.
cat >> .env <<EOF

# Added by install.sh
HOST=0.0.0.0
PORT=${SERVER_PORT}
NODE_ENV=production
EOF

log "Installing Node.js packages"
npm ci

log "Building the web interface"
VITE_SERVER_HOST="${SCHEME}://${PUBLIC_HOST}:${SERVER_PORT}" npm run build

log "Configuring PM2 services"
cat > ecosystem.install.cjs <<EOF
module.exports = {
  apps: [
    {
      name: 'watchparty-server',
      cwd: '${INSTALL_DIR}',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '${SERVER_PORT}'
      }
    },
    {
      name: 'watchparty-ui',
      cwd: '${INSTALL_DIR}',
      script: 'npx',
      args: 'vite preview --host 0.0.0.0 --port ${UI_PORT}',
      env: { NODE_ENV: 'production' }
    }
  ]
};
EOF

pm2 delete watchparty-server watchparty-ui >/dev/null 2>&1 || true
pm2 start ecosystem.install.cjs
pm2 save
pm2 startup systemd -u root --hp /root >/tmp/watchparty-pm2-startup.txt 2>&1 || true

if command -v ufw >/dev/null 2>&1; then
  ufw allow "${UI_PORT}/tcp" >/dev/null 2>&1 || true
  ufw allow "${SERVER_PORT}/tcp" >/dev/null 2>&1 || true
fi

log "Checking services"
sleep 3
curl -fsS "http://127.0.0.1:${SERVER_PORT}/ping" >/dev/null || fail "Backend health check failed. Run: pm2 logs watchparty-server"
curl -fsS "http://127.0.0.1:${UI_PORT}" >/dev/null || fail "UI health check failed. Run: pm2 logs watchparty-ui"

cat <<EOF

\033[1;32mInstallation complete.\033[0m

Open the website:
  ${SCHEME}://${PUBLIC_HOST}:${UI_PORT}

Backend health endpoint:
  ${SCHEME}://${PUBLIC_HOST}:${SERVER_PORT}/ping

Useful commands:
  pm2 status
  pm2 logs
  pm2 restart watchparty-server watchparty-ui
  cd ${INSTALL_DIR} && git pull && npm ci && VITE_SERVER_HOST=${SCHEME}://${PUBLIC_HOST}:${SERVER_PORT} npm run build && pm2 restart all

Important: choosing HTTPS here does not create a TLS certificate. Put the app behind Caddy/Nginx or Cloudflare before using an https:// address.
EOF
