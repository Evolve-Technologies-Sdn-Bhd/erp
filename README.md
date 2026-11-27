# Zora Pro ERP

A modular ERP: Purchase, Sales, Core (master data), Configuration (company, users, roles, sign-in), Service
(installation jobs) and a read-only WMS view, with a launcher, home dashboards and guided tours.

| Part | Stack | Runs on |
|---|---|---|
| `backend/` | Node 22, NestJS 11, Prisma, MySQL 8 or MariaDB 10.6 | `http://localhost:3000/api/v1` |
| `frontend/` | Vue 3, Vite, Tailwind 4, PrimeVue 4 | `http://localhost:5173` |

## Run it on a computer

```powershell
cd backend;  copy .env.example .env   # fill DATABASE_URL
npm install; npx prisma migrate dev; npx prisma db seed; npm run start:dev
cd ..\frontend; npm install; npm run dev
```

The demo seed signs everyone in through the user switcher (`AUTH_MODE=dev`). Tests: `npm test` and
`npm run test:e2e` in `backend/` (the e2e run resets the demo data), `npm run type-check`, `npm run lint` and
`npm run test:unit` in `frontend/`.

## Put it on a server

Build on a computer, install on the server: [deploy/README.md](deploy/README.md) (aaPanel, nginx, pm2).
A new client without demo data: `npm run client:install` (see *Installing a client* in `CLAUDE.md`).

## Where things are

- `CLAUDE.md`: how the ERP is built, its rules and every phase.
- `docs/design/`: screens, mockups, seed data, design tokens.
- `docs/integration/`: master data contract, events, WMS, the phone app handover.
- `docs/requirements/`: the SRS and SDD.
