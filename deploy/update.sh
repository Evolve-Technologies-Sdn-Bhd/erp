#!/usr/bin/env bash
# Puts a package made by deploy/pack.ps1 live. On the server, in the site folder:
#   tar -xzf zora-erp-<commit>.tar.gz -C release && bash release/update.sh
# It keeps backend/.env and backend/uploads, installs packages only when they changed, applies new database changes
# (never the demo seed), swaps in the new screens, restarts the backend under pm2 and checks it answers.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="${APP_DIR:-$(dirname "$HERE")/app}"
NAME="${PM2_NAME:-zora-erp}"

say() { printf '\n\033[1;32m== %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m!! %s\033[0m\n' "$1"; exit 1; }

[ -f "$HERE/VERSION" ] || fail "Run this from an unpacked package (release/update.sh)."
[ -f "$APP/backend/.env" ] || fail "$APP/backend/.env is missing. Create it first (deploy/README.md, step 4)."
command -v pm2 >/dev/null || fail "pm2 is not installed."
node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)' || fail "Node 22 or newer is needed."
say "Installing $(cat "$HERE/VERSION") into $APP"

say "Backend files"
mkdir -p "$APP/backend" "$APP/frontend"
rm -rf "$APP/backend/dist" "$APP/backend/prisma"
cp -r "$HERE/backend/dist" "$HERE/backend/prisma" "$APP/backend/"
cp "$HERE/backend/package.json" "$HERE/backend/package-lock.json" "$APP/backend/"
mkdir -p "$APP/backend/uploads"

cd "$APP/backend"
if cmp -s package-lock.json node_modules/.zora-lock 2>/dev/null; then
  say "Packages unchanged"
else
  say "Packages (a download, no build)"
  npm ci --no-audit --no-fund
  cp package-lock.json node_modules/.zora-lock
fi
npx prisma generate >/dev/null
say "Database changes"
npx prisma migrate deploy

say "Screens"
rm -rf "$APP/frontend/dist.new" "$APP/frontend/dist.old"
cp -r "$HERE/frontend/dist" "$APP/frontend/dist.new"
[ -d "$APP/frontend/dist" ] && mv "$APP/frontend/dist" "$APP/frontend/dist.old"
mv "$APP/frontend/dist.new" "$APP/frontend/dist"
rm -rf "$APP/frontend/dist.old"

say "Restarting the backend ($NAME)"
if pm2 describe "$NAME" >/dev/null 2>&1; then
  pm2 reload "$NAME" --update-env
else
  pm2 start dist/main.js --name "$NAME" --cwd "$APP/backend" --time
fi
pm2 save >/dev/null
cp "$HERE/VERSION" "$APP/VERSION"

PORT="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2 | tr -d '"[:space:]')"
say "Checking it answers on port ${PORT:-3000}"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT:-3000}/api/v1/health" >/dev/null 2>&1; then
    printf '\033[1;32mDone. Live: %s\033[0m\n' "$(cat "$APP/VERSION")"
    exit 0
  fi
  sleep 2
done
pm2 logs "$NAME" --lines 40 --nostream || true
fail "The backend did not answer. Its last lines are above."
