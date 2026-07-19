#!/bin/sh

set -eu

REPOSITORY="MengMengCode/Meteor-History"
INSTALL_ROOT="/opt/meteor-history"
ENVIRONMENT_DIR="/etc/meteor-history"
ENVIRONMENT_FILE="$ENVIRONMENT_DIR/meteor-history.env"
STATE_DIRECTORY="/var/lib/meteor-history"
SERVICE_USER="meteor-history"
SERVICE_NAME="meteor-history"
TTY_DEVICE="/dev/tty"

say() {
  printf '%s\n' "$*"
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

if [ "$(id -u)" -ne 0 ]; then
  fail "run this installer as root (for example, pipe it to sudo sh)"
fi

if [ ! -r "$TTY_DEVICE" ]; then
  fail "an interactive terminal is required"
fi

install_dependencies() {
  missing=""
  for command_name in curl tar sha256sum awk grep od tr stty install; do
    command -v "$command_name" >/dev/null 2>&1 || missing="$missing $command_name"
  done
  [ -z "$missing" ] && return

  say "Installing required system tools..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates tar coreutils gawk grep
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y curl ca-certificates tar coreutils gawk grep
  elif command -v yum >/dev/null 2>&1; then
    yum install -y curl ca-certificates tar coreutils gawk grep
  elif command -v pacman >/dev/null 2>&1; then
    pacman -Sy --noconfirm curl ca-certificates tar coreutils gawk grep
  elif command -v zypper >/dev/null 2>&1; then
    zypper --non-interactive install curl ca-certificates tar coreutils gawk grep
  else
    fail "curl, tar, and sha256sum are required and no supported package manager was found"
  fi
}

detect_architecture() {
  case "$(uname -m)" in
    x86_64|amd64) printf '%s' "amd64" ;;
    aarch64|arm64) printf '%s' "arm64" ;;
    *) fail "unsupported Linux architecture: $(uname -m)" ;;
  esac
}

verify_glibc() {
  command -v getconf >/dev/null 2>&1 || fail "unable to determine the system glibc version"
  GLIBC_VERSION=$(getconf GNU_LIBC_VERSION 2>/dev/null | awk '{ print $2 }')
  printf '%s' "$GLIBC_VERSION" | grep -Eq '^[0-9]+\.[0-9]+$' || fail "unable to determine the system glibc version"
  GLIBC_MAJOR=${GLIBC_VERSION%%.*}
  GLIBC_MINOR=${GLIBC_VERSION#*.}
  if [ "$GLIBC_MAJOR" -lt 2 ] || { [ "$GLIBC_MAJOR" -eq 2 ] && [ "$GLIBC_MINOR" -lt 28 ]; }; then
    fail "glibc 2.28 or later is required; this host provides glibc $GLIBC_VERSION"
  fi
}

prompt_token() {
  while :; do
    printf 'GitHub fine-grained token: ' >"$TTY_DEVICE"
    stty -echo <"$TTY_DEVICE"
    IFS= read -r GITHUB_TOKEN <"$TTY_DEVICE" || true
    stty echo <"$TTY_DEVICE"
    printf '\n' >"$TTY_DEVICE"
    if printf '%s' "$GITHUB_TOKEN" | grep -Eq '^(github_pat_|ghp_)[A-Za-z0-9_]+$'; then
      break
    fi
    say "Enter a valid GitHub fine-grained token."
  done
}

prompt_public_url() {
  while :; do
    printf 'Public HTTPS URL (for example, https://stars.example.com): ' >"$TTY_DEVICE"
    IFS= read -r PUBLIC_BASE_URL <"$TTY_DEVICE"
    PUBLIC_BASE_URL=${PUBLIC_BASE_URL%/}
    if printf '%s' "$PUBLIC_BASE_URL" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' \
      && printf '%s' "${PUBLIC_BASE_URL#https://}" | grep -q '\.'; then
      break
    fi
    say "The public URL must be a valid HTTPS URL without a path."
  done
}

prompt_hotlink_protection() {
  printf 'Enable image hotlink protection for GitHub and this site only? [Y/n]: ' >"$TTY_DEVICE"
  IFS= read -r HOTLINK_ANSWER <"$TTY_DEVICE"
  case "$HOTLINK_ANSWER" in
    n|N|no|NO|No)
      EMBED_HOTLINK_PROTECTION="false"
      EMBED_ALLOWED_HOSTS=""
      ;;
    *)
      EMBED_HOTLINK_PROTECTION="true"
      SITE_HOST=${PUBLIC_BASE_URL#https://}
      SITE_HOST=${SITE_HOST%%:*}
      EMBED_ALLOWED_HOSTS="github.com,*.githubusercontent.com,*.github.io,$SITE_HOST"
      ;;
  esac
}

create_service_user() {
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    return
  fi
  if command -v useradd >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$STATE_DIRECTORY" --shell /usr/sbin/nologin "$SERVICE_USER"
  elif command -v adduser >/dev/null 2>&1; then
    adduser -S -D -H -h "$STATE_DIRECTORY" -s /sbin/nologin "$SERVICE_USER"
  else
    fail "neither useradd nor adduser is available"
  fi
}

write_environment() {
  SIGNING_KEY=""
  if [ -f "$ENVIRONMENT_FILE" ]; then
    SIGNING_KEY=$(awk -F= '$1 == "EMBED_SIGNING_KEY" { print $2; exit }' "$ENVIRONMENT_FILE")
  fi
  if ! printf '%s' "$SIGNING_KEY" | grep -Eq '^[a-f0-9]{64}$'; then
    SIGNING_KEY=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  fi
  install -d -m 700 "$ENVIRONMENT_DIR"
  umask 077
  {
    printf 'NODE_ENV=production\n'
    printf 'HOST=127.0.0.1\n'
    printf 'PORT=8666\n'
    printf 'GITHUB_TOKEN=%s\n' "$GITHUB_TOKEN"
    printf 'EMBED_SIGNING_KEY=%s\n' "$SIGNING_KEY"
    printf 'PUBLIC_BASE_URL=%s\n' "$PUBLIC_BASE_URL"
    printf 'CACHE_DIR=%s/.cache\n' "$STATE_DIRECTORY"
    printf 'CACHE_TTL_MINUTES=360\n'
    printf 'REFRESH_INTERVAL_MINUTES=360\n'
    printf 'EMBED_RATE_LIMIT_PER_MINUTE=120\n'
    printf 'API_RATE_LIMIT_PER_MINUTE=240\n'
    printf 'EMBED_HOTLINK_PROTECTION=%s\n' "$EMBED_HOTLINK_PROTECTION"
    printf 'EMBED_ALLOWED_HOSTS=%s\n' "$EMBED_ALLOWED_HOSTS"
    printf 'TRUST_PROXY=true\n'
    printf 'INCLUDE_PRIVATE_REPOSITORIES=false\n'
  } >"$ENVIRONMENT_FILE"
  chmod 600 "$ENVIRONMENT_FILE"
}

install_systemd_service() {
  cat >"/etc/systemd/system/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Meteor History
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
EnvironmentFile=$ENVIRONMENT_FILE
WorkingDirectory=$STATE_DIRECTORY
ExecStart=$INSTALL_ROOT/current/bin/meteor-history
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$STATE_DIRECTORY

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME.service"
  systemctl restart "$SERVICE_NAME.service"
}

install_openrc_service() {
  cat >"/etc/init.d/$SERVICE_NAME" <<EOF
#!/sbin/openrc-run
name="Meteor History"
description="Meteor History service"
command="$INSTALL_ROOT/current/bin/meteor-history"
command_user="$SERVICE_USER:$SERVICE_USER"
directory="$STATE_DIRECTORY"
supervisor="supervise-daemon"
pidfile="/run/$SERVICE_NAME.pid"

depend() {
  need net
}

start_pre() {
  set -a
  . "$ENVIRONMENT_FILE"
  set +a
}
EOF
  chmod 755 "/etc/init.d/$SERVICE_NAME"
  rc-update add "$SERVICE_NAME" default
  rc-service "$SERVICE_NAME" restart
}

verify_running_service() {
  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if curl --fail --silent http://127.0.0.1:8666/api/health >/dev/null; then
      return
    fi
    sleep 1
  done
  if [ "$SERVICE_MANAGER" = "systemd" ]; then
    journalctl --no-pager --unit "$SERVICE_NAME.service" --lines 30 >&2 || true
  else
    rc-service "$SERVICE_NAME" status >&2 || true
  fi
  fail "the service did not pass its health check"
}

if [ "$(uname -s)" != "Linux" ]; then
  fail "this installer supports Linux only"
fi

if ldd --version 2>&1 | grep -qi 'musl'; then
  fail "this release currently supports glibc-based Linux distributions only"
fi

install_dependencies
verify_glibc

ARCHITECTURE=$(detect_architecture)
ASSET="meteor-history-linux-$ARCHITECTURE.tar.gz"
DOWNLOAD_BASE="https://github.com/$REPOSITORY/releases/latest/download"
TEMP_DIRECTORY=$(mktemp -d)
trap 'stty echo <"$TTY_DEVICE" 2>/dev/null || true; rm -rf "$TEMP_DIRECTORY"' EXIT HUP INT TERM

prompt_token
prompt_public_url
prompt_hotlink_protection

say "Downloading the latest $ARCHITECTURE release..."
curl --fail --location --retry 3 --output "$TEMP_DIRECTORY/$ASSET" "$DOWNLOAD_BASE/$ASSET"
curl --fail --location --retry 3 --output "$TEMP_DIRECTORY/SHA256SUMS" "$DOWNLOAD_BASE/SHA256SUMS"

EXPECTED_CHECKSUM=$(awk -v asset="$ASSET" '$2 == asset { print $1 }' "$TEMP_DIRECTORY/SHA256SUMS")
[ -n "$EXPECTED_CHECKSUM" ] || fail "the release checksum for $ASSET is missing"
ACTUAL_CHECKSUM=$(sha256sum "$TEMP_DIRECTORY/$ASSET" | awk '{ print $1 }')
[ "$EXPECTED_CHECKSUM" = "$ACTUAL_CHECKSUM" ] || fail "release checksum verification failed"

EXTRACT_DIRECTORY="$TEMP_DIRECTORY/extracted"
mkdir -p "$EXTRACT_DIRECTORY"
tar -xzf "$TEMP_DIRECTORY/$ASSET" -C "$EXTRACT_DIRECTORY"
[ -x "$EXTRACT_DIRECTORY/bin/meteor-history" ] || fail "the release package is missing its launcher"
[ -x "$EXTRACT_DIRECTORY/runtime/node" ] || fail "the release package is missing its runtime"
[ -f "$EXTRACT_DIRECTORY/VERSION" ] || fail "the release package is missing version metadata"
VERSION=$(tr -d '\r\n' <"$EXTRACT_DIRECTORY/VERSION")
printf '%s' "$VERSION" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' || fail "the release contains invalid version metadata"

create_service_user
install -d -m 755 "$INSTALL_ROOT/releases"
install -d -m 750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$STATE_DIRECTORY" "$STATE_DIRECTORY/.cache"

TARGET_DIRECTORY="$INSTALL_ROOT/releases/$VERSION-$ARCHITECTURE"
if [ -d "$TARGET_DIRECTORY" ]; then
  [ -x "$TARGET_DIRECTORY/bin/meteor-history" ] || fail "the existing $VERSION installation is incomplete"
  [ -x "$TARGET_DIRECTORY/runtime/node" ] || fail "the existing $VERSION runtime is incomplete"
else
  mv "$EXTRACT_DIRECTORY" "$TARGET_DIRECTORY"
  chown -R root:root "$TARGET_DIRECTORY"
fi
ln -sfn "releases/$VERSION-$ARCHITECTURE" "$INSTALL_ROOT/current"
write_environment

if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  SERVICE_MANAGER="systemd"
  install_systemd_service
elif command -v rc-service >/dev/null 2>&1 && command -v rc-update >/dev/null 2>&1; then
  SERVICE_MANAGER="openrc"
  install_openrc_service
else
  fail "the application was installed, but neither systemd nor OpenRC was found"
fi
verify_running_service

say "Meteor History $VERSION is running on port 8666."
say "Configure DNS and an HTTPS reverse proxy for $PUBLIC_BASE_URL if they are not already available."
if [ "$EMBED_HOTLINK_PROTECTION" = "true" ]; then
  say "Image Referers are restricted to GitHub hosts; same-origin web previews remain available."
fi
