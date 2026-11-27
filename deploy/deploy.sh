#!/usr/bin/env bash
# Updates this server to the latest code of its branch, then restarts the ERP. Run it from anywhere:
#   ./deploy/deploy.sh
# One-time set-up and the nginx site are in deploy/README.md. Settings stay in backend/.env and frontend/.env.production,
# which git never touches.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="${PM2_NAME:-zora-erp}"
cd "$ROOT"

say() { printf '\n\033[1;32m== %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m!! %s\033[0m\n' "$1"; exit 1; }

[ -f backend/.env ] || fail "backend/.env is missing. Copy deploy/server.env.example to backend/.env and fill it in."
[ -f frontend/.env.production ] || fail "frontend/.env.production is missing. It needs one line: VITE_API_URL=/api/v1"
command -v pm2 >/dev/null || fail "pm2 is not installed (aaPanel: App Store > PM2 Manager, or: npm install -g pm2)."
node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)' || fail "Node 22 or newer is needed (node -v says $(node -v))."

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
say "Getting the latest code ($BRANCH)"
git pull --ff-only origin "$BRANCH"
git log --oneline -1

say "Backend: packages, database changes, build"
cd "$ROOT/backend"
npm ci --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy
npm run build

say "Screens: packages and build"
cd "$ROOT/frontend"
npm ci --no-audit --no-fund
npm run build-only

say "Restarting the backend ($NAME)"
cd "$ROOT/backend"
if pm2 describe "$NAME" >/dev/null 2>&1; then
  pm2 reload "$NAME" --update-env
else
  pm2 start dist/main.js --name "$NAME" --cwd "$ROOT/backend" --time
fi
pm2 save >/dev/null

PORT="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2 | tr -d '"[:space:]')"
say "Checking it answers on port ${PORT:-3000}"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT:-3000}/api/v1/health" >/dev/null 2>&1; then
    printf '\033[1;32mDone. The ERP is running on %s.\033[0m\n' "$(git -C "$ROOT" log --oneline -1)"
    exit 0
  fi
  sleep 2
done
pm2 logs "$NAME" --lines 40 --nostream || true
fail "The backend did not answer. Its last lines are above."
