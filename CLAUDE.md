# Zora Pro ERP — build guide for Claude Code

We are building a modular ERP. **Phase 1 = the module launcher and the Purchase module** (done, steps 0–10). **Phase 2 = the Sales module** (section *Phase 2 · Sales module*, done, steps S0–S10). **Phase 3 = the Core module (Master Data)** (section *Phase 3 · Core module*, done, steps C0–C8). **Phase 4 = Configuration** (section *Phase 4 · Configuration*, in progress, steps A0–A8): company, branches, users, roles and sign-in. **Phase 5 = Field sales and installation** (section *Phase 5 · Field sales and installation*, planning only, steps F0–F7). Purchase, Sales and Core are working apps with a real API and database (no login until Phase 4 · A5). Read this file fully before writing code, then read the docs it points to.

## Must-read docs

| File | Why |
|---|---|
| `docs/design/SCREENS.md` | Every screen: mockup file, route, API |
| `docs/design/mockups/*.html` + `docs/design/screenshots/*.png` | The approved design. Open the HTML or view the PNG before building a screen |
| `docs/design/mockups/PurUxGuide.html`, `FlowP1–P7.html` | Purchase rules and journeys. Each flow’s *Step by step* table is the acceptance criteria |
| `docs/design/SEED_DATA.md` | Exact demo data. After seeding, screens must show the same numbers as the mockups |
| `docs/design/mockups/SalesUxGuide.html`, `SalesNavMap.html`, `FlowS1–S6.html` | Sales rules and journeys. Each flow’s *Step by step* table is the acceptance criteria |
| `docs/design/SALES_SEED_DATA.md` | Exact Sales demo data, and the mockup conflicts with the choice made |
| `docs/design/CORE_SEED_DATA.md` | Core master data as seeded, and the choices made in the Core mockups |
| `docs/design/CONFIG_SEED_DATA.md` | Company, branches, users, starter roles and sign-in settings as seeded, and the choices made in the Configuration mockups |
| `docs/design/DESIGN_TOKENS.md` | Colours, type, chips, buttons |
| `docs/integration/MASTER_DATA_CONTRACT.md` | What Purchase reads from Master Data and how |
| `docs/integration/EVENTS.md` | Events each module publishes and listens to, and the dispatcher rules |
| `docs/requirements/ERP_SRS.md`, `ERP_SDD.md` | Full requirements and architecture. Long; search them when you need detail |

**If this file and the SDD disagree, this file wins.** Differences from the SDD on purpose: MySQL instead of PostgreSQL, Vue instead of React, no Redis yet, simpler folder layout for phase 1 (rules kept in pure `*.rules.ts` files so they can move into a domain layer later), and document numbers assigned on first save (the mockups show numbers on drafts).

## Stack

- **Backend:** Node 22, NestJS 11, TypeScript strict, Prisma, MySQL 8 (utf8mb4).
- **Frontend:** Vue 3 + Vite + TypeScript, based on the user’s **TailAdmin Vue Pro 2.0.1** template (Tailwind 4), PrimeVue 4 for heavy widgets (DataTable, Select/AutoComplete, DatePicker, Dialog, Toast), `lucide-vue-next` icons. Keep the template’s `package.json` dependencies.
- **OS:** Windows. Give commands for PowerShell. The project path contains a space — always quote it: `"C:\Users\user\Desktop\ERP\Source Code"`.

## Repository layout

```
Source Code/
├─ CLAUDE.md
├─ docs/                      design, integration, requirements (read-only reference)
├─ backend/                   NestJS API on http://localhost:3000, prefix /api/v1
│  ├─ prisma/schema.prisma    one schema, table prefixes per module
│  ├─ prisma/seed.ts          seeds docs/design/SEED_DATA.md, SALES_SEED_DATA.md, CORE_SEED_DATA.md and CONFIG_SEED_DATA.md
│  ├─ test/                   end-to-end journeys: npm run test:e2e (resets the demo data)
│  └─ src/
│     ├─ platform/            shared building blocks, no business rules
│     │  ├─ prisma/           PrismaService
│     │  ├─ context/          current user, tenant, branch (dev header for now)
│     │  ├─ numbering/        NumberingService (locks the sequence row)
│     │  ├─ activity/         ActivityService → sys_activity
│     │  ├─ approvals/        generic approval requests
│     │  ├─ outbox/           OutboxWriter + dispatcher (polls; receiving systems and module listeners)
│     │  ├─ attachments/      local file storage under backend/uploads
│     │  └─ http/             list query DTO, list response, error filter
│     ├─ master-data/         MasterDataPort (interface) + Prisma adapter, READ ONLY
│     └─ purchase/
│        ├─ purchase.module.ts
│        ├─ shared/           statuses, totals.rules.ts, approval-limit.rules.ts, match.rules.ts (+ .spec.ts)
│        └─ requests/ rfqs/ orders/ receipts/ cancel-orders/ invoices/
│           cash-purchases/ debit-notes/ returns/ approvals/ demand/ dashboard/ settings/
│           sales-link/ (listens to Sales events: buy-to-order POs, pur_sales_demand)
│           each: <name>.controller.ts, <name>.service.ts, dto/, <name>.rules.ts (+ .spec.ts)
└─ frontend/                  TailAdmin Vue Pro base, http://localhost:5173
   └─ src/
      ├─ assets/erp-theme.css         tokens from DESIGN_TOKENS.md
      ├─ api/http.ts                  fetch wrapper (VITE_API_URL, x-dev-user header, errors → toast)
      ├─ composables/useListPage.ts   filters + status tab + page, synced to the URL query
      ├─ components/erp/              shared ERP components (list below)
      ├─ modules/launcher/LauncherView.vue
      └─ modules/purchase/            router.ts, menu.ts, types.ts, api/, views/ (one view per P-code)
```

## Module boundaries (do not break)

1. Sales and Purchase are separate modules. `purchase/` never imports from `sales/` and the reverse.
2. A module only reads and writes its own tables. Shared data comes from `MasterDataPort`; cross-module effects go out as outbox events.
3. Purchase never writes `mdm_` tables and never queries them directly — only through `MasterDataPort`. The adapter reads the local `mdm_` tables, which the Core module maintains since Phase 3; later it will call the real Master Data API, and nothing in `purchase/` may need to change.
4. Stock on hand comes from a read-only stub (`inv_stock_snapshot`) until Inventory/WMS is connected. Sales-order demand comes from Purchase's own copy (`pur_sales_demand`), kept from Sales events (`EVENTS.md`).
5. When another module is not connected, never block the user: save the event and show the amber banner (“Inventory is not connected yet…”).

## Database conventions (MySQL + Prisma)

- One database `zora_erp`. Table prefixes via `@@map`: `sys_` platform, `mdm_` master data (written only by Core since Phase 3, and by the seed), `inv_` and `fin_` stubs, `pur_` purchase, `sal_` sales. Prisma model names: `PurPurchaseOrder` → `@@map("pur_purchase_order")`.
- IDs: `String @id @default(uuid()) @db.Char(36)`. Every table has `tenantId` (one tenant seeded) and an index starting with it.
- Money `Decimal(18,2)`, unit price `Decimal(18,4)`, quantity `Decimal(18,4)`, rates `Decimal(7,4)`. **Never use JS floats for money or quantity.** Calculate with `Prisma.Decimal` on the server; send as strings in JSON.
- Rounding: line amount = round(qty × price, 2); line tax = round(amount × rate, 2); header totals = sums of lines.
- Documents have: `docNo` (unique per tenant + type), `docDate`, `status` (Prisma enum), `branchCode`, `remarks`, `version` (optimistic lock), `createdAt/By`, `updatedAt/By`, `isMigrated`.
- Lines keep references **and snapshots**: `itemId`, `itemCode`, `itemName`, `uomCode`, `taxCode`, `taxRate`, `unitPrice`.
- PO lines carry running quantities: `orderedQty`, `receivedQty`, `billedQty`, `returnedQty`, `cancelledQty`, updated in the same transaction as the document that changes them.
- Links between documents: natural foreign keys (GRN line → PO line, PI line → GRN line …) plus `sys_doc_link` rows to power *Document flow* and *Linked documents*.
- Released documents are never deleted or edited. Drafts may be deleted.
- Every state change, in one transaction: update the document, write `sys_activity`, write `sys_outbox` events.

## API conventions

- REST under `/api/v1/purchase/...` (paths in `SCREENS.md`).
- **List:** `GET ?page=1&pageSize=20&status=&q=&dateFrom=&dateTo=&sort=-docDate` → `{ items, total, page, pageSize, statusCounts: { all, draft, … } }` (status tabs show the counts).
- **Detail:** `GET /:id` → header, lines, totals, `links`, `activity`, and `allowedActions` for the current user. The frontend shows buttons only from `allowedActions`.
- **Actions:** `POST /:id/<action>` (`submit`, `approve`, `reject`, `release`, `confirm`, `award` …) with optional `{ comment }`.
- **Errors:** 400 `{ message, errors: [{ field, message }] }` for validation; 409 `{ code, message }` for broken business rules. Messages are written for users and name the limit, e.g. `Receiving now cannot be more than the open quantity (5).`
- Validation with `class-validator` DTOs; global `ValidationPipe({ whitelist: true, transform: true })`.
- Dates as ISO strings; business timezone `Asia/Kuala_Lumpur`.

## No login yet

*Since Phase 4 · A5 this is dev mode (`AUTH_MODE=dev`), kept for the demo and the tests. `AUTH_MODE=jwt` turns on sign-in; see Phase 4 · Sign-in.*

- Backend: a `DevUserGuard` reads header `x-dev-user` (user code, default `LMY`) when `AUTH_MODE=dev`. Use `@CurrentUser()` everywhere so JWT can replace it later without touching services.
- Put `@RequirePermission('purchase.order.release')` style decorators on actions now; in dev mode they check the user’s seeded roles.
- Frontend: a **Dev user switcher** in the top bar (Lim Mei Ying, Ahmad Zaki, Rahim, Tan Wei Ling, Rosnah Ismail …), saved in localStorage and sent as `x-dev-user`. This is how we test approvals.
- Emails are not sent: write them to `sys_email_log` and show “Sent” in the UI.

## Purchase business rules (enforce on the server, test in `*.rules.spec.ts`)

1. Goods can never be received beyond the open PO quantity (ordered − received − cancelled). Over-receipt switch is off.
2. Supplier invoices are matched against **received** quantity. Tolerance from settings: price ±2%, quantity 0 over received, tax ±RM 1.00. Outside tolerance the user picks: record received only, hold, or accept as billed (needs Purchasing Manager approval).
3. PO approval when submitted: HQ over RM 10,000 → Purchasing Manager; Penang over RM 5,000 → Branch Manager; any branch over RM 50,000 → also Finance Director. Under the limit the buyer releases directly. The buyer can never approve their own PO. A PO is locked while pending.
4. Orders over RM 50,000 need an RFQ with at least 2 supplier replies, unless the item has a contract price.
5. Awarding a supplier that is not the cheapest requires a reason (saved and shown to the approver).
6. Only ACTIVE suppliers and purchasable items can be used.
7. Released documents are locked. Corrections go through Cancel order (unreceived balance), Purchase return (received goods) or Supplier debit note (extra charge).
8. Cancel only the unreceived balance. Buyers draft; only the Purchasing Manager releases (`purchase.cancel_order.release`).
9. Return quantity ≤ received − already returned.
10. Cash purchase: at most RM 1,000.00 per receipt; a receipt photo is required to release.
11. Supplier debit note with a charge that is not on the PO needs Purchasing Manager approval.
12. Document numbers come from `NumberingService` on first save (`PO-0007`), never reused; a deleted draft leaves a gap.

**Statuses**
- Request: DRAFT, SUBMITTED, CONVERTED, REJECTED
- RFQ: DRAFT, WAITING, READY, AWARDED, CLOSED
- Purchase order: DRAFT, PENDING_APPROVAL, RELEASED, PARTIAL, DONE (flag `balanceCancelled`), CANCELLED
- Goods receipt: DRAFT, CONFIRMED · Cash purchase: DRAFT, RELEASED · Cancel order: DRAFT, RELEASED
- Purchase invoice: DRAFT, TO_MATCH, PENDING_APPROVAL, APPROVED, REJECTED, PAID
- Debit note: DRAFT, PENDING_APPROVAL, RELEASED, REJECTED · Return: DRAFT, RELEASED (waiting for credit), SETTLED

## Frontend rules

- Match the mockup for layout, labels, column order, buttons, chips and empty space. Copy wording exactly.
- Build these shared components once in `components/erp/` and reuse them: `ModuleLayout` (sidebar + top bar + breadcrumb, themed by `data-module`), `PageHeader` (title, number, status chip, subtitle, actions), `StatusChip`, `KpiCard`, `FilterBar`, `StatusTabs`, `DataList` (PrimeVue DataTable wrapper), `Pager`, `DocLines`, `TotalsBox`, `SideCard`, `NextSteps`, `ChecksList`, `LinkedDocs`, `ActivityList`, `NoticeBanner`, `MoneyText`, `QtyProgress`, `MasterDataPicker`, `DevUserSwitcher`.
- Module theme by CSS variables (`--mod-side`, `--mod-primary` …) from `DESIGN_TOKENS.md`. Purchase is green, Sales purple. No hard-coded hex in views.
- Codes (item, supplier, warehouse) are always picked from a list (`MasterDataPicker`), never typed free.
- List state (tab, filters, page) lives in the URL query so back/refresh keep it.
- Money and quantities arrive as strings; format with `MoneyText`; don’t do float maths. Previews in forms may calculate, but the server’s totals are the truth.
- Routes carry `meta: { code: 'P09', title: 'Purchase Order', menuGroup: 'transaction' }`; the sidebar and breadcrumb read from it.

## Build order for phase 1 (stop after each step for the user to review)

0. **Check the workspace.** List what is already in `Source Code`. If `frontend/` is missing, ask the user where their TailAdmin Vue Pro copy is (do not download a template). Check `node -v` (22) and that MySQL 8 is running. Create `backend/.env` from `.env.example` (`DATABASE_URL="mysql://root:<password>@localhost:3306/zora_erp"`, `AUTH_MODE=dev`, `PORT=3000`) and `frontend/.env` (`VITE_API_URL=http://localhost:3000/api/v1`). `git init` if needed.
1. **Backend skeleton:** NestJS app, Prisma connected, `/api/v1/health`, platform modules (context, numbering, activity, approvals, outbox, attachments, error filter, list helpers), CORS for 5173.
2. **Schema and seed:** `sys_`, `mdm_`, `inv_`/`sal_` stubs, `pur_` tables. Seed everything in `SEED_DATA.md`. Run `npx prisma migrate dev` and `npx prisma db seed`; print row counts.
3. **Frontend shell:** theme tokens, `ModuleLayout`, Launcher (00), Purchase home (P01) with the dashboard API, Dev user switcher, all Purchase routes registered (placeholder pages for screens not built yet). *Review with the user against the mockups before continuing.*
4. **Purchase orders and approvals:** P09 list, P10 form, P11 approval dialog, P02 approvals inbox. This is the core loop.
5. **Demand and requests:** P04, P05, P06.
6. **RFQ:** P07, P08 (award creates the draft PO).
7. **Goods receipt:** P14, P15.
8. **Supplier invoice and three-way match:** P16, P17.
9. **Fixes and small buys:** P12, P13 cancel order · P22, P23 return · P20, P21 debit note · P18, P19 cash purchase.
10. **Document flow and settings:** P03, P24, P25, P26.

**Definition of done for every step:** the screen matches its mockup; the seeded data shows the same numbers as the mockup; rules have unit tests; `npm run build` passes in backend and `npm run type-check` passes in frontend; a short note tells the user what to click to check it; commit with a clear message.

## Working agreement

- Before each step, write a short plan (files, tables, endpoints). After it, list what changed and how to check it.
- **Ask first** before: adding a dependency not listed here (pre-approved: `@nestjs/config`, `@nestjs/schedule`, `@nestjs/event-emitter`, `prisma`, `@prisma/client`, `class-validator`, `class-transformer`, `pinia`), changing the design or a rule in this file, deleting files, or touching anything outside `Source Code`.
- Do **not** build yet: login/JWT (until Phase 4 · A5), real email sending, LHDN e-Invoice submission, Inventory/Finance/MES integrations (only their events and stubs), and a WMS beyond the read-only view (*WMS read-only view*, end of this file).
- Code, identifiers and comments in English. UI text exactly as in the mockups.
- Keep secrets out of git (`.env` in `.gitignore`).

---

# Phase 2 · Sales module

Everything above still applies to Sales (stack, database and API conventions, no login, the working agreement, the definition of done). This section adds what is different or new. **Purchase is finished; do not change Purchase behaviour while building Sales.** If a Sales step seems to need a Purchase change, ask first.

## Must-read for Sales

- **Screen list:** `SCREENS.md` → *Sales module* (S01–S33, routes and mockups).
- **Rules and journeys:** `mockups/SalesUxGuide.html`, `SalesNavMap.html`, `FlowS1–S6.html`. Each flow's *Step by step* table is the acceptance criteria.
- **Seed data:** `SALES_SEED_DATA.md`. It has the exact demo data and a list of mockup conflicts with the choice made. The choices in that list win over the mockups.
- **Requirements:** SRS §6.3 Sales and §8.4 Credit control, for detail.

## Layout additions

```
backend/src/sales/
├─ sales.module.ts, sales.permissions.ts
├─ shared/        statuses, totals.rules.ts (discount, tax inclusive/exclusive, 5-sen rounding),
│                 credit.rules.ts (exposure + policy decision), price.rules.ts, linked-docs (+ .spec.ts)
└─ enquiries/ quotations/ orders/ deliveries/ invoices/ proformas/ cash-sales/ debit-notes/
   returns/ cancel-orders/ approvals/ dashboard/ reports/ settings/ lookups/
   buy-to-order/ (listens to Purchase events: PO number, received and cancelled quantities)
   each: <name>.controller.ts, <name>.query.ts (reads), <name>.service.ts (commands), dto/, <name>.rules.ts (+ .spec.ts)
frontend/src/modules/sales/   router.ts, menu.ts, types.ts, routes.ts, api/, views/ (one view per S-code)
```

- Shared ERP components in `components/erp/` are reused as they are. They must stay module-neutral, so a fix to one is a fix for both modules.
- `data-module="sales"` gives the purple theme from `DESIGN_TOKENS.md`. No hex values in views.

## Module boundaries (Sales)

1. `sales/` never imports from `purchase/`, and `purchase/` never imports from `sales/`. The same applies to `modules/sales` and `modules/purchase` in the frontend. Shared code goes to `platform/`, `master-data/` or `components/erp/` (no business rules there).
2. Sales reads and writes only `sal_` tables. Customers, items, price lists, tax codes, users and branches come through `MasterDataPort`. New port methods: customers, price lists and prices, sellable items.
3. **Stock** comes from `inv_stock_snapshot`, read only.
4. **Payments** come from a new read-only stub `fin_receipt_stub` until Finance exists. Sales never changes a balance by hand. *Phase 5 (18 Nov 2026, the user's OK):* with the Sales Flow switch on, Sales records customer payments on orders as official receipts (`sal_receipt`) that Account verifies; they decide whether an order is paid. Invoice balances still come from the stub, plus the verified receipts where *Verified receipts pay the invoices of their order* is on (24 Nov 2026).
5. Cross-module effects go out only as outbox events (`EVENTS.md` → *Sales publishes*). A module that is not connected never blocks the user: save the event and show the amber banner.
6. Purchase's demand list reads `pur_sales_demand`, its own copy of open sales-order lines, kept from `sales.order.released`, `sales.shipment.requested` and `sales.order.balance_cancelled` (decided at the end of Phase 2, `SALES_SEED_DATA.md` conflict 16). Sales never writes `pur_` tables, and Purchase never writes `sal_` tables.

## Master data and platform additions (step S1)

- **New `mdm_` seed tables:**
  - `mdm_customer`: code, name, TIN, addresses, contact, email, phone, category, area, branch, default agent, credit term days, credit limit, overdue limit, optional credit-scope override, price list, status ACTIVE / BLOCKED / PROSPECT.
  - `mdm_price_list` and `mdm_price_list_item`.
  - New items and users, as listed in `SALES_SEED_DATA.md`.
- **`mdm_item`:** use the existing `isSellable` / `salesTaxCode`, and add `barcode`.
- **`NumberingService`** gets optional format tokens (`{YYMM}`, `{YYYY}`, `{BR}`, `{####}`) and a monthly restart, for EQ-2609-0011. Existing Purchase sequences keep working unchanged. Add a test that proves PO numbering is untouched.
- **`sys_number_sequence`** rows for Sales use `module = 'sales'`. Purchase Document Types (P25) already filters on module, so Sales rows do not show there.
- **Approvals:** reuse the platform approval requests (`sys_approval_request`). Kinds: DISCOUNT (quotation), CREDIT (order, delivery, invoice), PRICE (invoice).

## Roles and permissions

Roles and what they do:

| Role | Does | Approves |
|---|---|---|
| SALES_AGENT | Enquiry, quotation, sales order, cancel order (draft only), sales return (draft) | — |
| SALES_BILLING | Invoice, proforma, debit note, printing and email | — |
| SALES_STORE | Delivery orders and confirming them, receiving returned goods | — |
| COUNTER_STAFF | Cash sales | — |
| SALES_MANAGER | Releases cancel orders, sees margin, reports | Discount over 15%, credit on orders and deliveries, price below list on invoices |
| FINANCE_MANAGER | — | Invoices for customers over their credit or overdue limit |
| ADMIN | Everything, including Operation Policies | — |

Permission names, as decorators on every action:
- `sales.view`
- `sales.enquiry.edit`
- `sales.quotation.edit`, `sales.quotation.release`
- `sales.order.edit`, `sales.order.release`
- `sales.delivery.edit`, `sales.delivery.confirm`
- `sales.invoice.edit`, `sales.invoice.release`
- `sales.proforma.edit`
- `sales.cash_sale.edit`
- `sales.debit_note.edit`
- `sales.return.edit`, `sales.return.receive`
- `sales.cancel_order.edit`, `sales.cancel_order.release`
- `sales.margin.view`
- `sales.settings.manage`

Approving is not a permission. The approval request names the role or the person.

**Dev user switcher:** add Aina Rahman, Lim Wei Jie, Faizal Omar, Nor Azlina and Siti Counter 1. Rosnah Ismail also acts as Finance Manager.

## Sales business rules (enforce on the server, test in `*.rules.spec.ts`)

1. **A step can never be bigger than the one before.** Deliver ≤ order balance (ordered − delivered − cancelled). Invoice ≤ delivered − invoiced (the policy "Invoice from delivered quantity only" is on). Return ≤ invoiced − returned, per invoice line. Messages name the limit, e.g. `Deliver now cannot be more than the balance (100).`
2. **Credit check**, run on save and again on release, for quotation, sales order, delivery order, invoice and cash sale:
   - **Exposure** = owed (unpaid balances of released invoices, including migrated ones, after credits, deposits and payments) + open value of the customer's other released or pending orders (not drafts, not yet invoiced) + this document.
   - **Overdue** = balances past their due date.
   - Each check is compared with the customer's credit limit and overdue limit. Scope is group-wide or per branch (Credit Control, S29); the customer's own setting in Master Data overrides it.
   - **On a breach**, the policy for that document and breach type decides:
     - *Allow, show warning:* save, with a warning.
     - *Require approval:* save as draft; release is blocked until approved; the agent gives a reason and requests approval; cancelling or deleting the document withdraws the request.
     - *Block:* 409 with the numbers.
   - The check result is stored on the document as a snapshot ("Credit at save").
   - The requester can never approve their own request.
   - System-made documents skip the check when the policy says so, and every skip is logged.
3. **Discount over 15% on any quotation line** needs Sales Manager approval before release. Estimated margin is shown only with `sales.margin.view` and when the policy switch is on.
4. **Strict price list:** an invoice line priced below the customer's price list needs Sales Manager approval before release.
5. **Allowed customers and items:**
   - Only ACTIVE customers on quotations and later documents. Enquiries may use a prospect, and a prospect must be added in Master Data before quoting.
   - Only sellable items that are not excluded for that branch on that date (S32).
   - Short stock only warns, never blocks.
6. **Quotations:**
   - Valid-until is required to release.
   - Released is locked.
   - *Revise* creates revision n+1 under the same number. Only released or expired quotations can be revised, and the old revision is kept read-only.
   - *Lost* needs a reason and closes the enquiry as Lost.
   - The list warns 3 days before a released (not yet ordered) quotation expires.
   - *Transfer to sales order* copies all lines or only some, at the quoted prices and tax.
7. **Released documents are locked and never deleted.** Corrections go through a revision (quotation, sales order), a cancel order (undelivered balance), a sales return (delivered and invoiced goods) or a debit note (missed charge). Drafts may be deleted.
8. **Cancel order:** only the undelivered balance can be cancelled. Agents draft; only `sales.cancel_order.release` releases. Releasing closes the order as DONE with `balanceCancelled`. Nothing is posted. A buy-to-order line linked to a PO shows a warning and publishes `sales.order.balance_cancelled` so Purchase can act.
9. **Proforma:**
   - It is a payment request only: no posting, no LHDN, no change to the order.
   - Request is a deposit % or pay before release.
   - While a released proforma for an order is unpaid, delivery of that order cannot be confirmed.
   - A paid deposit is used once, on the order's next invoice: balance due = total − deposit − credits − payments.
10. **Cash sale:**
    - Customer defaults to C-CASH, tax mode Inclusive, no credit check.
    - Balance must be 0 to release (received ≥ to pay; change is calculated).
    - An own e-Invoice needs the buyer's name and TIN; otherwise the sale goes into the monthly consolidated e-Invoice, due the 7th of next month.
    - One document records the sale, the payment and the stock out.
11. **Debit note:** always points to exactly one released invoice, never moves stock, and raises that invoice's balance.
12. **Sales return:** from one released invoice. A return location is required (Damaged goods or stock). Releasing lowers the invoice balance, saves a stock-in event and queues a credit note for Finance and LHDN.
13. **Numbers:** from `NumberingService` on first save and never reused. Enquiries use EQ-{YYMM}-{####} and restart monthly. Quotation revisions keep their number.
14. **Money:**
    - line gross = round(qty × price, 2)
    - line discount = round(gross × disc% / 100, 2)
    - net = gross − discount
    - tax (exclusive) = round(net × rate, 2)
    - tax (inclusive) = round(net × rate / (1 + rate), 2)
    - header totals = sums of the lines
    - rounding adjustment to 5 sen when the policy is on, kept as its own amount

## Statuses

| Document | Statuses |
|---|---|
| Enquiry | NEW, FORWARDED, QUOTED, LOST |
| Quotation | DRAFT, PENDING_APPROVAL, RELEASED, ORDERED, LOST, SUPERSEDED (old revision). *Expired* is shown when RELEASED and past valid-until, not stored |
| Sales order | DRAFT, PENDING_APPROVAL, RELEASED, PARTIAL, DONE (flag `balanceCancelled` → chip "Balance cancelled"), CANCELLED |
| Delivery order | DRAFT, CONFIRMED (chip "Delivered") |
| Invoice | DRAFT, PENDING_APPROVAL, RELEASED. *Unpaid, Overdue* and *Paid* are worked out from balance and due date. A rejection sends it back to DRAFT with the comment |
| Proforma | DRAFT, SENT, PAID, USED, CANCELLED |
| Cash sale | DRAFT, RELEASED |
| Debit note | DRAFT, RELEASED |
| Sales return | DRAFT, RELEASED |
| Cancel order | DRAFT, RELEASED |

Like the quotation and invoice, a rejected sales order goes back to DRAFT with the approver's comment. There is no REJECTED status in Sales.

## Events Sales publishes

| Event | When |
|---|---|
| `sales.order.released` | SO released. Buy-to-order lines tell Purchase to draft a PO |
| `sales.order.balance_cancelled` | Cancel order released |
| `sales.shipment.requested` | DO confirmed (Inventory) |
| `sales.invoice.released` | Finance receivable, LHDN e-Invoice |
| `sales.return.released` | Inventory stock in, Finance and LHDN credit note |
| `sales.debit_note.released` | Finance, LHDN |
| `sales.cash_sale.released` | Finance receipt, Inventory stock out, LHDN (own or consolidated) |

Each event is written in the same transaction as the document change, together with `sys_activity` and the `sys_doc_link` edges.

## Events Sales listens to

| Event | What Sales does |
|---|---|
| `purchase.buy_to_order.handled` | Puts the PO number, or the reason there is none, on each buy-to-order line |
| `purchase.goods.received` | Adds the received quantity to the order lines on that PO; received goods count as ready on the delivery waiting list |
| `purchase.order.balance_cancelled` | Adds the cancelled quantity to those lines, counting only what the order is short |

Purchase and Sales react to each other as **module listeners** (`OutboxConsumers.listen`). A listener never changes an event's status, so the "not connected" banners stay true for Inventory and Finance. See `EVENTS.md` → *Two kinds of consumer*.

## Frontend notes (Sales)

- **Sidebar:**
  - *Sales Transaction:* Enquiry, Draft Quotation (opens the quotation list on the Draft tab), Quotation, Sales Order, Delivery Order, Cancel Order.
  - *Billing:* Proforma Invoice, Invoice, Cash Sales, Debit Note, Sales Return.
  - *Operation Policies:* Credit Control, Document Types, Enquiry Types, Excluded Items, Email Templates.
  - *Reports.*
- **Routes** carry `meta: { code: 'S11', title: 'Sales order', menuGroup: 'transaction' }` like Purchase.
- **S04 Add item** is one dialog reused by quotation, sales order, invoice and cash sale. It shows the price list price, last price sold to this customer, stock at the branch, and greys out excluded and not-for-sale items with the reason.
- **S20 Print preview** is an HTML A4 page. The browser's own print is fine; no PDF library.
- **S05 Reports:** all seven tabs are built: *Sales by customer* (S9) and, since 19 Oct 2026, the other six (see *Sales reports* at the end of this file).
- **Banners:**
  - Inventory, Finance and LHDN not connected: amber, as in the mockups.
  - LHDN shows "e-Invoice: pending". Nothing is ever submitted in this phase.

## Build order for phase 2 (stop after each step for the user to review)

**S0 · Planning.** This section and `SALES_SEED_DATA.md`. The user confirms the mockup conflict choices.

**S1 · Master data, schema and seed.**
- Add the `mdm_customer` and price list tables, items, users and roles.
- Add `fin_receipt_stub`.
- Extend `NumberingService` (formats, monthly restart).
- Add all `sal_` tables.
- Seed `SALES_SEED_DATA.md`.
- Run `prisma migrate dev` and `db seed`, and print row counts plus checks such as balance due 84,640.00, overdue 36,900.00 and September ordered 274,098.00.
- Purchase seed checks must still pass.

**S2 · Sales shell.**
- Purple theme and `ModuleLayout` with the Sales menu.
- All Sales routes, with placeholders for screens not built yet.
- S01 Sales home with its dashboard API.
- The launcher Sales tile opens Sales.
- Sales users in the dev switcher.
- *Review with the user.*

**S3 · Sales orders, credit check and approvals.** S10 list, S11 form, S12 credit check failed, S02 approvals inbox, S04 add item. This is the core loop.

**S4 · Enquiry and quotation.** S06, S07, S08, S09: discount approval, revise, lost, and transfer to sales order.

**S5 · Delivery.** S15, S16: waiting list, confirm delivery, and the deposit hold.

**S6 · Invoices.** S17, S18 (create from delivered), S19 (price and credit approval), S20 print preview.

**S7 · Proforma.** S21, S22, and using the deposit on the invoice.

**S8 · Fixes and counter.**
- S13, S14 cancel order
- S27, S28 sales return
- S25, S26 debit note
- S23, S24 cash sale

**S9 · Flow, settings and report.** S03 document flow, S29 credit control, S30 document types, S31 enquiry types, S32 excluded items, S33 email templates, S05 sales by customer.

**S10 · Link with Purchase.**
- Purchase listens to `sales.order.released`: buy-to-order lines auto-draft a PO when the Purchase setting "Auto-draft a PO for buy-to-order sales lines" is on, and Purchase answers with `purchase.buy_to_order.handled`.
- Sales listens to `purchase.buy_to_order.handled`, `purchase.goods.received` and `purchase.order.balance_cancelled` to show buy-to-order line status.
- Decided at the end of Phase 2: Purchase demand comes from a Purchase-owned table fed by Sales events (`pur_sales_demand`, `SALES_SEED_DATA.md` conflict 16). P04's seed estimate is RM 15,440.00, because SO-0008 is not released. `sal_demand_stub` is dropped.

**Definition of done for every Sales step:** the same as Purchase. The screen matches its mockup (or the choice in the conflicts list); the seed shows the mockup numbers; rules have unit tests; backend `npm run build` and frontend `npm run type-check` and lint pass; Purchase tests still pass; a short "what to click" note; a commit with a clear message.


---

# Phase 3 · Core module (Master Data)

**Status:** C0 to C8 are done; Phase 3 is waiting for the user's final review. C0: the Core mockups (C01–C14), `CORE_SEED_DATA.md` and the Core section in `SCREENS.md`, checked against the SRS and SDD. C1: Core module, permissions and role, numbering, audit and event helpers, the data changes below, the record-usage check, the Core shell and the C01 home. C2: items and units (C02, C03, C11). C3: customers (C04, C05) with credit fields under their own permission and the prospect link with Sales. C4: suppliers (C06, C07) with contract prices under their own permission; buyers edit suppliers. C5: price lists (C08, C09) with dated prices; Sales reads them through the port with the same answers. C6: tax codes with types and rate history (C10), reference lists (C12), warehouses with read-only locations (C13). C7: import from CSV (C14) for customers, suppliers, items and price-list prices, through the screens' own services. C8: the Core handbook's journeys A–I as end-to-end tests (`test/core-journeys.e2e-spec.ts`), the Core handbook, and a final review of the module boundaries.

Everything above still applies to Core: stack, database and API conventions, no login, the working agreement and the definition of done. This section adds what is different. **Purchase and Sales are finished; Core must not change their behaviour.** If a Core step seems to need a Purchase or Sales change, ask first.

## What Core is

- **Core owns the shared reference data** that every module reads (`MASTER_DATA_CONTRACT.md`): items, units and conversions, customers, suppliers, price lists, tax codes, warehouses and the small lists behind them.
- **Today the `mdm_` tables are filled only by the seed.** Phase 3 makes Core a working module with screens, so an administrator can create and maintain that data, with an audit trail and events.
- **Purchase and Sales behave the same.** They keep reading through `MasterDataPort`, whose methods and answers stay the same, so their tests and seed checks keep passing. The only code they get is a read-only provider for the record-usage check (below), which the user approved in C0.
- The launcher's **Core** tile ("Items, customers, suppliers, tax and price lists") opens it. The legacy system kept this in its *Common* module (SRS Appendix B.2); SRS §6.2 and SDD §8.3 have the detail.

**Not in Phase 3** (each comes with the module or phase that needs it):
- **Configuration** (users, roles, branches, company settings) and login. They stay seeded until their own phase.
- Bills of material (with MES), tax profiles and exemptions (with the *exemption permitted* flag on tax codes), merging duplicate parties, bank accounts, derived and foreign-currency price lists, item scope per branch (Sales' *Excluded items* covers selling).
- Quantity breaks on prices (SRS FR-MST-030), together with the Sales change that applies them.
- Brands, tariff codes, payment plans and departments (FR-MST-001, FR-MST-058).
- Item fields for stock and costing: stock-keeping method, costing method, minimum level, weight and size, putaway flag (FR-MST-003 to 007), with Inventory/WMS. Extra descriptions and an image (FR-MST-001).
- Party fields: company or individual, salutation, notes, several addresses and contacts, a second agent, payment and delivery terms, currency and control account (FR-MST-040, 041, 044); shared or branch-private accounts (FR-MST-047). *Tax registration number* and *tax type* from FR-MST-042 (`CORE_SEED_DATA.md` choice 8).
- Checking a TIN online with LHDN (FR-MST-043, FR-EIV-003), with the LHDN phase.
- Item codes prefixed by group (FR-MST-010) and party codes numbered per letter (BR-NUM-004).
- Inventory, WMS and Finance, as before.

## Must-read for Core

- `docs/integration/MASTER_DATA_CONTRACT.md`: entities, the three rules (same code, same meaning, one owner), field tables.
- SRS §6.2 *Master Data* and §9.2 *Master data entities*; SDD §8.3 *Master data*.
- **Mockups:** `docs/design/mockups/Core*.html` and `docs/design/screenshots/C*.png`, made in C0 in the app's current layout. Once approved they are the design, like the Purchase and Sales mockups.
- **Seed data:** `docs/design/CORE_SEED_DATA.md`: the master data as Core shows it, the rules the SRS and SDD decide (with references), and the choices made. Its choices list wins over the mockups.

## Decisions (confirmed in C0)

Checked against the SRS and SDD after the first review; where they decide, they are followed. The user approved the rest.

| # | Decision | What it means | Source |
|---|---|---|---|
| 1 | Scope | Items with units and conversions, customers, suppliers with their contract prices, price lists, tax codes, reference lists (item groups, customer categories, areas, credit terms), warehouses (locations read only). CSV import last (C7): customers, suppliers, items and price-list prices | SRS §6.2, part of it; the rest is under *Not in Phase 3* |
| 2 | Who maintains | `MASTER_DATA_ADMIN` (Admin) changes everything. The Finance Manager also changes customer credit (credit limit, overdue limit, credit term, credit scope). Buyers and the Purchasing Manager also change suppliers, but only the Purchasing Manager and the Master Data Admin change contract prices, because a contract price lets an order skip the RFQ. Everyone else reads; sales agents never change master data | SRS §3.3; choices 7 and 11 |
| 3 | Approval for changes | None: approvals are for documents. Every change is logged with before and after values | SRS FR-SEC-050, FR-WFL-001, NFR-AUD-001, DR-003 |
| 4 | Codes | Customers and suppliers numbered by `NumberingService` (`C-####`, `S-####`, module `core`). Item, unit, warehouse, price-list and tax codes typed by the user. Unique per tenant. **A code never changes after it is saved** (other systems match on codes) | SRS FR-MST-048, DR-004; SDD §8.3; contract rule 1 |
| 5 | Delete and deactivate | A record can be deleted only while nothing uses it: no Purchase or Sales document of any status and no other Core record. After that it is blocked, discontinued or ended. An item, customer or supplier cannot be blocked or discontinued while an open document uses it | SRS DR-002, FR-MST-049; SDD §5.3.1, §7.3; choice 6 says what *open* means |
| 6 | Locations | Core edits warehouses. Locations are read only: bins and stock locations belong to Inventory, which here is the WMS. Until it is connected, the seeded locations stay as they are | SRS FR-INV-001; SDD §6.1; contract checklist |
| 7 | Prospect → customer | Core's *New customer* can take an enquiry number. `mdm.customer.created` carries it, and Sales links that enquiry to the new customer (FlowS1 step 2: "the enquiry keeps its link") | FlowS1; not in the SRS |
| 8 | Theme | Core is indigo, like its launcher tile (`--tile-core`). C0 adds its module tokens to `DESIGN_TOKENS.md` | Design |
| 9 | e-Invoice identity | Items carry an e-Invoice classification code. Customers and suppliers carry TIN, ID type (`BRN`, `NRIC`, `PASSPORT`, `ARMY`; default `BRN`), ID number, sales tax no, service tax no and e-Invoice email. Missing values are flagged on C01 and on the form, never blocking. Nothing is checked online in this phase | SRS FR-MST-008, FR-MST-042, FR-EIV-002, Appendix E; SDD §12.2; choice 8 |
| 10 | Import | *Check* reads the file and saves nothing. *Load* saves the rows that passed, each on its own. Rows with a problem come back as a CSV to fix and upload again. Imports go through the same services and rules as the screens | SRS BR-STA-005, DR-005, INT-013, BR-VAL-020; SDD §9.6, §12.4 |

## Layout additions

```
backend/src/core/
├─ core.module.ts, core.permissions.ts
├─ shared/        audit diff (before/after), code rules, status rules (+ .spec.ts)
└─ items/ uoms/ customers/ suppliers/ price-lists/ tax-codes/ reference/ warehouses/ imports/ dashboard/
   each: <name>.controller.ts, <name>.query.ts, <name>.service.ts, dto/, <name>.rules.ts (+ .spec.ts)
backend/src/platform/usage/   record-usage registry (no business rules)
backend/src/purchase/usage/, backend/src/sales/usage/   their read-only providers (+ .spec.ts)
frontend/src/modules/core/    router.ts, menu.ts, types.ts, api/, views/ (one view per C-code)
docs/design/mockups/Core*.html, docs/design/CORE_SEED_DATA.md (made in C0)
```

`backend/src/master-data/` stays the read side behind `MasterDataPort`. Its Prisma adapter keeps reading the same `mdm_` tables, which Core now writes.

## Module boundaries (Core)

1. Core is the **only** module that writes `mdm_` tables. Purchase and Sales keep reading only through `MasterDataPort`.
2. `core/` never imports `purchase/` or `sales/`, and the reverse; the frontend modules likewise.
3. Core never reads `pur_` or `sal_` tables. Where a record is used comes from the record-usage check; anything else comes as events.
4. A change in Core never rewrites an existing document: documents keep their snapshots (contract rule 3).
5. Every change, in one transaction: the record, `sys_activity` with before and after values, and an `mdm.*` event.

## Record-usage check

How Core knows whether a record is used (decision 5) without reading other modules' tables. The user approved it in C0.

- **Registry:** `platform/usage/` keeps a list of providers, the same way `OutboxConsumers` keeps listeners. Core asks it about one record: an item, customer, supplier, unit, tax code, price list or warehouse.
- **Providers:** Purchase and Sales each register one. It reads only its own module's tables and answers two things: how many of its documents use the record, and which of them are open (document type, number, status). Core imports neither module.
- **Open** (`CORE_SEED_DATA.md` choice 6): a draft, a document waiting for approval, or a released document with something left to deliver, receive, invoice or bill. Released invoices waiting for payment do not count.
- **No behaviour change:** a provider only reads. Purchase and Sales tests and seed checks keep passing. Each provider has unit tests for its *open* rule. An e2e test checks the seeded answers: CH-DIN-01 on 19 documents with 7 open, C-0012 on 23 with 5 open, S-0047 on 6 with 3 open. A document counts once, whatever its revisions.
- **Lookup:** `GET /api/v1/core/usage/:kind/:code` (`item`, `customer`, `supplier`, `uom`, `tax-code`, `price-list`, `warehouse`) returns the count, the open documents and other references (Sales' excluded items). Core's pure rules in `core/usage/usage.rules.ts` turn it into the delete and block refusals.
- **Later:** WMS and MES get a provider too, answering through their API.

## Data changes (step C1)

What the contract and SRS need that the `mdm_` tables lack today:
- **On every `mdm_` table Core edits:** `version` (optimistic lock), `createdBy`, `updatedBy`.
- **Effective-dated tax** (SRS BR-TAX-006): a rate change adds a row with its own `validFrom`; a rate is never edited in place. `listTaxCodes` keeps answering the rate valid today.
- **Dated prices** (SRS BR-PRC-003/004): price-list prices carry `validFrom`, so a future price waits for its date and the price on any past date can be shown. `listPrices(onDate)` keeps its meaning.
- **Reference lists:** `mdm_item_group`, `mdm_customer_category`, `mdm_area`, `mdm_credit_term`, so these are picked from a list instead of typed (today they are free text).
- **Item:** e-Invoice classification code (SRS FR-MST-008).
- **Customer and supplier:** e-Invoice identity (SRS FR-MST-042): `idType` (default `BRN`), `idNumber`, `salesTaxNo`, `serviceTaxNo`, `einvoiceEmail`. The supplier's existing `regNo` and `sstNo` serve as its ID number and sales tax no; columns the port already reads keep their names.
- **Tax code:** `type`: `SALES_TAX`, `SERVICE_TAX` or `EXEMPT` (SRS FR-MST-055).
- **Kept as they are:** one address and one contact per party. Multiple addresses and contacts come later.

## Roles and permissions

- **New role:** `MASTER_DATA_ADMIN` (decision 2).
- **Permissions:**
  - `core.view`
  - `core.item.edit`, `core.customer.edit`, `core.customer.credit`, `core.supplier.edit`, `core.supplier.contract`
  - `core.price_list.edit`, `core.tax.edit`, `core.reference.edit`, `core.warehouse.edit`
  - `core.import`
- **Grants:**
  - `MASTER_DATA_ADMIN`: all of them.
  - `FINANCE_MANAGER`: view, `core.customer.credit`.
  - `PURCHASE_BUYER`: view, `core.supplier.edit`.
  - `PURCHASE_MANAGER`: view, `core.supplier.edit`, `core.supplier.contract`.
  - Every other Purchase and Sales role: view.
- C1's shell has a single `core.edit`. The rest of C1 splits it into the permissions above.

## Core business rules (enforce on the server, test in `*.rules.spec.ts`)

1. **Codes:** unique per tenant, never reused (not even a deleted record's code), never changed after saving.
2. **Statuses:**
   - Item `ACTIVE` / `BLOCKED` / `DISCONTINUED`.
   - Customer `ACTIVE` / `BLOCKED` / `PROSPECT`.
   - Supplier `ACTIVE` / `BLOCKED`.
   - Purchase and Sales already use only active records.
3. **Delete** (SRS DR-002, FR-MST-049):
   - Only while nothing uses the record: the record-usage check finds no document of any status, and no Core record points to it (an item's unit, a customer's price list …).
   - Otherwise 409, naming where it is used, e.g. `CH-DIN-01 is used on 19 documents, so it cannot be deleted. Discontinue it instead.`
   - A delete is logged with the record as it was, and publishes `mdm.<record>.deleted`.
   - Reference-list entries follow the same rule against Core records.
4. **Block and discontinue** (SDD §5.3.1): refused while an open document uses the item, customer or supplier. The 409 names the documents, e.g. `C-0012 is on 5 open documents (SO-0001, SO-0003, QT-0006 …). Finish or cancel them first.` *Activate* is always allowed when the required fields are filled.
5. **Required to activate:**
   - Item: name, group, type, base unit, purchase tax if purchasable, sales tax if sellable.
   - Customer: name, branch, price list, credit term.
   - Supplier: name, payment term, currency.
6. **Units:**
   - A conversion reads "1 from = factor to", and one side is the item's base unit. The factor is greater than 0.
   - A factor below 1 against the base unit is refused where it would give a fractional base quantity beyond the base unit's decimals (SRS FR-MST-017): with PCS (0 decimals), "1 BOX = 2.5 PCS" is refused.
   - The purchase and sales units are the base unit or a unit with a conversion.
   - An item's base unit cannot change once a document uses it.
   - A unit's decimals can go up any time, and down only while nothing uses the unit. A unit cannot be made inactive while an active item uses it.
   - Changing a factor never changes documents.
   - An item's barcode is unique.
7. **Tax** (SRS BR-TAX-006, FR-MST-055): every code has a type; rates are effective-dated, with no overlapping periods for the same code; documents keep the rate they used.
8. **Price lists** (SRS BR-PRC-003, BR-PRC-004): one price per item, unit and date. A future price waits for its date, and the price on any past date can be shown. Quantity breaks come later (*Not in Phase 3*).
9. **Customer credit:**
   - Credit limit and overdue limit are 0 or more, or empty for no limit.
   - Changes need `core.customer.credit` and are logged with before and after values.
10. **Contract prices** need `core.supplier.contract`: a contract price lets an order skip the RFQ (Purchase rule 4).
11. **e-Invoice gaps** (decision 9): a missing classification code, TIN or ID number is flagged on C01 and on the form. It never blocks a save, and Purchase and Sales keep working.
12. **Import** (decision 10):
    - *Check* saves nothing.
    - *Load* saves each passing row in its own transaction, through the same service as the screen.
    - A known code updates that record; an empty code adds one with the next number.
    - *Keep the codes in this file* (customers and suppliers, approved by the user on 5 Nov 2026): a new code adds a record with that code, for records coming from another system. A code that looks like a Core number (`C-0005`, `S-0005`) is refused. Records added on screen still get the next number.
    - Rows with a problem are returned as a CSV.
13. **Audit:** every save writes `sys_activity` with the changed fields, old and new values.

## Events Core publishes

| Event | When |
|---|---|
| `mdm.item.created` / `mdm.item.updated` | Item saved (including status changes) |
| `mdm.customer.created` / `mdm.customer.updated` | Customer saved. `created` may carry the enquiry number it came from (decision 7) |
| `mdm.supplier.created` / `mdm.supplier.updated` | Supplier saved, including its contract prices |
| `mdm.price_list.updated` | Price list or its prices saved |
| `mdm.tax_code.updated` | Tax rate added or changed |
| `mdm.uom.updated`, `mdm.warehouse.updated` | Unit or warehouse saved |
| `mdm.reference.updated` | Item group, customer category, area or credit term saved (module boundaries rule 5) |
| `mdm.<record>.deleted` | A record that nothing used was deleted (rule 3) |

Payloads carry the code and the full snapshot after the change, plus the list of changed fields. Purchase and Sales read through the port and need no cache, so these events are mainly for WMS, MES and Finance later. **Sales listens to `mdm.customer.created`** (listener `sales.prospect-link`) to link an enquiry's prospect (decision 7): the enquiry gets the new customer and can be quoted.

## Screens (C-codes, mockups made in C0)

| Code | Screen | Route |
|---|---|---|
| C01 | Core home: counts, recently changed, records needing attention (items without an e-Invoice classification code, parties without a TIN or ID number …) | `/core` |
| C02, C03 | Item list; item form (general, units and conversions, buying, selling, where it is used, activity) | `/core/items`, `/core/items/:id` |
| C04, C05 | Customer list (Active, Prospect, Blocked); customer form (general, address and contact, tax identity, credit, where it is used, activity) | `/core/customers`, `/core/customers/:id` |
| C06, C07 | Supplier list; supplier form (general, contact, tax identity, terms, contract prices, where it is used, activity) | `/core/suppliers`, `/core/suppliers/:id` |
| C08, C09 | Price lists; price list with its dated prices | `/core/price-lists`, `/core/price-lists/:id` |
| C10 | Tax codes with their type and rate history | `/core/tax-codes` |
| C11 | Units of measure and conversions | `/core/uoms` |
| C12 | Reference lists: item groups, customer categories, areas, credit terms | `/core/reference` |
| C13 | Warehouses; their locations read only | `/core/warehouses` |
| C14 | Import from CSV: check (saves nothing), then load the rows that pass; rows with a problem to download (idempotent on codes) | `/core/import` |

API under `/api/v1/core/...` with the usual list, detail, create, update and delete (only while unused), plus status actions (`block`, `activate`, `discontinue`). Details include where the record is used.

## Build order for phase 3 (stop after each step for the user to review)

**C0 · Planning and design.** This section; the decisions above; mockups for C01–C14 (`docs/design/mockups/Core*.html` + screenshots, same style as Purchase and Sales); `CORE_SEED_DATA.md` (the existing master-data seed plus anything the mockups show); the Core section in `SCREENS.md`; Core theme tokens. The user approves the mockups and decisions.

**C1 · Module, schema and shell.**
- Core module, permissions and role, with `core.edit` split into the permissions above.
- The data changes above, with migrations and their seed values (`CORE_SEED_DATA.md`).
- Audit diff helper; numbering for customers and suppliers.
- The record-usage check, with the Purchase and Sales providers.
- Core shell (theme, layout, menu, all routes with placeholders); C01 home with *Needs attention*; the launcher tile opens Core.
- Purchase and Sales seed checks and tests still pass.

**C2 · Items and units.** C02, C03 (with where it is used, delete and discontinue), C11.

**C3 · Customers.** C04, C05: credit fields with their own permission, the e-Invoice identity fields, where it is used, and the prospect link with Sales (`mdm.customer.created`).

**C4 · Suppliers.** C06, C07 with contract prices (`core.supplier.contract`), the e-Invoice identity fields and where it is used. Buyers and the Purchasing Manager can edit suppliers.

**C5 · Price lists.** C08, C09 with dated prices; Sales still reads prices through the port with the same answers.

**C6 · Tax, reference lists, warehouses.** C10 with tax types, C12, C13 with read-only locations.

**C7 · Import.** C14: customers, suppliers, items and price-list prices from CSV. Check first (saves nothing), then load the rows that pass, each on its own; the rows with a problem download as a CSV.

**C8 · Core journeys.** End-to-end tests for the Core journeys, the Core handbook, and a final review.

**Definition of done for every Core step:** as for Sales, plus: backend `npm run test:e2e` passes; Purchase and Sales tests and seed checks still pass unchanged; the screen matches its approved Core mockup.

---

# Phase 4 · Configuration

**Status:** A0 to A8 are done; Phase 4 is waiting for the user's final review. A0: this section, the Configuration mockups (A01–A14), `CONFIG_SEED_DATA.md` and the Configuration section in `SCREENS.md`, checked against the SRS and SDD. A1: the Configuration module; the new `sys_` tables, with users and branches moved out of `mdm_`; each module's permission catalogue, and roles as data seeded from the code grants (the permission registry reads them from the database); correlation ids on activity; the Configuration shell and the A01 home. A2: the company (A04) and branches (A05) with their rules; the record-usage check also answers for a branch (Purchase and Sales providers, read only); the before-and-after audit helper moved to the platform. A3: users (A06, A07) with roles between dates, branches and the default branch, deactivate (ends sessions), the last-Administrator rule, and role changes and deactivations in the security log. A4: roles (A08, A09) with the permission editor by module, the two data-scope switches (applied in A7), Reset to starter, custom roles deleted only while nobody holds them, and Who can do what (A10: a person, or two roles compared); a role change applies on the next request. A5: sign-in with AUTH_MODE=jwt (argon2id passwords, 15-minute access tokens, rotating single-use refresh tokens in an httpOnly cookie with reuse detection, lockout per account and network address, 30-minute idle time-out, branch switch, sign-out), the JWT guard next to the dev guard with the session checked on every request, the A02 page, the branch switch and user menu in every top bar, and the every-endpoint test (401 without a token, 403 without the permission). A6: two-factor (A03) with QR set-up and 8 recovery codes, required by role; forgot password and single-use reset and set-password links (written to the email log; new users get a set-password link); My account (A11: change password, devices, two-factor on and off, new recovery codes); sign-in settings (A14) applied on the next request; the user page's sign-in actions (send link, revoke sessions, unlock, reset two-factor); an optional demo-only fixed two-factor code for ADM (`DEMO_ADMIN_2FA_BYPASS_CODE`, logged on each use). A7: the security log (A12) and the audit trail (A13), read only with filters and CSV export; data scopes applied by the platform in the data-access layer (a Prisma query extension reads who is asking for the length of each request; Purchase, Sales and Core register the rules for their own tables, `platform/scope/`), branch scope on documents and customers, the sales-agent scope, *visible to all branches* on the Core customer form; company facts (credit exposure, record usage, Core's reference counts, outbox listeners) run as the system; scope tests in `test/scope.e2e-spec.ts`; journeys re-run, with the steps that crossed a scope moved to the right person (also in the Core and Sales handbooks). A8: the Configuration handbook's journeys A–I as end-to-end tests in sign-in mode (`test/configuration-journeys.e2e-spec.ts`), the Configuration handbook, and a final review of the module boundaries (no module imports another, backend or frontend).

Everything above still applies: stack, database and API conventions, the working agreement and the definition of done. This section adds what is different, and it **replaces "No login yet" and the "login/JWT" item of "Do not build yet"** from step A5 on. **Purchase, Sales and Core keep their behaviour**, with two agreed exceptions: sign-in (A5) and data scopes (A7). If any other step seems to need a change there, ask first.

## What Configuration is

- The SRS module **Platform and Administration** (§6.1), opened from the launcher's existing **Configuration** tile ("Users · settings").
- It owns **who works here and what they may do**: the company and its branches, users, roles and permissions, sign-in, the security log and the audit trail.
- Users and branches are seeded today and read by every module through `MasterDataPort`. Roles are granted in code by each module. Phase 4 turns all of it into data maintained on screens, and adds real sign-in.

**Not in Phase 4** (each comes with the module or phase that needs it):
- Signing in through an outside identity provider (FR-SEC-067), accounts for integrations (FR-SEC-016, with WMS and LHDN), sign-in for the client portal.
- Approval chains as data, delegation and escalation (FR-SEC-050 to 055); Purchase and Sales keep their approval rules.
- Module settings in one generated screen (FR-PLT-006, 007), feature switches (FR-PLT-010), custom fields, maintenance mode, currencies and rates (with Finance).
- Branch statutory numbers for payroll (employer, EPF, SOCSO), with payroll.
- Masking sensitive personal fields (FR-SEC-042) and payroll data rules (FR-SEC-040, 041), with payroll.

## Showing branch and company (noted 19 Oct 2026, items 1–3 built 10 Nov 2026)

**One branch control, in the top bar** (changed 10 Nov 2026 at the user's request; the first build had a second picker on the homes). For someone who works in more than one branch it offers *All my branches* (the default: every home, list and report adds their branches together, and new documents go to their default branch) or one branch (everything narrows to it, and new documents carry it). The choice is kept per device and goes back to *All my branches* when the dev user changes. Shared master data (items, suppliers, price lists, tax codes, units, warehouses) is the same for every branch on purpose.

1. **Home pages (built):** the Purchase and Sales dashboard toolbar says which branches the numbers cover ("Showing: HQ, Penang"). The KPI cards, the charts and the KPI links follow the top bar.
2. **Lists (built):** while the top bar shows all branches, every Purchase and Sales document list has a Branch filter (`?branch=` in the URL, for that list only) and a Branch column, for someone who works in more than one branch. While the top bar shows one branch, the lists' and reports' own branch filters and the column are hidden.
3. **Documents (built):** the form header shows the issuing branch (same rule); the Sales invoice A4 printout always shows it.
4. **Company:** only once there is a second company or Finance: books per company (ADR-19), the seller's legal name, TIN and SST numbers on printed invoices and e-Invoices, and reports grouped by company. Not on Purchase, Sales or Core screens while there is one company.

- **How:** the top bar's branch travels with every request as the `x-view-branch` header; a list's own `?branch=` wins over it. Either narrows the data scope to that branch for the tables whose scope rule sets `viewFilter` (Purchase and Sales documents; `platform/scope/scope.rules.ts`). It never widens: a branch the user does not work in shows nothing. Customers keep their own scope, so a customer's name never goes missing on a document. Every home, list, report and chart that reads through the scope follows it with no code of its own. Reads of one record (`findUnique`, `findFirst`) are not narrowed, so a link to a document of another of the person's branches still opens.
- **PO approval limits:** a branch without its own PO limit uses the limit of the nearest branch above it (`inheritLimitRules`), so a branch added later is never left without approval; Approval Rules (P24) says which branches follow which limit, and warns about any active branch with no limit at all.
- **Tests:** `scope.rules.spec.ts`, `approval-limit.rules.spec.ts`, `test/scope.e2e-spec.ts` (every list: HQ + Penang = all; a Penang-only person asking for HQ gets nothing; the Purchase home).

## Must-read for Configuration

- SRS §5 *User Roles, Permissions and Access Control*, §6.1 *Platform and Administration*, §13.4 *Security*, §13.5 *Auditability*.
- SDD §10 *Authentication and Authorisation*, §8.2 *Platform and identity*, §7.5 *Tenancy*, ADR-05, ADR-19.
- **Mockups:** `docs/design/mockups/Cfg*.html` and `docs/design/screenshots/A*.png`, made in A0 in the app's current layout.
- **Seed data:** `docs/design/CONFIG_SEED_DATA.md`: the company, branches, users, starter roles, permission catalogue, sign-in settings, data scopes, the rules the SRS and SDD decide, and the choices made. Its choices list wins over the mockups.

## Decisions (confirmed by the user on 14 Oct 2026)

| # | Decision | What it means | Source |
|---|---|---|---|
| 1 | Scope | Company and branches, users, roles and permissions, sign-in with two-factor, my account and sessions, sign-in settings, security log, audit trail, data scopes | SRS §5, §6.1; user |
| 2 | Company | One company, CLB Groups Sdn Bhd, with HQ and Penang as its branches. A company is separate from its branches | SDD ADR-19; user |
| 3 | Packages | `argon2`, `@nestjs/jwt`, `cookie-parser`, `otplib` are approved | User |
| 4 | Two-factor | Built now (TOTP), required for Administrator, Master Data Admin, Finance Director and Finance Manager, in sign-in mode only | SRS FR-SEC-061; user |
| 5 | Data scopes | Built in this phase (A7): branch scope on documents and customers, sales-agent scope, on every route | SRS FR-SEC-020 to 033; user |
| 6 | Dev mode stays | `AUTH_MODE=dev` keeps the user switcher and `x-dev-user`, so the tests and the three handbooks keep working; `AUTH_MODE=jwt` turns on sign-in | Working agreement |
| 7 | Roles as data | Starter roles are today's code grants, unchanged; Administrator holds everything and cannot be changed; new starter role Auditor | SRS FR-SEC-001, 003, 014, 015 |
| 8 | Ownership | Users and branches move to Configuration's `sys_` tables; `MasterDataPort` keeps giving the same answers | SDD 8.2; choice 3 |

## Layout additions

```
backend/src/configuration/
├─ configuration.module.ts, configuration.permissions.ts
├─ shared/        password policy, lockout, scope rules (+ .spec.ts)
└─ organisation/ users/ roles/ auth/ account/ settings/ security-log/ audit/ dashboard/
   each: <name>.controller.ts, <name>.query.ts, <name>.service.ts, dto/, <name>.rules.ts (+ .spec.ts)
backend/src/platform/context/   the permission registry reads roles from the database; a JWT guard next to the dev guard
backend/src/platform/scope/     data-scope registry: modules register their scope providers (A7)
frontend/src/modules/configuration/   router.ts, menu.ts, types.ts, api/, views/ (one view per A-code)
frontend/src/modules/auth/            sign-in, two-factor, set and reset password pages (outside the module layout)
```

## Module boundaries (Configuration)

1. Configuration is the only writer of the identity and organisation tables (`sys_legal_entity`, `sys_branch`, `sys_user`, `sys_role` …). Other modules read users and branches through `MasterDataPort` and permissions through `@RequirePermission()`.
2. `configuration/` never imports `purchase/`, `sales/` or `core/`, and the reverse. Each module declares its own permission catalogue and starter grants; the platform aggregates them (FR-SEC-010).
3. Data scopes are applied by the platform: modules register a scope provider for their own tables (A7); Configuration owns only the user's branches and the role switches.
4. Every change, in one transaction: the record, `sys_activity` with before and after values, and a `config.*` event. Sign-in events go to `sys_security_event`.

## Data changes (step A1)

- **New tables:** `sys_legal_entity`, `sys_branch` (tree, document prefix, MyInvois branch name), `sys_user` (with password hash, two-factor secret and recovery codes, lockout counters), `sys_role` (with the agent-scope switches), `sys_role_permission`, `sys_user_role` (with optional valid-from and valid-until), `sys_user_branch` (with the default branch), `sys_session` (refresh-token family, device, last activity), `sys_login_attempt`, `sys_security_event`, `sys_setting` (sign-in settings), `sys_auth_token` (single-use reset and set-password links).
- **Moved:** `mdm_user` and `mdm_branch` into `sys_user`, `sys_user_role`, `sys_user_branch` and `sys_branch`. `MasterDataPort.listUsers`, `findUser` and `listBranches` keep their shapes.
- **Changed:** `sys_activity` gets a `correlationId`, set by the platform from the request (FR-PLT-016). `mdm_customer` gets `visibleToAllBranches` (A7, FR-SEC-033).
- **Permission registry:** reads role grants from the database (cached, cleared on any role change), so a role change applies on the next request. `ADMIN` keeps holding every permission.

## Roles and permissions

- **Permissions:** `config.view`, `config.organisation.edit`, `config.user.edit`, `config.role.edit`, `config.settings.manage`, `config.security.view`, `config.audit.view`.
- **Grants:** Administrator all of them. Auditor `config.view`, `config.security.view`, `config.audit.view`, plus `purchase.view`, `sales.view`, `core.view`. Every signed-in user may open *My account*.
- **Catalogue:** each module exports its permission keys with an object and action label (Purchase 17, Sales 23, Core 11, Configuration 7; Sales' two receipt keys, the signature and Management's exceptions came in phase 5). Adding labels is declarative; no permission check changes.

## Sign-in (A5, A6)

| Element | Design | Source |
|---|---|---|
| Who | Email or user code, and password | FR-SEC-060; choice 11 |
| Password | argon2id; at least 10 characters; common passwords refused; no forced rotation | NFR-SEC-003; SDD 10.2 |
| Lockout | 5 wrong passwords lock for 15 minutes, counted per account and per network address; every attempt recorded | FR-SEC-062; SDD 10.2 |
| Tokens | Access token (JWT) for 15 minutes with user, tenant, session and active branch. Refresh token opaque, stored hashed, in an httpOnly cookie, 30 days, single use with rotation; reuse ends the whole session and logs a security event | NFR-SEC-008; SDD 10.2 |
| Idle | A session ends after 30 minutes without activity | FR-SEC-065 |
| Branch switch | Re-issues the access token with the new active branch; the branch cannot be set by a header in sign-in mode | FR-SEC-021; SDD 10.2 |
| Two-factor | TOTP with 8 recovery codes; required by role (setting); the Administrator can reset it | FR-SEC-061; choices 9, 13 |
| Sessions | Each user lists and revokes their own; the Administrator revokes anyone's | FR-SEC-065 |
| Reset | Single-use link valid 60 minutes, written to `sys_email_log`; new users get a set-password link, never a password | FR-SEC-063, 064; choice 10 |
| Coverage | Every endpoint needs a signed-in user except sign-in, reset and health. A test calls every route without a token (401) and without the permission (403) | FR-SEC-008; SDD 10.4 |

## Data scopes (A7)

- **Branch scope:** documents of Purchase and Sales by their branch, and customers by their branch unless *visible to all branches*. A user sees their own branches; the active branch stamps new documents. Applied by registered scope providers inside each module's queries, on lists, records, look-ups, reports, exports and dashboards.
- **Sales-agent scope:** for a user holding an agent-scoped role (seed: Sales agent), only customers whose default agent is the user, and only the sales documents of those customers. The two switches on the role control customers and documents separately (FR-SEC-031).
- **Not scoped:** suppliers, items, price lists, tax codes, warehouses (shared master data); event listeners and the seed (the *system*, logged).
- **Out of scope answers 404**, never 403 (SDD 10.3.1).
- **Tests:** for each scoped list and record endpoint, a Penang-only user cannot reach an HQ record and an agent cannot reach another agent's customer, by any route (SDD 10.4). The Purchase, Sales and Core journeys are re-run, and steps that cross a scope move to the right person.

## Configuration business rules (enforce on the server, test in `*.rules.spec.ts`)

1. **Codes** of companies, branches, users and roles are unique, never reused and never change.
2. **Administrator:** holds every permission; cannot be edited or deleted; at least one active user always holds it.
3. **Users:** an active user has at least one role and one branch, and a default branch among them. A user is deactivated, never deleted once they have signed in or appear in any document or activity. Deactivating ends their sessions.
4. **Role assignments:** valid-until on or after valid-from; an expired assignment stops giving permissions on that day; a role cannot be deleted while a user holds it.
5. **Permissions:** a role can only hold keys from the catalogue.
6. **Branches:** a branch cannot be its own ancestor; a branch is made inactive only when no active user has it as their only branch and no open document needs it; a company is made inactive only when none of its branches is active.
7. **Passwords and lockout** as in *Sign-in*; a reset or set-password link works once and expires.
8. **Two-factor:** a user whose role requires it cannot finish sign-in without it; set-up needs a correct code; resetting it is logged.
9. **Audit:** every change writes `sys_activity` with old and new values; the security log and the audit trail cannot be changed or deleted through the application.

## Events Configuration publishes

| Event | When |
|---|---|
| `config.user.created` / `config.user.updated` | User saved, including roles, branches and status |
| `config.role.updated` | Role or its permissions saved |
| `config.branch.updated`, `config.legal_entity.updated` | Branch or company saved |

Payloads carry the code, the snapshot after the change and the changed fields. No module listens yet; Finance, WMS and MES will. Sign-in, lockout, password, two-factor and session events go to `sys_security_event`, not the outbox.

## Screens (A-codes, mockups made in A0)

| Code | Screen | Route |
|---|---|---|
| A01 | Configuration home: counts and *Needs attention* | `/config` |
| A02, A03 | Sign in; two-factor set-up and code | `/sign-in`, `/sign-in/two-factor` |
| A04 | Company, with its branches | `/config/company` |
| A05 | Branches: tree and branch form | `/config/branches` |
| A06, A07 | User list; user form (person, roles with dates, branches, sign-in) | `/config/users`, `/config/users/:id` |
| A08, A09 | Role list; role form (data scope, permissions by module, users) | `/config/roles`, `/config/roles/:id` |
| A10 | Who can do what: a person's permissions; compare two roles | `/config/permissions` |
| A11 | My account: password, two-factor, sessions | `/account` |
| A12 | Security log | `/config/security-log` |
| A13 | Audit trail | `/config/audit` |
| A14 | Sign-in settings | `/config/sign-in-settings` |

## Build order for phase 4 (stop after each step for the user to review)

**A0 · Planning and design.** This section; the mockups A01–A14; `CONFIG_SEED_DATA.md`; the Configuration section in `SCREENS.md`; the slate tokens in `DESIGN_TOKENS.md`. The user approves.

**A1 · Module, schema and shell.** Configuration module and permissions; the new tables and the move of users and branches; the permission catalogue and roles as data, seeded from the code grants; correlation ids on activity; Configuration shell and A01 home; the launcher tile opens it. Purchase, Sales and Core tests, seed checks and journeys pass unchanged.

**A2 · Company and branches.** A04, A05.

**A3 · Users.** A06, A07: roles with dates, branches and default branch, deactivate.

**A4 · Roles and permissions.** A08, A09, A10: permission editor, reset to starter, data-scope switches, a person's permissions, compare two roles.

**A5 · Sign-in.** A02 and the sign-in flow: passwords, tokens, lockout, branch switch, sign-out; the top bar's branch switch and user menu; the JWT guard next to the dev guard; the every-endpoint 401/403 test.

**A6 · My account and two-factor.** A11, A03, A14: change password, sessions, reset and set-password links, two-factor with recovery codes.

**A7 · Security log, audit trail and data scopes.** A12, A13; the scope registry and providers in Purchase, Sales and Core; *visible to all branches* on customers; the scope tests; journeys re-run.

**A8 · Configuration journeys.** End-to-end tests for the Configuration journeys, the Configuration handbook, and a final review.

**Definition of done for every Configuration step:** as for Core, plus: the Purchase, Sales and Core journeys pass in dev mode (and, from A7, with the scopes on); from A5, the every-endpoint test passes.

---

# Home dashboards (D1, after Phase 4)

**Status:** D1 is done (19 Oct 2026, asked for by the user). The Purchase and Sales homes keep their four KPI cards; below them each person picks their own charts (*Add chart*, move, remove, *Clear*, 2 or 3 columns, *Put back the default charts*), saved on the server so they follow the person to any computer. SRS RPT-035 to RPT-039.

- **Platform, no business rules:** `platform/indicators/` holds the `IndicatorRegistry` (each module registers one board of indicators at start-up, the way listeners register with `OutboxConsumers`), the layout rules (`dashboard.rules.ts`: 2 or 3 columns, at most 12 charts, each once, only the board's own) and `DashboardBoardsService` (view, save, reset). Layouts live in `sys_user_dashboard`, one row per person and board; no row means the module's default charts. A layout is a personal preference: no activity line and no event.
- **Modules own their charts:** `purchase/dashboard/purchase.indicators.ts` and `sales/dashboard/sales.indicators.ts`. An indicator reads only its own module's tables and is calculated inside the request, so the data scopes apply (an agent's charts show only their own customers). A chart that fails shows its own message; the others still load.
- **API:** `GET`, `PUT { cols, cards }` and `DELETE /api/v1/{purchase|sales}/dashboard/board`, under the module's view permission. Every answer carries the cards already calculated, plus the catalogue for *Add chart*.
- **Frontend:** `components/erp/DashboardBoard.vue` (toolbar, KPI slot, grid, *Add chart* dialog) and `IndicatorCard.vue` (table, list, bars, monthly columns), drawn with plain HTML and CSS: no chart library.
- **Defaults:** each home opens with the cards it had before D1. Sales: recent orders, waiting for your approval, ordered by agent. Purchase: recent orders, buy soon, committed spend by supplier; since 19 Oct the last two count as `PurHome.html` does (`SEED_DATA.md`, *Purchase home on 29 Sep*).
- **Tests:** `test/dashboards.e2e-spec.ts` checks the charts against the screens and reports (September RM 274,098.00 ordered, balance due RM 84,640.00), the layout rules and the scopes.
- **Later (proposed, not started):** Purchase reports (the Sales reports are built, below); a launcher *My dashboard* across modules once Finance exists. The Core and Configuration homes keep their fixed cards.

---

# Sales reports (S05, after Phase 4)

**Status:** done (19 Oct 2026, asked for by the user). The six S05 tabs that showed a placeholder are built beside *Sales by customer*. The mockup designs only Sales by customer, so the others follow its layout (title with Schedule email, PDF and Export to Excel; a filter row kept in the URL; four KPI cards; a chart and tables) and take their content from the SRS.

| Tab | What it answers | Source |
|---|---|---|
| Sales by item | The orders behind Sales by customer, per item and unit (quantities only add up within one unit) and per item group | Legacy *Sales Summary By Item / Item Group* |
| Open orders | Every order not finished, line by line: what is left to deliver and to invoice, its value, and what it waits for (approval, a draft cancel order, deposit, purchase, stock, ready, invoice), using the delivery waiting list's rules | RPT-024 |
| Quotation conversion | Quotations sent in a month (latest revision; drafts left out; migrated ones in, as the Quotation list counts them) and how they ended: turned into order, still open, expired, lost; rates by count and value, by agent, reasons, days to order | Legacy *Quotation Summary* |
| Customer aging | What each customer owes today (the Invoices list's balances) in 4, 6 or 12 steps of 30 days, by due date or by invoice date; overdue always counts from the due date | RPT-023 |
| Invoice register | Invoices, debit notes and credit notes (sales returns, shown negative) released in a month, with balance, payment and e-Invoice state; migrated ones marked | Legacy *Invoice Summary* |
| e-Invoice status | Every document released in Zora that needs its own LHDN e-Invoice, its state from the release event, days waiting and a missing-TIN warning; each month's consolidated e-Invoice, counted as the Cash Sales list counts it | FR-EIV-010 |

- **Backend:** `sales/reports/`: one query and one pure rules file per report (+ specs), and `report-filters.ts` for the shared filter row. `GET /api/v1/sales/reports/{by-customer|by-item|open-orders|quotation-conversion|customer-aging|invoice-register|e-invoice-status}` under `sales.view`. Reports read inside the person's request, so the data scopes apply (RPT-020).
- **Frontend:** one view per tab, built from shared pieces: `components/erp/FilterSelect`, `ReportActions` and `BarRows`, `composables/useReport.ts` (filters in the URL) and `utils/csv.ts` (Export to Excel with numbers kept as numbers, RPT-025). Sales by customer uses them too; its chart rows are back to the mockup's 190px label, bar, 110px value.
- **Tests:** `test/sales-reports.e2e-spec.ts` pins every tab's seed numbers (and, once CO-0002 is released, Sales by customer matches its mockup); `test/scope.e2e-spec.ts` checks all seven reports against two agents (RPT-020). The Sales handbook walks them as journey L. The seed's answers are in `SALES_SEED_DATA.md` → *Reports (S05) on 29 Sep*.

---

# Installing a client

**Status:** built on 5 Nov 2026 (the user chose system items only). `prisma db seed` is the demo only: it wipes documents and creates users with a known password, so it refuses to run with `NODE_ENV=production` or on a database that holds a tenant other than `CLB`.

```powershell
npx prisma migrate deploy
npm run client:install -- path\to\client.json   # prisma/client.example.json shows the file
```

- **Creates:** the tenant, company, first branch, starter roles, one administrator, document numbers from 1, sign-in, Purchase and Sales settings at the standard defaults, email templates, one enquiry type (General), and the walk-in customer C-CASH with its price list.
- **Does not create:** items, suppliers, other customers, units, tax codes or warehouses. The client adds or imports them in Core. Approval rules name a role and no person, so a request goes to whoever holds that role; there is no screen yet to name one person. Locations are not created, and there is no screen or API for them yet, so a goods receipt cannot be confirmed until they exist (they come with the WMS, stage 2).
- **Administrator:** has no password. The command prints a single-use set-password link (valid 72 hours), and two-factor is set up at first sign-in.
- **Safe to run by mistake:** it deletes nothing and refuses a tenant code that already exists.
- **Server settings:** `AUTH_MODE` has no default. With `NODE_ENV=production` the server only starts with `AUTH_MODE=jwt`, `COOKIE_SECURE=on`, its own `DEV_TENANT_CODE`, and `DEV_TODAY` and `DEMO_ADMIN_2FA_BYPASS_CODE` empty.
- **Tests:** `test/install.e2e-spec.ts`, `src/config/env.spec.ts`.

---

# Live stock from a WMS

**Status:** read-only stock figures, built on 5 Nov 2026. Goods in and out are not connected yet. Client data never goes in this repo.

- **Switch:** set `WMS_URL`, `WMS_EMAIL` and `WMS_PASSWORD`. Without them the server keeps the `inv_stock_snapshot` stub, so other clients and the demo are unchanged.
- **How:** `integration/wms-stock.adapter.ts` implements `StockPort`. One tag with status `INBOUND` is one unit on hand, and a WMS SKU is the ERP item code. Tags are counted because the WMS `inventory` table is per product only and can count more than is on the shelves. Answers are reused for 15 seconds. If the WMS cannot be reached, screens get the last figures and nobody is blocked.
- **Banners:** `StockPort.connected` means the figures are live. `movementsConnected` means stock moves reach the warehouse, and it stays false, so the amber "queued" banners on receipts, deliveries, returns and cash documents stay true.
- **Not yet:** `usedLast30Days` is 0, `mdm_location` is not filled from the WMS, and the WMS login is an ordinary user until service accounts exist (FR-SEC-016).

---

# WMS read-only view (W00–W05)

**Status:** built on 6 Nov 2026, approved by the user. A home and five screens that show a client's WMS inside the ERP: Inventory, Stock Location, EPC Lookup, Receiving, Shipping. The home works like the Purchase and Sales homes: tiles, KPI cards and each person's charts. This is stage 1 of `docs/integration/WMS_DATA_OWNERSHIP.md`, which says which system owns what. Stage 2 (master data sync, goods in and out) is not built.

- **Read only by construction:** `integration/wms-client.ts` can sign in and send GET, nothing else. `wms/wms.controller.ts` has GET routes only. The one thing the module saves is a person's chart layout, in the ERP (`sys_user_dashboard`). `test/wms.e2e-spec.ts` checks both against a fake WMS. The ERP never generates tags, prints stickers or changes a tag.
- **Stores nothing:** no tables. Lists are reused for 15 seconds, so a scan shows within that time. If the WMS goes down, a list shows the last answer with a warning; a tag lookup gets 503 `WMS_UNAVAILABLE`.
- **Counting:** one RFID tag is one unit. Inventory and Stock Location count tags on the shelf (INBOUND and ALLOCATED). Tags not scanned in, shipped, quarantined or disposed do not count. The `StockPort` figures other screens read count INBOUND only, so a reserved unit shows here but not as free stock there.
- **Core adds** an item's group and reorder level. A WMS SKU Core does not know shows as *Not in ERP*.
- **Permission `wms.view`:** Administrator, Auditor, Buyer, Purchasing Manager, Branch Manager, Store, Sales Manager, Finance Director, Finance Manager and Master Data Admin. Sales agents and Sales store are left out, because Shipping names every customer and agents see only their own. The data scopes do not reach WMS data, so do not grant this to an agent-scoped role.
- **Settings:** `WMS_URL`, `WMS_EMAIL`, `WMS_PASSWORD`, and `WMS_WEB_URL` for the *Open in WMS* button. Without `WMS_URL` the tile stays *Coming soon*.
- **Limits:** the WMS lists tags, receivings and shipments whole, so these screens filter and page in memory. That is fine for now; paging in the WMS is needed at real volumes. Tag history is the WMS's summary dates, not every scan. A shipment names no warehouse, so Shipping has no warehouse filter (the mockup was changed to match).
- **Client data never goes in this repo:** tests and mockups use neutral codes. A client's demo data lives outside the repo.

---

# Guided tours (Help), T1–T6

**Status:** T1 built on 20 Nov 2026 (asked for and approved by the user): the tour engine, the Help panel, Tutorial mode, progress saved per person, the welcome card and the welcome tour *Find your way around*. T2 built the same day, after the user's review: four Sales tours in `modules/sales/tours.ts` (*Your Sales home*, *Make a sales order*, *Approve a request*, *Ring up a cash sale*, from Handbook Sales M, B, A and I). Next, at the user's request, the client demo's field sales and warehouse (T6, built on 20 Nov 2026, following that demo's handbook in neutral words, since client names never go in this repo): *A household order*, *Record a payment* and *Verify payments* in Sales; *Service home and jobs*, *Book on the Planning Board*, *Record the visit* and *Service reminders* in `modules/service/tours.ts`; *The warehouse in the ERP* in `modules/wms/tours.ts`. Each is offered only where its feature is on (`Tour.requires`: the Service module, a connected WMS, or a Sales Flow switch; `tours/features.ts`). Then, the same day, the first **journey** (`tours/journeys.ts`, asked for by the user): *One order, every department*, one household order through the client's eight-stage process (sales, submission, scheduling, warehouse, installation, account, after-sales, management), switching person at each hand-off, using only what the ERP does today; stages it does not do yet are said so in the steps ("Not built yet: …"). The user chose: journeys follow the client's process diagram, not the standard enquiry → invoice flow, and change no client flow; the administrator stands in for the Sales Admin. T3 Purchase, T4 Core and T5 Configuration wait. The tours turn the Handbook's journeys into short walks through the real screens; the Handbook (a published page, not in this repo) stays the testers' script.

- **Our own small engine, no tour library** (user's choice: Shepherd.js and Intro.js need a paid licence, React Joyride is React only, Driver.js would not handle the waiting or PrimeVue's overlays). `frontend/src/tours/`: `engine.ts` (steps, waits, the guard, pause and resume), `tour.rules.ts` and `placement.rules.ts` (pure, with Vitest specs), `TourLayer.vue` (mounted once in `App.vue`), `TourBox.vue`, `HelpButton.vue`, `HelpPanel.vue`, `WelcomeCard.vue`, `tours.css`, `registry.ts` (every tour), `welcome.tour.ts`. Module tours go in `modules/<module>/tours.ts` and are added to the registry.
- **A tour never does something real for the person** (the user's rule): while a step shows, every click except the tour's own controls, and the highlighted element on a step that asks for it, is stopped before the page sees it (keyboard and form submits too). Inside the highlight, a button that writes or changes records is stopped as well: its words (Approve, Reject, Release, Post, Delete, Pay, Verify, Confirm, Send, Email, Award, Cancel …, Record payment …, and since T2 Save, Create, Transfer, Convert, Duplicate, Import, so a practice run leaves no draft and uses up no number), the danger and delete button styles, or `data-tour-sensitive` on anything else (the new-customer dialog's *Add customer*, the reason dialog's confirm, adding a file in `FileTiles`). Since T6 also Book, Extend, Dismiss, Close job, Make jobs, Take off. Words count only on short labels (up to 40 characters, `ACTION_LABEL_MAX`), so a job or request card whose customer is named "Post Office" is not taken for a button. A tour fills a form with the person, then points at Save or Release and leaves pressing them to the person. Links are never sensitive (opening a page changes nothing). A shipped tour may explain such a button but never wait for it to be pressed: `tourProblems` refuses it, and `registry.spec.ts` runs it over every tour. Pausing or leaving the tour gives the page back, so doing it is the person's own act outside the tour.
- **Always optional:** every step has Pause, Exit and Back or Skip step; Esc pauses; the welcome card has *Not now* and *I know my way around* (Tutorial mode off); Help always has Tutorial mode and *Start again*. A tour is only offered to people holding its `permission`, and a step whose element the person does not have is left out (`optional`) or offers Skip.
- **Steps** point at `data-tour="…"` ids. The shared frames carry them: `launcher:tiles`, `home:main`, `home:switcher`, `rail`, `rail:switcher`, `rail:groups`, `rail:<group>`, `rail:footer`, `menu-panel`, `menu:<item>`, `search`, `approvals`, `branch`, `account`, `help`, `crumbs`, `page-header`, `page-actions`, `filters`, `status-tabs`, `list`, `pager`. Ids for buttons that do something start with `action:`. Waits: next, click, hover, page (by path, layout, module or screen code), appear (a selector), fill (a picker marks itself `data-filled="true"` once a choice is made, so typing a few letters does not count); a step may word its own waiting line. `registry.spec.ts` fails when a tour names an id no `.vue` file has. While the person works: an open dropdown or date picker fades the box and lets clicks through; a step inside a dialog raises the highlight above it, and when the box would cover an open dialog it shrinks to a one-line chip in the freest corner. Skipping a step that opens a page (nothing to open) leaves out the optional steps on that page quietly; a required one says it is on a page not opened yet.
- **Journeys** (`Tour.journey`, dev mode only, `requires: ['dev', …]`): one document through several people. A *switch person* step (`wait: { kind: 'user', role, sameBranchAs? }`) names who holds the role from the demo's own people (`{people}`), at the remembered document's branch when it matters, and moves on when the person in use fits. A **hand-over** step (`handover: true`) is the user's rule for real actions inside a journey: the tour explains the button; only when the person chooses *I'll do it now* is the page theirs (no guard, no dimming, a *Your turn* strip with *Carry on*), they press the real button themselves, and the tour carries on when it sees the outcome (`page`, `appear`, or `gone`). The tour itself still never presses anything. `remember` keeps a page with its document number and branch (`{order}` in texts), `go` opens a page or `@remembered` one. A journey goes on through a person switch, and its place and memory are kept on the device (`zora.tour.journey`), not with one person. Status chips carry `data-status`, so a hand-over can see *Released*, *Confirmed*, *Verified*.
- **Progress per person, on the server** (`sys_user_tutorial`: Tutorial mode, welcome seen, tours done, a tour left mid-way with its step and page), `GET`, `PUT`, `DELETE /api/v1/me/tutorial`, any signed-in person, no permission. A personal preference like the home charts: no activity line, no event. A copy is kept in the browser for when the server cannot be reached; a save never goes out as someone else after a person switch. The seed clears it, so every demo user starts as a first-time user.
- **Look:** the module's colour (`--tour-accent`, the launcher's navy on the launcher), ERP buttons and cards, the layout's motion; on a phone the box docks at the bottom. Tokens in `DESIGN_TOKENS.md` → *Guided tours*.
- **Tests:** frontend `npm run test:unit` (Vitest, dev only, approved 20 Nov 2026): `tour.rules.spec.ts`, `placement.rules.spec.ts`, `registry.spec.ts`. Backend `tutorial.rules.spec.ts`, `test/tutorial.e2e-spec.ts`; the every-endpoint test lists the three routes as signed in only. When a Handbook journey changes, update the Handbook, its e2e spec and its tour together. A journey that writes is tested on a throwaway copy of the client demo database (separate ports), never on the demo itself.

---

# Module access (10 Nov 2026)

**Status:** built, asked for by the user. A person who opens a module or page their roles do not allow gets one calm page instead of a module full of errors.

- **Launcher:** `GET /me/modules` marks a built module the person cannot view as `NO_ACCESS` (tag "No access", no route), from each module's catalogue `viewKey`. "Coming soon" stays for modules not built (MES, and WMS where none is connected).
- **No-access page:** `modules/common/NoAccessView.vue`, shown by `App.vue` in place of the page when the route's permission is missing. A route needs its module's view permission (`modules/common/access.ts`); `meta.permission` overrides it (the security log and audit trail), and `null` opens it to anyone signed in (My account). The address stays, the page names the permission in words (`/me` → `permissionLabels`), and switching user re-checks at once.
- **Toasts:** a refused permission reads "Not allowed", and the same message shows once even when a page fails several loads at the same time.
- **Tests:** `test/configuration.e2e-spec.ts` (tiles and labels), `test/wms.e2e-spec.ts`.

---

# Phase 5 · Field sales and installation

**Status:** started 13 Nov 2026. The user approved the plan and decisions 1–13 on 13 Nov 2026. The phone app is set aside for now (decision 13), so the order of work is F0, F1, F3, F5, F6, F7; F2 and F4 wait. F1 parts 1–6 are built; on 17 Nov 2026 the user moved F3 (the Service module) ahead of F1's last parts, which mostly serve the phone app, and on 18 Nov 2026 asked for part 6 (agents adding customers) while waiting for the client's answers. F3 parts 1–5 and F6's reminders are built (see the build order).

Everything above still applies: stack, database and API conventions, the working agreement and the definition of done. **Purchase, Sales, Core and Configuration keep their behaviour.** Everything in this phase sits behind settings that are off by default, so the standard flow, the demo seed and every existing test stay as they are.

## What it is

- Some companies sell **packages to households through sales agents**, then deliver and **install** them. The agent takes the order with the customer, the customer signs, and the office books an installer. They do not use the office steps *Enquiry* and *Draft Quotation*.
- This phase adds that way of working as a **profile**: a set of switches a company turns on. A company that leaves them off sees no change.
- It has three parts:
  1. **Sales changes:** the flow switches, package order entry, and the signed order.
  2. **An installation module:** jobs, a booking board with time slots, stages, fees, warranty jobs and reminders.
  3. **A mobile API contract**, for a phone app built by the user's own team.

**Not in this phase:**
- Payment to the books: receipts are recorded and verified in the ERP since 18 Nov (official receipts, F1), but allocating them to invoices, refunds and the accounting stay with the company's accounting system.
- A link to an outside accounting system.
- The phone app itself. This repo gives it the API and the contract.
- Working offline, visits and check-in, sales targets, *My Performance*, push notifications and other languages (all in the Sales App handbook; each comes later, when asked for).
- Trade-in, one-to-one exchange and a second country.
- The full planning engine of the Service handbook (free times from hours, travel, skills and leave; two-person crews; maintenance contracts).

## Must-read for this phase

| File | Why |
|---|---|
| `docs/requirements/Sales Mobile App Handbook.md` | The agent's journey on the phone: customer, products, review, signature, orders. The *Take an order* steps are the acceptance criteria for the order flow |
| `docs/requirements/SalesApp.html` | The phone design: a saved design canvas with 19 screens. It is a bundle, so unpack it with a script and read each page's text and logic. Do not paste it into a prompt |
| `docs/requirements/Service Planning & Promotions Handbook.md` | Background for jobs, job types and packages. This phase builds a smaller version (see *Installation module*) |
| SRS FR-SEC-066, INT-011, FR-MSG-001, NTF-036 | Separate, revocable sign-in for a phone app; one API for web and mobile; push carries a reference only |

A client's own notes, recordings and data are **never** put in this repo. They stay in that client's folder outside it.

## Decisions

Confirmed by the user on 12–13 Nov 2026:

| # | Decision | What it means |
|---|---|---|
| 1 | One product | No copy or fork per client. The profile is settings in the standard product, off by default |
| 2 | One backend | The phone app is a second screen on the same API and database. It has no data store or business rules of its own |
| 3 | Contract first | The mobile team builds from a written API contract. Each contract is agreed before the backend step that implements it |
| 4 | Who orders | Sales agents create the orders, and the customer signs. The signature turns the quotation into a released sales order |
| 5 | Payments | Changed 18 Nov 2026 after the client's Account answers (the user's OK): customer payments are recorded on the sales order as **official receipts** with their proof, and Account verifies them against the bank. Only verified receipts count as paid. The job still notes paid on site; the books stay in the client's accounting system |
| 6 | Installers | The company's own staff, in three roles: installer, technician, warranty |
| 7 | Booking | Fixed time slots per installer per day, booked by the office. No free-time calculation |
| 8 | Reminders | A filter-change (service) interval set per item, counted from the installation date |
| 9 | Accounting | Stays in the company's own accounting system for now |
| 10 | Installation date | The agent enters the customer's **preferred** date at signing. The office confirms the installer and slot. The phone design makes the date required and says the team is booked; that wording changes |
| 11 | Business rules from the phone design | Taken as written, as profile settings: a price outside list −10% / +20% needs approval; an agent may add a COD customer; a rejected quotation is revised as a new revision; an order over the credit limit is signed first and then waits for approval |
| 12 | Security rules | Ours stay: at least 10 characters, a single-use reset link, never a password by email. The phone design's wording (8 characters, temporary password) changes to match |
| 13 | The phone app waits | Set aside by the user on 13 Nov 2026. The admin side and the installation module are built first; steps F2 and F4 and the two questions below wait until the user brings the app back |

Open, parked with the phone app:

| # | Question | Proposal |
|---|---|---|
| O4 | Staying signed in on a phone | A device token that can be revoked per phone (FR-SEC-066), instead of the 30-minute idle rule of the website |
| O5 | Phone app technology and start date | The user's team decides. It does not change the contract |

To ask the client (does not block F1 or F2):
- Does the installer collect the unit through the warehouse scan?
- What do the logistics, admin and accounts stages check, and can any be dropped?
- How are commission and installer fees worked out?
- How does their accounting system take data in: a file or an API?
- How many agents, installers and orders a month?

## The flow

| Step | Standard (unchanged) | Profile on |
|---|---|---|
| Enquiry | The office logs it | Hidden and refused |
| Draft quotation | The office drafts, then releases | Hidden. The agent builds the quotation on the phone |
| Quotation | Sent; the customer orders later | *Awaiting signature* until the customer signs. The office sees a read-only list |
| Sales order | The office makes it from the quotation | Made by the signature and released at once, if the credit policy allows |
| Price approval | A discount over the limit (15%) | A price outside the allowed range |
| New customer | Master Data Admin, in Core | An agent adds a COD customer with no credit; the office completes it |
| Installation | — | A released order with an installation option makes a job *Not booked* |
| Delivery, invoice, returns, purchasing | As built | The same |

## Sales changes

- **Switches** live in `sal_setting`, beside today's policies, and show on Operation Policies. Each defaults to today's behaviour:
  - enquiries on or off
  - the draft-quotation step on or off
  - a customer signature releases the order
  - the price rule: discount limit (today) or allowed range, with the two percentages
  - agents may add COD customers
- The menu, the routes and the server all follow the switches. A hidden step is refused by the API too, not only hidden.
- **Packages** are maintained in Core: a package code, its items and quantities, one price, the free gifts to choose from, and the dates it runs. On an order a package is one line with its items under it.
- **Order lines new to Sales:** a free gift at RM 0.00 that prints as *Free*; a voucher or rebate as its own line that lowers the total; an installation option per order (installation, delivery only, or collect).
- **Signature:** the image, the signer's name and position, the date and time, and the location if the customer allows it, kept with the order as an attachment.
- These change finished Sales rules (rules 3, 5, 6 and 14, and Core decision 2). **Each is confirmed with the user at its step, and each has tests with the switch on and off.**

## Installation module

A new module with its own tables (`svc_`), its own launcher tile and its own permissions. It never imports `sales/`; it listens to `sales.order.released` the way Purchase does.

| Part | What it does |
|---|---|
| Jobs | Types: installation, service, warranty, repair. A job comes from a released order or is added by the office. Numbered by `NumberingService` |
| Booking board | One day at a time, a row per installer. The office picks the installer, the date, a slot group and a slot. Two jobs for one installer can never overlap |
| Slot groups | Set by the company, for example 2-hour slots, 1-hour slots for service and warranty, and one long slot for heavy work |
| Stages | Not booked → Booked → Accepted → Done → Checked → Closed, or Cancelled. The checking stages are settings, so a company keeps only the ones it uses |
| Installer's part | Accept the job; when finished: a photo (required), the status (complete, partial, postponed with a reason), paid or not paid with a reason, the claim and other fees |
| Fees and commission | The installer's fee per job and the agent's commission, worked out by rules the company sets, with a report |
| Warranty and reminders | Warranty jobs against the unit installed; a reminder when an item's service interval is due |

The installer's part is used on a phone, so it is in the mobile contract too.

## Mobile API contract

- The phone app uses the **same endpoints** as the website wherever they exist. A phone-only endpoint is added only where the website has none.
- **New for phones:** sign-in that returns a device token (O4), and upload of a signature or photo.
- **Where it is written:** `docs/integration/MOBILE_API.md`, one part for the agent's screens (F2) and one for the installer's (F4). For each screen: the calls, the fields, the errors and one example.
- Rules stay on the server. The app shows `allowedActions` and server totals, as the website does.

## Screen codes (proposed)

`F` for the phone screens in the contract, `V` for the installation module, and the next free Core codes for packages. Fixed in F0 with the mockups.

## Build order for phase 5 (stop after each step for the user to review)

**F0 · Planning and design.** This section; mockups for the changed Sales screens, the package screens and the installation module, in the app's current layout; a neutral seed file; the screen list in `SCREENS.md`.

**F1 · Sales flow switches and package order entry.** The switches; packages in Core; package, gift and voucher lines; the installation option; the signed order. Built in parts, each reviewed by the user:
- *Part 1 (done, 13 Nov 2026):* the two step switches on a new page, Sales Flow (S34): *Use enquiries* and *Office drafts quotations*, both on by default (`sal_setting`, `sales/settings/sales-flow.rules.ts`). With enquiries off the server refuses a new enquiry (409 `ENQUIRIES_OFF`) and the menu, the home tiles and the page search drop Enquiry and Enquiry Types; with drafts off the menu drops Draft Quotation. Enquiries already made stay readable. The Sales menu is read through `modules/sales/flow.ts`. Tests: `sales-flow.rules.spec.ts`, `test/sales-flow.e2e-spec.ts`.
- *Part 2 (done, 13 Nov 2026):* packages in Core, C15 list and C16 form (`core/packages/`; `mdm_package`, `mdm_package_item`, `mdm_package_gift`). A package has items, one price before tax, a price list its items are priced from, dates (scheduled, running, ended, or ended early with *End now*) and a free gift rule (none, always, or the customer chooses 1 of at least 2). The price is spread over the items by list value, the last item taking the remainder (`spreadPrice`); a gift may be an item that is not for sale. Changed by `core.price_list.edit`; every save writes activity with before and after values and `mdm.package.updated` (or `.deleted`). Codes are never reused. Since part 3 a package on any sales order cannot be deleted (it can be ended). Not yet: per-branch packages, gift stock on the form, the orders column. The demo seed has no packages and clears any made since. Tests: `packages.rules.spec.ts`, `test/packages.e2e-spec.ts`.
- *Part 3 (done, 13 Nov 2026):* packages and free gifts on the sales order (S11). *Add package* offers the packages running on the order date (`GET sales/lookups/packages`); the form sends one line `{ packageCode, qty, giftItemCode }` in whole sets. The order keeps it as the package's items at the spread price (`lineKind` PACKAGE, the package's tax code, the spread price kept as the line's list price) plus the chosen gift at 0.00 (`lineKind` GIFT; a gift need not be for sale on its own), all sharing a `packageGroup` with the package's code, name, sets and price as they were (`sal_sales_order_line`). Delivery, invoice, returns and cancel work on those item lines unchanged; an invoice compares a package line with its package price, so no price approval trips. The spread lives in `master-data/package-price.rules.ts`, shared with Core; the port reads packages (`findPackage`, `listRunningPackages`). Errors point at the line the user typed. The record-usage check answers for a package (kind `PACKAGE`). A released order shows a package as one line with its items and the gift under it. Not yet: packages on quotations (with the signed order). Tests: `package-lines.rules.spec.ts`, `package-price.rules.spec.ts`, `test/package-orders.e2e-spec.ts`.
- *Part 4 (done, 17 Nov 2026):* vouchers on the sales order (S11). *Add voucher* takes the number the agent types (not issued or checked by the system), a description and the amount off before tax. A voucher lowers the amount taxed (`FIELD_SALES_SEED_DATA.md` choice 2): its tax is round(amount × rate, 2) at the rate of the items it lowers; with items under more than one tax code the agent picks which. Vouchers on one tax code cannot be more than those items before tax; a number appears once per order. They are kept beside the lines (`sal_order_voucher`, `voucherTotal` on the order and the invoice), not as lines, so they never reach a delivery order or the warehouse; totals are rule 14 less the vouchers and their tax, then the 5-sen rounding (`sales/shared/voucher.rules.ts`). The order's first invoice whose items under that tax code cover a voucher uses it (`invoiceId`); deleting that draft invoice gives it back; the released invoice keeps it. `sales.order.released` carries the vouchers, `sales.invoice.released` the voucher total. The order, invoice and both A4 printouts show them. Open for the client's accountant: whether tax is worked out before or after a voucher, and what a sales return gives back on an invoice that used a voucher (today it credits the returned lines at their prices). Tests: `voucher.rules.spec.ts`, `test/order-vouchers.e2e-spec.ts`.
- *Part 5 (done, 17 Nov 2026):* the installation option on the sales order. A third Sales Flow switch, *Ask for an installation option on the order*, off by default (`sal_setting.askInstallation`; S34 shows it in its own Installation section). Off, the order asks and keeps nothing. On, the order asks Installation (the default), Delivery only or Collect, and for an installation the customer's preferred date (`installOption`, `installDate` on `sal_sales_order`); the date is never before the order date, and delivery only or collect keep no date. Release follows the agent's signing step of the Sales Mobile App Handbook: the date is needed when every item is in stock (409 `INSTALL_DATE_REQUIRED`); with items short or bought to order it waits for stock and the order shows *After stock arrives* (`installAfterStock`, decided at release). The date is a preference: the office books the installer and slot in the installation module (decision 10). `sales.order.released` carries `installation: { option, preferredDate, afterStock }` (null with the switch off), for the installation module to make the job. Rules in `sales/orders/installation.rules.ts`. Tests: `installation.rules.spec.ts`, `test/order-installation.e2e-spec.ts`.
- *Part 6 (done, 18 Nov 2026):* salespeople add new customers on the order. A fourth Sales Flow switch, *Salespeople add new customers on the order*, off by default (`sal_setting.agentsAddCustomers`; the Customers card on S34). On, the sales order (S11) shows *+ New customer* under the customer field to whoever keys orders: name, phone and address, with email and NRIC number optional. Sales never writes customers: `POST /api/v1/sales/customers` checks the switch and asks Core through the platform's customer onboarding (`platform/onboarding/`; Core registers the handler at start-up, the way modules register listeners), and Core makes the customer with its usual number, activity and `mdm.customer.created` (carrying `addedFrom: SALES_ORDER`). Core fills in the rest: active at once, cash terms (0 days), no credit limit, the cash customer's price list, Exclusive like every sales order, one address for billing and delivery, the salesperson's branch and, for a sales agent, the agent, so the agent scope shows it to them. A phone already on file, however it is typed, is refused with that customer's code, whoever's customer it is (`phoneKey`). The new customer is marked *To complete* (`mdm_customer.toComplete`): Core's home lists them under *Needs attention*, the customer list shows a chip and filters on `?toComplete=1`, and the customer page has a banner and *Mark as complete* (`POST /api/v1/core/customers/:id/complete`, `core.customer.edit`). This relaxes Core decision 2 only with the switch on: an agent adds a cash customer and never changes one. Rules in `core/customers/customers.rules.ts`. Tests: `customers.rules.spec.ts`, `dashboard.rules.spec.ts`, `test/order-new-customer.e2e-spec.ts`.
- *Pictures, categories and terms (done, 18 Nov 2026, asked for by the user; no flow changes):* how salespeople pick, after the client's picture catalogue. Core keeps one picture per package and per item (`pictureId`: a file uploaded first with `POST /api/v1/attachments`, checked as JPG, PNG or WEBP and linked to the record in its save; the activity names the files), a package **category** from a fifth reference list, *Package categories* (C12, `mdm_package_category`; in use: cannot be deleted, can be made inactive), and the package's **terms** (what it includes and its warranty, up to 4,000 characters). A save that does not send them keeps them. Package codes take `@` and up to 30 characters (`PACKAGE_CODE`), as codes kept from another system have; the code columns of packages, their items and gifts, and sales-order lines are 30 wide. The port carries them (`MdPackage.category`, `terms`, `pictureId`; `MdItem.pictureId`). Screens: C16 gets Category, a Terms card and a Picture card; C15 a picture and Category column; C03 a Picture card; S11's *Add package* shows picture cards under category tabs and the terms of the package picked, and *Add item* a small picture where the item has one. What goes on the order is unchanged. The picture is only a picture: the card shows the system's price, and the order is priced from Core (`FIELD_SALES_SEED_DATA.md` choice 10). Shared: `components/erp/AuthImage.vue` (a stored picture fetched with the token, kept once per page load, `fileObjectUrl`) and `PictureField.vue`. The demo seed has no categories and clears item pictures. Since 18 Nov the order keeps each package's terms as they were when it was saved (`sal_sales_order_line.packageTerms`, refreshed on each draft save, fixed at release) and its A4 printout shows them under the lines; a later change to the package does not change the order. Not yet: several pictures per product. Tests: `picture.rules.spec.ts`, `packages.rules.spec.ts`, `reference.rules.spec.ts`, `test/pictures-categories.e2e-spec.ts`.
- *Price range (done, 18 Nov 2026; decision 11):* a fifth Sales Flow switch, *Salespeople set prices within a range of the price list*, off by default, with its two percentages (`sal_setting.priceRange`, `priceBelowPct` 10, `priceAbovePct` 20; the Prices card on S34; each change logged). Off, the standard rules stand (rule 3's discount limit on quotations; orders priced freely; rule 4's strict price list on invoices). On, a line whose price after its discount is more than the lower percentage below or the higher one above the customer's price list needs the Sales Manager before release: on the **quotation** it replaces the discount limit (same approval, the reason names the range); on the **sales order** it is new, sent in the same request as a credit approval (one step when both go to the same role; a price-only request leaves the credit result alone; 409 `PRICE_APPROVAL_REQUIRED` on release); on the **invoice** the strict price list checks the range instead of "below the list". Left out: package items, gifts, lines with no list price, and a price already checked upstream (an order line at its released quotation's price for the same item; an invoice line at its order line's price), so nothing is approved twice. S09, S11 and S19 say why and preview it under each line. Rules in `sales/shared/price-range.rules.ts` (`PriceRules` reads the settings). Open for the client: the percentages and who approves. Tests: `price-range.rules.spec.ts`, `sales-flow.rules.spec.ts`, `test/price-range.e2e-spec.ts`.
- *Official receipts (done, 18 Nov 2026; decision 5 changed, the user's OK):* a sixth Sales Flow switch, *Salespeople record payments as official receipts*, off by default (`sal_setting.useReceipts`; off, the server refuses with 409 `RECEIPTS_OFF` and the menu hides it). On a released order, whoever holds `sales.receipt.edit` (agents, billing, Sales Manager) records a payment: the day the money came in, Deposit or Balance, how (cash banked in, bank transfer, card, card EPP, cheque), the amount (never more than the order still owes: its total less what is verified or waiting), an optional reference and at least one proof (a photo or PDF uploaded first, linked on save). It is numbered `OR-{YYMM}-{####}` by `NumberingService` when recorded (the sequence is made on first use; a receipt dated in an earlier month keeps the recording month in its number, because the monthly counter is one row), and waits for Account (`sal_receipt`, status Waiting to verify). Account (`sales.receipt.verify`, the Finance Manager) verifies it with the bank transaction or card settlement reference, or sends it back with a reason; it is then corrected and sent again, or cancelled. Whoever recorded a receipt never verifies it (409 `OWN_RECEIPT`). Verified receipts are locked and are the only ones that count: the order's Payments card shows Unpaid, Deposit paid or Fully paid, verified, waiting and still owed. Every change writes activity on the receipt and the order; verifying publishes `sales.receipt.verified` with the order's new totals, which Service's listener `service.job-payment` copies onto the order's jobs (`svc_job.orderPayment`, shown on the job page). Screens: S35 Official Receipts (Account's queue, Waiting to verify first; Billing menu) and S36 the receipt (proof, Verify, Send back, Correct, Cancel); the Payments card and *Record payment* on S11. Receipts follow the branch and agent scopes. Not yet: allocating receipts to invoices (invoice balances still come from Finance), printing an OR, installer sign-in to record their own (the office keys them until the phone app), and the follow-ups to Account (number format, 72 hours, the link to their accounting system). Rules in `sales/receipts/receipt.rules.ts`. Tests: `receipt.rules.spec.ts`, `test/official-receipts.e2e-spec.ts`.
- *Order revisions (done, 23 Nov 2026, after the client's Sales Admin answers; the user's OK):* a seventh Sales Flow switch, *Salespeople revise a released order until it is delivered*, off by default (`sal_setting.reviseOrders`; the Orders card on S34; off, 409 `REVISIONS_OFF`). On, whoever keys orders revises a released order with nothing delivered, invoiced or cancelled and no delivery order, invoice, cancel order or proforma made from it, and no buy-to-order line on a PO (409 `NOT_REVISABLE` naming what is in the way): *Revise* with a reason (`POST …/revise`) keeps the order as it is in `sal_order_revision` (read-only, with a View on S11's Revisions card) and puts the order back in draft as the next revision under the same number (`revisionNo`; the `revision` column stays 0, the row every list reads, as SRS BR-STA-003 asks). It keeps its customer, order date, first release, receipts and job; a revision in draft is never deleted, only discarded (`POST …/discard-revision`: back to the revision before, as released). Releasing it says what changed ("Delivery address changed; TB-DIN-06 quantity 1 → 2; Total …", kept on the earlier revision) and needs the Sales Manager (in the same request as a credit or price approval; 409 `REVISION_APPROVAL_REQUIRED`) when it was made after the installer was booked or changes a price, a discount or a voucher; adding an item at its price or changing the address before booking goes out directly. Sales knows the booking from Service (`service.job.booked`, `service.job.unbooked`, `service.job.cancelled`; listener `sales.install-*`; `installBooking` shown on S11). `sales.order.released` goes out again with `revision`; Service updates the order's job not done yet (items, contact, address; the preferred date while not booked) or cancels it when installation was dropped, and Purchase's demand copy drops lines the order no longer has (the one Purchase change, the user's OK on 23 Nov). Rules in `sales/orders/revision.rules.ts`. Tests: `revision.rules.spec.ts`, `order.rules.spec.ts`, `test/order-revisions.e2e-spec.ts` (7 steps).
- *Pre-orders (done, 23 Nov 2026; the client's Sales Admin, the user's OK):* an eighth Sales Flow switch, *Short stock makes the order a pre-order*, off by default (`sal_setting.preOrders`; the Orders card on S34). On, an order released with any stock item short (not bought to order) is a pre-order as a whole, not split (`sal_sales_order.isPreOrder`, `preOrderShort`: what was short; activity "Released as a pre-order: …"; `preOrder` in `sales.order.released`; a released revision decides again). It stays marked and shows *Pre-order · waiting for stock*, then *Pre-order · stock arrived* once its open quantities are on hand in its warehouse (worked out when read); the office then carries on as usual, nobody releases it again (the user's choice). A draft says it will be released as a pre-order. S10 shows the chip and filters on *Pre-orders only* (`?preOrder=1`); S11 a banner. Stock is not reserved yet, so short means against what is on hand. The 60-day rule leaves pre-orders out. Rules in `sales/orders/pre-order.rules.ts`. Tests: `pre-order.rules.spec.ts`, `test/pre-orders.e2e-spec.ts` (3 steps).
- *Automatic cancel and alerts (done, 23 Nov 2026; the client's Sales Admin, the user's OK):* a ninth Sales Flow switch, *Cancel an order with no receipt and no delivery after a number of days*, off by default, with its days (`sal_setting.autoCancel`, `autoCancelDays` 60; the Orders card on S34; it needs official receipts on, 400 otherwise). On, a released order (not partly delivered, not a pre-order) with no official receipt (any but cancelled), no delivery order and no cancel order is warned 7 days before (`lapseWarnedAt`, activity) and cancelled on the day, counted from its first release, by a cancel order the system drafts and releases for the whole balance with the reason in its note (`CancelOrdersService.cancelBalanceForSystem`; `sales.order.balance_cancelled` as usual; `lapsedAt`). It runs every hour where the server delivers events and on demand (*Check now*, `POST /api/v1/sales/orders/lapse-check`, `sales.settings.manage`); safe to run again. Rules in `sales/orders/lapse.rules.ts`. **Alerts** (`platform/notifications/`, `sys_notification`): the bell-like *Alerts* button in every top bar (`components/erp/AlertsButton.vue`; `GET /api/v1/me/notifications`, `POST …/:id/read`, `POST …/read-all`, signed in only); modules write them in their transaction and pick who gets them (`whoCan(permission, branch)` finds the people who hold a permission in a branch; the person who acted is left out); no email. Who hears what: an order to be cancelled, or cancelled: its salesperson and whoever releases cancellations at its branch; a job postponed: whoever books jobs at its branch and the order's salesperson; a job rescheduled (moved to another day, time or person): the salesperson; **stock not ready 24 hours before a booked installation** (`service/jobs/stock-check.*`, hourly and `POST /api/v1/service/jobs/stock-check`): the job is marked *At risk* (`svc_job.atRiskSince`, `atRiskNote`; banner on V04, a line on the board, a chip on V03), both are told, and it clears at a later check when the stock is there, or when the job is moved off the board or done. A job keeps its order's salesperson and warehouse (`svc_job.agentCode`, `agentName`, `warehouseCode`, from `sales.order.released`). Tests: `lapse.rules.spec.ts`, `stock-check.rules.spec.ts`, `test/order-alerts.e2e-spec.ts` (5 steps).
- *Share on WhatsApp (done, 24 Nov 2026; the client's Sales Admin, the user's OK):* a tenth Sales Flow switch, *Share the sales order with the customer on WhatsApp*, off by default (`sal_setting.shareWhatsapp`; the Orders card on S34). On, a released order (S11) shows *WhatsApp* to whoever keys orders (`sales.order.edit`): it opens `wa.me` with the customer's phone number in Core (a number without a country code is Malaysian; none usable: the person picks the chat) and the order's summary already written: the items (a package once, with its free gift), the total, and the installation asked for. The ERP sends nothing and keeps no copy; the person presses Send in WhatsApp, and attaches the A4 order by hand, because the link carries text only. The message and the number come from the server (`share` in the detail, null when not offered), so a phone app can use them. Rules in `sales/orders/share.rules.ts`. Tests: `share.rules.spec.ts`, `test/order-share.e2e-spec.ts`.
- *Next parts:* the signed order (with packages and vouchers on quotations, and the installation option at signing).

**F2 · Mobile contract, agent screens.** `MOBILE_API.md` part 1 and phone sign-in. Can run beside F1.

**F3 · Installation jobs.** The module, jobs from released orders, the booking board, slot groups and stages. The mockups call it **Service** (SvcHome.html …), so the module, its tile and its permissions are named Service (`service/`, `svc_` tables, `service.*`). Built in parts, each reviewed by the user:
- *Part 1 (done, 17 Nov 2026):* the module and its jobs. It runs only with the server setting `SERVICE_MODULE=on` (off by default, like the WMS connection): off, there is no tile, its routes answer 404 (`ServiceOnGuard`), its permissions are not in the role editor, and no listener runs, so the standard demo and every other test are unchanged. On: an orange **Service** tile on the launcher; V01 home (not booked, oldest waiting, waiting list), V03 jobs list (search, type, a tab per stage), V04 job (customer and site, preferred date, note to the installer, items, activity, stage bar, cancel with a reason). Listener `service.job-from-order` on `sales.order.released`: an order released with the Installation option (F1 part 5) makes an installation job *Not booked*, once per order, with the order's contact and delivery address, its items and the preferred date or *after stock arrives*; delivery only and collect make none. The office adds service, warranty and repair jobs by hand. Numbers JB-#### (`SVC_JOB`, made on the first job). Tables `svc_job`, `svc_job_item`; stages Not booked, Booked, Accepted, Done, Checked, Closed, Cancelled; branch scope with the top bar's branch. Permissions `service.view`, `service.job.edit` (Administrator only until roles are granted in A09). Events `service.job.created`, `service.job.cancelled`. `sales.order.released` now also carries the order's contact and delivery address. Sales does not show the job yet. The demo seed has no jobs and clears any made since. Tests: `jobs.rules.spec.ts`, `test/service-jobs.e2e-spec.ts`.
- *Kept simple (user, 17 Nov 2026):* the user's own Service design (`docs/requirements/Draft Quotation Details.html`, which despite its name holds the Service planning and Promotions screens, the *Service Planning & Promotions Handbook* and the *Technician App Handbook*) is the reference for later, not the target now. Asked for "not so complicated", the user chose the smaller plan: jobs straight from sales orders (no requests), a planning board with fixed slots (no skills, travel, working-hour engine or week view), the installer marking it done, and filter reminders instead of maintenance contracts. Names follow that design where clearer (Planning Board). Stages to start: Not booked → Booked → Done → Closed; Accepted comes with the phone app, Checked only if the client confirms an office check. Left out until asked: requests, maintenance plans, skills and areas, van stock, checklists, parts used, invoicing from the job, the technician app, and the other promotion types.
- *Part 2 (done, 17 Nov 2026):* people, slot groups and the Planning Board, with the simple stages. **People** (`svc_person`): name, role (installer, technician, warranty) and phone, kept by Service; they need no ERP sign-in until the phone app comes (the mockup kept them as users; simpler for the client). The role decides the job types: installer → installation, technician → service and repair, warranty → warranty. **Slot groups** (`svc_slot_group`): Standard, Early, Short and Long as in SvcSettings.html, made on first use, editable (a change applies to new bookings only). **V02 Planning Board:** one day, a row per person with their jobs coloured by type, the jobs not booked on the left (★ when the customer asks for that day); pick a job and a slot group, and the free slots show on the people who take that job. **Booking** (`POST …/book`, also to move): one person, one day, one slot that starts on the group's grid; the person's row is locked while the booking is checked, so two jobs for one person never overlap (`board/booking.rules.ts`). Also *Take off the board* (back to Not booked), *Mark as done* with a note, *Close*; cancelling a booked job frees its slot. Stages: Not booked → Booked → Done → Closed, or Cancelled (Accepted and Checked are in the table but unused). **V05 Slots and Stages:** people, slot groups, who takes which job, the stages. V01 home: jobs today, not booked, booked, done not closed, waiting list with Book, today by person. Permissions `service.job.book`, `service.settings.manage`. Event `service.job.booked`. The demo seed clears people and slot groups too. Sample data for a client demo comes from a script outside the repo. Tests: `booking.rules.spec.ts`, `test/service-jobs.e2e-spec.ts` (10 steps).
- *Part 3 (done, 17 Nov 2026):* what the installer records at the visit. *Record the visit* replaces Mark as done on a booked job: the result (complete, partly done with what is left, or postponed with why), arrival and finish times (optional), whether the customer paid on site (paid with how, not paid with why, or no charge; a note, not a payment, decision 5), the work done, and at least one photo (uploaded to the job first; `sys_attachment` with entity `SVC_JOB`). Complete or partly done: the job is Done and `service.job.done` is published (for F5). Postponed: back to Not booked, the slot is free, the reason and an optional new date are kept, and the job page says so. A partly done job gets one *follow-up job* (same customer, site and items, Not booked, linked both ways). The job page shows *What the installer recorded* and the photos; the jobs list has *Paid on site*; the home counts done jobs not paid. Permission `service.job.record`: the office records for the installer until the phone app comes; no installer starter roles yet (a company grants the key to its own role in A09). Rules in `service/jobs/visit.rules.ts`. Tests: `visit.rules.spec.ts`, `test/service-jobs.e2e-spec.ts` (12 steps).
- *Part 4 (done, 18 Nov 2026, asked for by the user while the client's answers are awaited; none of it needs them):* who takes what, expected completion and overdue. **Job types per person** (`svc_person.jobTypes`): an installer may also take warranty jobs and a technician installations; the role only sets what a new person starts with (existing people keep what their role gave). **Site type** on the job (`svc_job.siteType`: Landed house, Condo / apartment, Shop / office, or not set: anyone) and the sites each person goes to (`svc_person.siteTypes`, all by default); the board greys out who does not suit the picked job, says why, and booking refuses them; a booked job's site type cannot change to one its person does not go to; follow-up and reminder jobs keep the site type. **Default slot group per job type** (`svc_slot_group.defaultFor`; Standard for installation, Short for service, warranty and repair): the board picks it first, the office can pick another; one group per job type, a group taking a default takes it from the other, logged. **Expected completion** (`expectedEnd`): the slot end when booked; *Extend the time* (`POST …/extend`, `service.job.book`) sets a later time that day with a reason (`extendReason`), keeps the person busy until then (nothing new is booked over it), names the later jobs it runs into, and publishes `service.job.extended`. **Overdue**: a booked job whose expected completion has passed with the visit not recorded; it then stays overdue (`overdueSince`), however it is extended, moved or taken off the board, until the visit is recorded (postponed ends it too and the log says it was overdue; a done job keeps "late"). Shown on the board (red outline, a line at the time now), the job page (banner, *Expected done by*), the jobs list (chip, *Overdue only* filter, `?overdue=1`) and the V01 card *Overdue*. Rules in `board/booking.rules.ts` and `jobs/timing.rules.ts`. Job durations and landed versus condo were answered by the client's Sales Admin on 23 Nov (part 5); still open: whether overdue counts from the slot end (today) or a later expected completion, and who sees it. Tests: `booking.rules.spec.ts`, `timing.rules.spec.ts`, `test/service-planning.e2e-spec.ts` (6 steps).
- *Part 5 (done, 23 Nov 2026, after the client's Sales Admin answers; the user's OK):* job categories by site type, and what the office needs before booking. **Slot groups are the job categories:** each also keeps the sites it is for (`svc_slot_group.siteTypes`, every site by default, so nothing changes until a company narrows one); the board offers a job only the groups for its type and, when set, its site type (the type's default first, else the first that suits), booking refuses another (409 `SLOT_NOT_FREE`, "The Hacking / ceiling slot group is not for landed house sites."), and a booked job's site type cannot change to one its group is not for (409 `SITE_NOT_SUITED`). V05 shows a Sites column and *For these sites*. **Postcode and state:** with the installation switch on, the sales order (S11) asks the delivery address's Postcode (5 digits) and State (Malaysia's list, `platform/address/address.ts`) (`sal_sales_order.deliveryPostcode`, `deliveryState`; a new customer clears them); `sales.order.released` carries them and the job keeps them (`svc_job.postcode`, `state`; editable on V04; follow-up and reminder jobs copy them). **Before booking** the office needs the customer's name, a contact number, the install address, postcode and state: a job not booked or booked that lacks any shows *Missing before booking: …* on V04 and the board (*Details missing* on the card, a warning when picked, a line in the booking confirmation). It warns only, never blocks (`missingForBooking`, `bookingNeeds` in `jobs.rules.ts`). Not yet: postcode and state on Core's customers. Tests: `booking.rules.spec.ts`, `jobs.rules.spec.ts`, `installation.rules.spec.ts`, `test/service-categories.e2e-spec.ts` (4 steps).
- *The back half, on our own assumptions (the user's choice, 24 Nov 2026):* with the client's departments not answering, the user chose the answers (18 of them, listed outside the repo). Every part sits behind a switch that is off by default and is changed when the client answers; the four that shape the design are when stock is held, the automatic delivery order, when a delivery order counts as delivered, and when a warranty starts. Order: stock and the delivery order; the signed delivery order and returned parts; the warranty register; invoices and receipts; journeys. Not built without the client's own rules: fee rates, warranty months, commission, the tax of vouchers, the link to their accounting system.
- *Part 6, stock for jobs and the delivery order 24 hours before (done, 24 Nov 2026):* three switches, off by default. **Sales Flow › Hold stock for booked installations** (`sal_setting.holdStock`): from the booking until it is delivered or taken off the board, what an order still has to deliver is held; other orders count what is left (the release warning and pre-order, S04's *In stock* with the held quantity), never blocked. It is worked out from the orders and their booking, never stored (`sales/shared/held-stock.service.ts`). **Service › Slots and Stages › The warehouse confirms stock before the delivery order** (`svc_setting.warehouseConfirms`): V09 *Stock for Jobs* lists a day's booked jobs (tomorrow first) with what each needs, on hand, held by earlier jobs (earlier slot first, same warehouse) and free; the warehouse confirms each (`service.stock.confirm`, no starter role), also when the figures say short; undo until the delivery order is made; moved to another day it is confirmed again. At the 24-hour check a job not confirmed is *At risk*; a confirmed one publishes `service.job.delivery_due` (each hour until it has a delivery order, and at once when confirmed within the 24 hours). **Sales Flow › Make the delivery order 24 hours before the installation** (`autoDelivery`): listener `sales.install-delivery` drafts the delivery order for the open quantities, dated the installation day with the installer as driver, tells the store, and from then on the order cannot be revised; an order in revision gets none and the store and the salesperson are told once (`autoDoNote`). The same delivery order follows the job when it is moved, postponed or booked again. Sales answers with `sales.delivery.drafted` / `sales.delivery.removed` for any delivery order of an order with installation; the job keeps its number (listener `service.job-delivery`; V04 *Stock and delivery*). Booking a job with short stock warns. Rules in `service/stock/stock.rules.ts`. Tests: `stock.rules.spec.ts`, `test/job-stock.e2e-spec.ts` (7 steps).
- *Part 7, the signed delivery order and returned parts (done, 24 Nov 2026):* a Sales Flow switch, *The customer signs the delivery order* (`sal_setting.signedDelivery`), off by default and for orders with installation only. On, S16 has no Confirm: the store *marks it collected* (the checks before goods leave: credit, deposit, quantities; no more edits), and it is delivered when the signature is recorded (`sales.delivery.sign`, no starter role: who signed and the signed paper, a photo or PDF uploaded first with kind `SIGNED_DO`; the installer's app calls the same endpoint). *Check in* takes the goods back for a postponed job; the same delivery order is collected again. *Not signed* needs a reason and a photo and goes to Management (`sales.exception.approve`, no starter role: a company gives it to a role of its own): *Accept unsigned* delivers it, *Send back* asks for the signature again; whoever recorded the refusal never decides it (409 `OWN_REFUSAL`). Cancelling an order that has a delivery order not delivered yet needs Management too (409 `MANAGEMENT_NEEDED`) and never while the goods are out (`GOODS_COLLECTED`); the draft delivery order goes with it, and Service cancels the job of an order whose balance was cancelled (listener `service.job-order-closed`; also for the automatic cancel). `sales.delivery.delivered` (signed, unsigned or confirmed) tells the job (`svc_job.deliveredAt`). **Returned parts:** the visit lists parts coming back, from the job's items (`svc_return`); the store receives them as good, damaged or missing with a note on V10 (`service.stock.confirm`); `service.parts.returned` for Inventory, no stock moved. **Unfinished jobs:** a past day's job with no visit recorded or its delivery order not signed shows on the person's row on the board and the office is told once; nothing is blocked. Rules in `sales/deliveries/signed-delivery.rules.ts` and `service/returns/returns.rules.ts`. Tests: their specs, `test/signed-delivery.e2e-spec.ts` (6 steps).
- *Part 8, the warranty register (done, 24 Nov 2026):* Core items get *Warranty (months)* (`mdm_item.warrantyMonths`, C03; the port carries it; empty: none, so nothing changes for a company that sets none). A visit recorded *Complete* on an installation job registers each of its items with a warranty (`svc_warranty`), from the visit day to the day before the same day that many months later; *Waiting for payment* until the order is fully paid (verified receipts, the job's order payment), active at once for a job without an order; expired is worked out, not stored. V11 *Warranties*: found by phone however it is typed, customer, sales order, job, item or serial number; serial number (optional), *Void* with a reason, *New claim*: a warranty job at the unit's site, not booked, with the problem as its note. V04 shows the unit and what is covered; the office decides the claim (`POST service/jobs/:id/assess`): Covered, Chargeable with why (the salesperson makes a sales order) or Rejected with why (the job is cancelled); the decision starts as Covered only while active, and never blocks booking. Service, warranty and repair visits list *parts used* (`svc_job_part`; items picked from Core; stock not taken). `service.warranty.registered`. Rules in `service/warranty/warranty.rules.ts`. Tests: `warranty.rules.spec.ts`, `test/warranty.e2e-spec.ts` (5 steps).
- *Part 9, invoices and receipts (done, 24 Nov 2026; the user's OK for the Sales rule):* two Sales Flow switches, off by default. *Draft the invoice when the installation is delivered* (`sal_setting.autoInvoice`): a delivered delivery order of an order with installation drafts its invoice for what it delivered (Sales' own listener `sales.invoice-delivered` on `sales.delivery.delivered`; once per delivery order; billing is told and releases it; one that cannot be drafted is said so on the order). *Verified receipts pay the invoices of their order* (`receiptsPayInvoices`): verified official receipts are counted on the order's released invoices, oldest first (`sal_receipt_allocation`), when a receipt is verified and when an invoice is released; a deposit waits for the invoice; what was counted stays when the switch is turned off. This changes the rule that invoice balances come from Finance only, and only with the switch on. Every screen, report and credit check reads payments from one place, `sales/shared/invoice-payments.service.ts` (Finance's stub plus the allocations). Rules in `sales/receipts/allocation.rules.ts`. Not yet: printing an OR, refunds. Tests: `allocation.rules.spec.ts`, `test/invoice-receipts.e2e-spec.ts` (4 steps).
- *Next parts:* commission (F5, needs the client's rules); installer sign-in and their own job list come with the phone app.

**F4 · Mobile contract, installer screens.** `MOBILE_API.md` part 2 and the installer's endpoints.

**F5 · Installer fees and commission.** Rules, calculation and report.
- *Part 1, installer claims (done, 23 Nov 2026; the client's Account Manager answered 18 Nov, the user's OK):* installers bill a fee per job with their own invoice (or a self-billed one Account makes); technicians do not. People carry *Claims fees* (`svc_person.claimsFees`; installers by default, set by the migration for existing ones). Each job category (slot group) carries the installer's reference fee (`svc_slot_group.feeAmount`, empty until the client gives its rates; V05). **A claim** (`svc_claim`, `svc_claim_line`, numbered CL-#### by `NumberingService`, branch scope) is for one person and one claim period: the 1st to the 15th, paid on the 25th; the 16th to the month end, paid on the 10th of the next month. It takes that person's jobs of the period recorded *Complete* whose order is fully paid (verified receipts, `svc_job.orderPayment`; a job without an order needs none), each once (a cancelled claim frees them); `GET /api/v1/service/claims/eligible` lists them with the fee by rule and, for the rest, why not. A job updated more than 72 hours after its expected finish gets no fee by rule and is marked late (the client's rule; counted from the expected finish, open with the client). Another amount needs a reason. To submit: the installer's invoice number and file (PDF or photo, uploaded first and kept with the claim), unless self-billed. Account (`service.claim.approve`) approves or sends it back with a reason, never the person who submitted it (409 `OWN_CLAIM`), then records the payment voucher number and date. Statuses Draft, Waiting for Account, Sent back, Approved, Paid, Cancelled. Submitting alerts whoever approves claims at the branch; approving and sending back alert the submitter; `service.claim.approved` and `service.claim.paid` are published for Finance later. Permissions `service.claim.edit` (the office keys claims until the phone app) and `service.claim.approve`; no starter role holds them (a company grants them in Roles, e.g. Account to the Finance Manager). Screens: V07 Installer Claims (tabs per status, the total on the tab as a simple report) and V08 the claim (installer and period, the jobs with fee by rule, amount and reason, the invoice, Account's actions). Rules in `service/claims/claims.rules.ts`. Not yet: the salesman's commission (the client has not given its rules), the rate table beyond one fee per category, installers keying their own claims. Tests: `claims.rules.spec.ts`, `test/installer-claims.e2e-spec.ts` (5 steps).

**F6 · Warranty jobs and reminders.** *Reminders built 17 Nov 2026* (warranty jobs are added by the office as job type Warranty since F3 part 1). Core items get *Service every (months)* (`mdm_item.serviceIntervalMonths`, Core C03; Purchase and Sales unchanged; `MdItem.serviceIntervalMonths` through the port). A visit recorded *Complete* starts a reminder (`svc_reminder`) for each of its items with an interval, due that many months after the visit day (`reminder.rules.ts`, month ends kept). 14 days before it is due a service job is made, *Not booked*, asking for the due day, with the item and a note (`reminderId` on the job); the server runs this every hour where it delivers events (`OUTBOX_DISPATCH` on, never in the tests), and *Make jobs now* runs it on demand; it is safe to run twice. Completing that service job starts the next reminder; cancelling it, or *Dismiss* with a reason, stops the chain. V06 Reminders (upcoming, job made, dismissed; overdue in red), and the V01 card *Service due this month*. Branch scope on `svc_reminder`. Tests: `reminder.rules.spec.ts`, `test/service-jobs.e2e-spec.ts` (14 steps).

**F7 · Journeys.** End-to-end tests for the profile, the handbook, and a final review of the module boundaries.

**Definition of done for every step of this phase:** as for Configuration, plus: with every switch off, all existing tests, seed checks and journeys pass unchanged; with the profile on, the step has its own end-to-end test; no client name or client data is in the repo.
