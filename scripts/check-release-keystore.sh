#!/usr/bin/env bash
# Prüft die Signatur-Secrets des Release-Workflows vor dem Build und schreibt den Keystore nach $1.
# Erwartet KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS und KEY_PASSWORD in der Umgebung.
# Leerzeichen und Zeilenumbrüche (auch Windows-CR) am Rand der Werte werden ignoriert.
set -euo pipefail
out="$1"

trim() {
  local v="$1"
  v="${v#"${v%%[![:space:]]*}"}"
  printf '%s' "${v%"${v##*[![:space:]]}"}"
}

missing=""
[ -z "${KEYSTORE_BASE64:-}" ] && missing="$missing ANDROID_KEYSTORE_BASE64"
[ -z "${KEYSTORE_PASSWORD:-}" ] && missing="$missing ANDROID_KEYSTORE_PASSWORD"
[ -z "${KEY_ALIAS:-}" ] && missing="$missing ANDROID_KEY_ALIAS"
[ -z "${KEY_PASSWORD:-}" ] && missing="$missing ANDROID_KEY_PASSWORD"
if [ -n "$missing" ]; then
  echo "::error::Fehlende Repository-Secrets:$missing – siehe README, Abschnitt Release."
  exit 1
fi

if [[ "$KEYSTORE_BASE64" == *"-----BEGIN"* ]]; then
  echo "::error::ANDROID_KEYSTORE_BASE64 enthält BEGIN/END-Zeilen (z. B. von certutil). Bitte nur den Base64-Text des Keystores eintragen, siehe README."
  exit 1
fi
if ! printf '%s' "$KEYSTORE_BASE64" | tr -d '[:space:]' | base64 -d > "$out" 2>/dev/null || [ ! -s "$out" ]; then
  echo "::error::ANDROID_KEYSTORE_BASE64 ist kein gültiges Base64. Bitte mit dem Befehl aus der README neu erzeugen."
  exit 1
fi

KEYSTORE_PASSWORD="$(trim "$KEYSTORE_PASSWORD")" \
KEY_ALIAS="$(trim "$KEY_ALIAS")" \
KEY_PASSWORD="$(trim "$KEY_PASSWORD")" \
  java -Dstdout.encoding=UTF-8 "$(dirname "$0")/CheckKeystore.java" "$out"
