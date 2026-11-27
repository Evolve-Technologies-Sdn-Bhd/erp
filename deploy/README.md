# Deploying on a server (aaPanel, Ubuntu)

The ERP is **built on a computer, not on the server**: `deploy/pack.ps1` builds the backend and the screens and packs
them into one `.tar.gz`; on the server `update.sh` unpacks nothing but files, installs packages (a download), applies
new database changes and restarts the backend. nginx serves the screens and sends `/api/` to the backend.

Server layout, in the site's folder (`/www/wwwroot/<domain>`):

```
app/backend/.env        settings, never in git or in a package
app/backend/uploads/    pictures and proofs people upload
app/backend/dist ...    from the package
app/frontend/dist/      the screens: the site's root in nginx
release/                the package being installed
```

## Once

1. **Packages:** aaPanel App Store: Nginx, MySQL or MariaDB, Node.js 22 or newer (set as default), PM2 Manager.
2. **Database:** aaPanel > Databases > Add, with its own user (utf8mb4). Load the client's data into it (a dump, or an
   empty company with `npm run client:install`, CLAUDE.md *Installing a client*).
3. **Site:** aaPanel > Website > Add site, Static, with SSL.
4. **Settings:** `mkdir -p app/backend` in the site folder, then `app/backend/.env` from `deploy/server.env.example`.
   Copy the client's uploaded files into `app/backend/uploads/` if it has any.
5. **First package**, then **nginx**: site root `app/frontend/dist`, plus the blocks in `deploy/nginx.conf.example`.
6. `pm2 startup` once, so the backend starts again after the server restarts.

## Every update

On the computer, after committing:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\pack.ps1
```

Upload `deploy\out\zora-erp-<commit>.tar.gz` to the site folder (aaPanel > Files), then in aaPanel's Terminal:

```bash
cd /www/wwwroot/<domain>
rm -rf release && mkdir release && tar -xzf zora-erp-<commit>.tar.gz -C release
bash release/update.sh
```

It stops at the first problem and says what it was. `app/VERSION` says which package is live.

## Good to know

- `NODE_ENV=production` refuses to start without sign-in (`AUTH_MODE=jwt`), `COOKIE_SECURE=on` and the client's
  tenant, and with `DEV_TODAY` or the demo two-factor code set.
- `TRUST_PROXY=on` is needed behind nginx, or sign-in's lockout counts every visitor as one address.
- The Help guides work in dev mode only, so a site with sign-in shows the short tours but no guides.
- Back up the database before an update that changes it: aaPanel > Databases > Backup.
- Never run `prisma migrate reset`, `migrate dev` or `db seed` on a server.
