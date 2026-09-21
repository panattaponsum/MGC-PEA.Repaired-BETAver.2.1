#!/usr/bin/env bash
# Generates config.js from config.template.js, filling in Firebase values
# from .env (local dev) or from already-exported environment variables (CI).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

required=(FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID FIREBASE_STORAGE_BUCKET FIREBASE_MESSAGING_SENDER_ID FIREBASE_APP_ID FIREBASE_MEASUREMENT_ID)
for var in "${required[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "Missing required env var: $var (set it in .env or export it before running this script)" >&2
    exit 1
  fi
done

sed \
  -e "s#__FIREBASE_API_KEY__#${FIREBASE_API_KEY}#g" \
  -e "s#__FIREBASE_AUTH_DOMAIN__#${FIREBASE_AUTH_DOMAIN}#g" \
  -e "s#__FIREBASE_PROJECT_ID__#${FIREBASE_PROJECT_ID}#g" \
  -e "s#__FIREBASE_STORAGE_BUCKET__#${FIREBASE_STORAGE_BUCKET}#g" \
  -e "s#__FIREBASE_MESSAGING_SENDER_ID__#${FIREBASE_MESSAGING_SENDER_ID}#g" \
  -e "s#__FIREBASE_APP_ID__#${FIREBASE_APP_ID}#g" \
  -e "s#__FIREBASE_MEASUREMENT_ID__#${FIREBASE_MEASUREMENT_ID}#g" \
  config.template.js > config.js

echo "config.js generated from config.template.js"
