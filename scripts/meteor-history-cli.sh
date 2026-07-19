#!/bin/sh

set -eu

SERVICE_NAME="meteor-history"
ENVIRONMENT_FILE="/etc/meteor-history/meteor-history.env"
INSTALL_ROOT="/opt/meteor-history"
STATE_DIRECTORY="/var/lib/meteor-history"
COMMAND_LINK="/usr/local/bin/meteor-history"
TTY_DEVICE="/dev/tty"

say() {
  printf '%s\n' "$*"
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || fail "this command requires root privileges and sudo was not found"
  exec sudo "$0" "$@"
fi

[ -r "$TTY_DEVICE" ] || fail "an interactive terminal is required"

service_manager() {
  if [ -f "/etc/systemd/system/$SERVICE_NAME.service" ] && command -v systemctl >/dev/null 2>&1; then
    printf '%s' "systemd"
  elif [ -f "/etc/init.d/$SERVICE_NAME" ] && command -v rc-service >/dev/null 2>&1; then
    printf '%s' "openrc"
  else
    fail "neither systemd nor OpenRC was found"
  fi
}

restart_service() {
  case "$(service_manager)" in
    systemd) systemctl restart "$SERVICE_NAME.service" ;;
    openrc) rc-service "$SERVICE_NAME" restart ;;
  esac
}

health_check() {
  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if curl --fail --silent http://127.0.0.1:8666/api/health >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

change_token() (
  [ -f "$ENVIRONMENT_FILE" ] || fail "the Meteor History environment file was not found"
  command -v curl >/dev/null 2>&1 || fail "curl is required to validate a GitHub token"
  LOCK_DIRECTORY="/run/lock/meteor-history-update.lock"
  install -d -m 755 /run/lock
  mkdir "$LOCK_DIRECTORY" 2>/dev/null || fail "another management operation is already running"
  TEMP_ENVIRONMENT=""
  BACKUP_ENVIRONMENT=""
  trap '[ -z "$TEMP_ENVIRONMENT" ] || rm -f "$TEMP_ENVIRONMENT"; [ -z "$BACKUP_ENVIRONMENT" ] || rm -f "$BACKUP_ENVIRONMENT"; rmdir "$LOCK_DIRECTORY" 2>/dev/null || true' EXIT HUP INT TERM
  while :; do
    printf 'New GitHub fine-grained token: ' >"$TTY_DEVICE"
    IFS= read -r NEW_TOKEN <"$TTY_DEVICE"
    if printf '%s' "$NEW_TOKEN" | grep -Eq '^(github_pat_|ghp_)[A-Za-z0-9_]+$'; then
      break
    fi
    say "Enter a valid GitHub fine-grained token."
  done

  TOKEN_STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' --config - https://api.github.com/user <<EOF
header = "Accept: application/vnd.github+json"
header = "Authorization: Bearer $NEW_TOKEN"
header = "X-GitHub-Api-Version: 2022-11-28"
EOF
  ) || fail "GitHub token validation could not be completed"
  [ "$TOKEN_STATUS" = "200" ] || fail "GitHub rejected the token with HTTP status $TOKEN_STATUS"

  TEMP_ENVIRONMENT=$(mktemp "/etc/meteor-history/.meteor-history.env.XXXXXX")
  BACKUP_ENVIRONMENT=$(mktemp "/etc/meteor-history/.meteor-history.backup.XXXXXX")
  cp -p "$ENVIRONMENT_FILE" "$BACKUP_ENVIRONMENT"
  {
    grep -v '^GITHUB_TOKEN=' "$ENVIRONMENT_FILE" || true
    printf 'GITHUB_TOKEN=%s\n' "$NEW_TOKEN"
  } >"$TEMP_ENVIRONMENT"
  chmod 600 "$TEMP_ENVIRONMENT"
  chown root:root "$TEMP_ENVIRONMENT"
  mv "$TEMP_ENVIRONMENT" "$ENVIRONMENT_FILE"

  if ! restart_service || ! health_check; then
    cp -p "$BACKUP_ENVIRONMENT" "$ENVIRONMENT_FILE"
    restart_service || true
    fail "the new token was rejected by the service; the previous configuration was restored"
  fi
  say "The GitHub token was updated and the service restarted."
)

update_release() (
  for command_name in curl tar sha256sum awk; do
    command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required to update Meteor History"
  done
  case "$(uname -m)" in
    x86_64|amd64) ARCHITECTURE="amd64" ;;
    aarch64|arm64) ARCHITECTURE="arm64" ;;
    *) fail "unsupported Linux architecture: $(uname -m)" ;;
  esac

  LOCK_DIRECTORY="/run/lock/meteor-history-update.lock"
  install -d -m 755 /run/lock
  mkdir "$LOCK_DIRECTORY" 2>/dev/null || fail "another Meteor History update is already running"
  TEMP_DIRECTORY=""
  trap '[ -z "$TEMP_DIRECTORY" ] || rm -rf "$TEMP_DIRECTORY"; rmdir "$LOCK_DIRECTORY" 2>/dev/null || true' EXIT HUP INT TERM
  TEMP_DIRECTORY=$(mktemp -d)

  ASSET="meteor-history-linux-$ARCHITECTURE.tar.gz"
  DOWNLOAD_BASE="https://github.com/MengMengCode/Meteor-History/releases/latest/download"
  say "Downloading the latest $ARCHITECTURE release..."
  curl --fail --silent --show-error --location --retry 3 --output "$TEMP_DIRECTORY/$ASSET" "$DOWNLOAD_BASE/$ASSET"
  curl --fail --silent --show-error --location --retry 3 --output "$TEMP_DIRECTORY/SHA256SUMS" "$DOWNLOAD_BASE/SHA256SUMS"
  EXPECTED_CHECKSUM=$(awk -v asset="$ASSET" '$2 == asset { print $1 }' "$TEMP_DIRECTORY/SHA256SUMS")
  [ -n "$EXPECTED_CHECKSUM" ] || fail "the release checksum for $ASSET is missing"
  ACTUAL_CHECKSUM=$(sha256sum "$TEMP_DIRECTORY/$ASSET" | awk '{ print $1 }')
  [ "$EXPECTED_CHECKSUM" = "$ACTUAL_CHECKSUM" ] || fail "release checksum verification failed"

  EXTRACT_DIRECTORY="$TEMP_DIRECTORY/extracted"
  mkdir -p "$EXTRACT_DIRECTORY"
  tar -xzf "$TEMP_DIRECTORY/$ASSET" -C "$EXTRACT_DIRECTORY"
  [ -x "$EXTRACT_DIRECTORY/bin/meteor-history" ] || fail "the release package is missing its launcher"
  [ -x "$EXTRACT_DIRECTORY/bin/meteor-history-cli" ] || fail "the release package is missing its management command"
  [ -x "$EXTRACT_DIRECTORY/runtime/node" ] || fail "the release package is missing its runtime"
  [ -f "$EXTRACT_DIRECTORY/VERSION" ] || fail "the release package is missing version metadata"
  VERSION=$(tr -d '\r\n' <"$EXTRACT_DIRECTORY/VERSION")
  printf '%s' "$VERSION" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' || fail "the release contains invalid version metadata"

  CURRENT_VERSION=""
  [ ! -f "$INSTALL_ROOT/current/VERSION" ] || CURRENT_VERSION=$(tr -d '\r\n' <"$INSTALL_ROOT/current/VERSION")
  if [ "$VERSION" = "$CURRENT_VERSION" ]; then
    say "Meteor History $VERSION is already the latest release."
    exit 0
  fi

  TARGET_DIRECTORY="$INSTALL_ROOT/releases/$VERSION-$ARCHITECTURE"
  if [ -d "$TARGET_DIRECTORY" ]; then
    [ -x "$TARGET_DIRECTORY/bin/meteor-history" ] || fail "the existing $VERSION installation is incomplete"
    [ -x "$TARGET_DIRECTORY/bin/meteor-history-cli" ] || fail "the existing $VERSION management command is incomplete"
    [ -x "$TARGET_DIRECTORY/runtime/node" ] || fail "the existing $VERSION runtime is incomplete"
  else
    mv "$EXTRACT_DIRECTORY" "$TARGET_DIRECTORY"
    chown -R root:root "$TARGET_DIRECTORY"
  fi

  PREVIOUS_TARGET=$(readlink "$INSTALL_ROOT/current")
  ln -sfn "releases/$VERSION-$ARCHITECTURE" "$INSTALL_ROOT/current"
  if ! restart_service || ! health_check; then
    ln -sfn "$PREVIOUS_TARGET" "$INSTALL_ROOT/current"
    restart_service || true
    health_check || true
    fail "the $VERSION health check failed; the previous release was restored"
  fi
  say "Meteor History was updated from $CURRENT_VERSION to $VERSION."
)

uninstall_service() (
  printf 'Uninstall Meteor History? Type yes to continue: ' >"$TTY_DEVICE"
  IFS= read -r CONFIRM_UNINSTALL <"$TTY_DEVICE"
  [ "$CONFIRM_UNINSTALL" = "yes" ] || {
    say "Uninstall cancelled."
    return
  }

  printf 'Also delete the configuration, token, and cached JSON data? [y/N]: ' >"$TTY_DEVICE"
  IFS= read -r PURGE_DATA <"$TTY_DEVICE"

  LOCK_DIRECTORY="/run/lock/meteor-history-update.lock"
  install -d -m 755 /run/lock
  mkdir "$LOCK_DIRECTORY" 2>/dev/null || fail "an update or uninstall operation is already running"
  trap 'rmdir "$LOCK_DIRECTORY" 2>/dev/null || true' EXIT HUP INT TERM

  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    systemctl disable --now "$SERVICE_NAME.service" >/dev/null 2>&1 || true
    rm -f "/etc/systemd/system/$SERVICE_NAME.service"
    systemctl daemon-reload
  fi
  if command -v rc-service >/dev/null 2>&1; then
    rc-service "$SERVICE_NAME" stop >/dev/null 2>&1 || true
    rc-update del "$SERVICE_NAME" default >/dev/null 2>&1 || true
    rm -f "/etc/init.d/$SERVICE_NAME"
  fi

  rm -f "$COMMAND_LINK"
  rm -rf "$INSTALL_ROOT"

  case "$PURGE_DATA" in
    y|Y|yes|YES|Yes)
      rm -rf "/etc/meteor-history" "$STATE_DIRECTORY"
      if command -v userdel >/dev/null 2>&1; then
        userdel "$SERVICE_NAME" >/dev/null 2>&1 || true
      elif command -v deluser >/dev/null 2>&1; then
        deluser "$SERVICE_NAME" >/dev/null 2>&1 || true
      fi
      say "Meteor History and its cached JSON data were removed."
      ;;
    *)
      say "Meteor History was removed. Configuration and cached JSON data were preserved for reinstallation."
      ;;
  esac
)

show_menu() {
  while :; do
    CURRENT_VERSION="unknown"
    [ ! -f "$INSTALL_ROOT/current/VERSION" ] || CURRENT_VERSION=$(tr -d '\r\n' <"$INSTALL_ROOT/current/VERSION")
    say ""
    say "Meteor History $CURRENT_VERSION"
    say "1) Change GitHub token"
    say "2) Update to latest release"
    say "3) Uninstall"
    say "0) Exit"
    printf 'Select an option: ' >"$TTY_DEVICE"
    IFS= read -r MENU_OPTION <"$TTY_DEVICE"
    case "$MENU_OPTION" in
      1) change_token ;;
      2) update_release ;;
      3) uninstall_service; return ;;
      0) return ;;
      *) say "Select 0, 1, 2, or 3." ;;
    esac
  done
}

case "${1:-menu}" in
  menu) show_menu ;;
  key|token) change_token ;;
  update) update_release ;;
  uninstall) uninstall_service ;;
  help|--help|-h)
    say "Usage: meteor-history [key|update|uninstall]"
    ;;
  *) fail "unknown command: $1" ;;
esac
