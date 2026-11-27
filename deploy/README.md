# Deploying on a server (aaPanel, Ubuntu)

One ERP per client site: the screens are static files served by nginx, the backend runs under pm2 on a local port, and
nginx sends `/api/` to it. Settings live in `backend/.env` and `frontend/.env.production` on the server, never in git.

## Once

1. **Packages:** aaPanel App Store: Nginx, MySQL 8, Node.js version manager (Node 22 or newer, set as default),
   PM2 Manager. Check with `node -v` and `pm2 -v`.
2. **Database:** aaPanel > Databases > Add: a database and its own user (utf8mb4). Load the client's data into it
   (a dump, or an empty one with `npm run client:install`, see CLAUDE.md *Installing a client*).
3. **Site:** aaPanel > Website > Add site for the domain (static, no PHP). Then SSL > Let's Encrypt.
4. **Code**, in the site's folder:
   ```bash
   cd /www/wwwroot/<domain>
   git clone -b <branch> https://github.com/<owner>/erp.git erp
   cd erp
   cp deploy/server.env.example backend/.env        # then fill it in
   echo "VITE_API_URL=/api/v1" > frontend/.env.production
   chmod +x deploy/deploy.sh
   ```
   Uploaded files (pictures, proofs) go in `backend/uploads`: copy the client's folder there if it has one.
5. **nginx:** site root `erp/frontend/dist`, plus the blocks in `deploy/nginx.conf.example`.
6. Run `./deploy/deploy.sh`, then open the domain.
7. `pm2 startup` once, so the backend starts again after the server restarts.

## Every update

```bash
cd /www/wwwroot/<domain>/erp
./deploy/deploy.sh
```

It pulls the branch the folder is on, installs packages, applies new database changes (`prisma migrate deploy` only,
never the demo seed), builds both parts and restarts the backend, then checks `/api/v1/health`. It stops at the first
problem and says what it was.

## Good to know

- `NODE_ENV=production` refuses to start without sign-in (`AUTH_MODE=jwt`), `COOKIE_SECURE=on` and the client's
  tenant, and with `DEV_TODAY` or the demo two-factor code set.
- `TRUST_PROXY=on` is needed behind nginx, or sign-in's lockout counts every visitor as one address.
- The Help guides work in dev mode only, so a site with sign-in shows the short tours but no guides.
- Back up the database before an update that changes it: aaPanel > Databases > Backup.
