#!/usr/bin/env bash
# Superset workspace setup: env files + dependencies.
set -euo pipefail

ROOT="${SUPERSET_ROOT_PATH:-}"

# Copy local env files (gitignored) from the root repo, without overwriting.
if [[ -n "$ROOT" && "$ROOT" != "$PWD" ]]; then
  for f in .env .env.local .env.development .env.test .env.production; do
    if [[ -f "$ROOT/$f" && ! -f "$f" ]]; then
      cp "$ROOT/$f" "$f"
      echo "Copied $f from root repo"
    fi
  done
fi

if [[ ! -f .env.local && ! -f .env ]]; then
  echo "⚠️  No .env.local found in root repo — copy .env.example to .env.local and fill it in."
fi

# Use the project's Node version if nvm is available.
if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use >/dev/null || true
fi

npm ci
