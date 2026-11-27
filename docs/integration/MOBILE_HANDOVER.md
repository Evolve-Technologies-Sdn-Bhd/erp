# Phone app: handover

For the developer building the phone app on this backend. Read this first, then `CLAUDE.md` (start with *Phase 5 · Field sales and installation* and *API conventions*).

The set-up for one company's data (database, people, start scripts) comes in a separate folder and is never put in this repository, which is public.

## The idea in four lines

- **One backend, one database.** The phone and the ERP website call the same API. What the phone saves shows in the ERP at once, and the other way round.
- **Rules live on the server.** The phone shows what the server says it may do and the server's totals. It never works out a price, a tax or an approval itself.
- **A flow may change.** Change it on the server, behind a switch that is off by default, so the website follows and other companies see no difference.
- **The phone app has its own repository** (React Native, Flutter or a web app: your choice). Only backend changes come here.

## Working on the backend

| | |
|---|---|
| Your branch | `feat/mobile-app`, cut from `feat/field-sales`. Push to it freely |
| Getting updates | `git fetch` then `git merge origin/feat/field-sales`, at least once a week |
| Giving changes back | A pull request from your branch into `feat/field-sales`, one subject each. The owner reviews it |
| Never | Push to `main` or `feat/field-sales`, or force-push a shared branch |
| Checks | GitHub runs build, unit tests, end-to-end tests, type-check and lint on every push. A red branch is not merged |

Before you change a rule or a flow:

1. Write the change down in a few lines and agree it with the owner: what the customer asked, what changes on the phone, what changes on the website.
2. Put it behind a setting that is **off by default** (`sal_setting` and Sales Flow S34, or `svc_setting` and Slots and Stages V05). Every switch there today is an example.
3. Test it with the switch on and off. `backend/test/field-sales-journey.e2e-spec.ts` is the journey with every switch on.
4. A change to the database needs a migration (`npx prisma migrate dev --name what_it_does`). Never edit one that is already pushed.

Some rules are not yours to change without asking: released documents are locked, nobody approves their own request, only verified receipts count as paid, and every change is logged.

Module boundaries: `sales/`, `service/`, `core/` and the others never import each other; they talk through events. Read the *Module boundaries* parts of `CLAUDE.md`.

## Calling the API

Base address: `http://<server>:<port>/api/v1`.

**Who is asking.** Two modes, chosen by the server (`GET /auth/mode` says which):

| Mode | How | For |
|---|---|---|
| `dev` | Header `x-dev-user: LWJ`. No password | Building and demos on a closed network **only** |
| `jwt` | `POST /auth/sign-in { identifier, password }`, then header `Authorization: Bearer <accessToken>` | Real use |

In `jwt` mode the access token lasts 15 minutes. On 401 with code `TOKEN_EXPIRED`, call `POST /auth/refresh` (the refresh token is an httpOnly cookie, `zora_refresh`) and send the request again. A session ends after 30 minutes without activity. Some roles must also enter a code (`POST /auth/two-factor`). `frontend/src/api/http.ts` does all of this in one file: copy its behaviour. It has not been tried on a phone yet.

**Conventions**

- Money and quantities are **strings** (`"89.00"`). Never use floating point.
- Dates are `2026-11-27`. The server's day is Malaysian time; ask `GET /me` for `today`.
- Every change sends the record's `version`. If someone else changed it first, the answer is 409: load it again.
- Every record has `allowedActions`. Show a button only when its action is in the list.
- Lists: `?page=1&pageSize=20&status=&q=&sort=-docDate` → `{ items, total, page, pageSize, statusCounts }`.
- The server already shows each person only what they may see (their branches; a salesperson only their own customers). A record they may not see is 404.

**Errors**

| Status | Body | Do |
|---|---|---|
| 400 | `{ message, errors: [{ field, message }] }` | Show each message at its field |
| 401 | `{ code, message }` | Refresh, or sign in |
| 403 | `{ code, message }` | Not in their role |
| 409 | `{ code, message }` | A rule refused it. Show `message` as it is; it is written for the user |

**Files** (photos, slips, signatures): upload first, then send the id. `POST /attachments` as multipart with `file`, `kind`, and for a job photo also `entityType` and `entityId`. JPG, PNG, WEBP or PDF, up to 10 MB. Show one with `GET /attachments/:id/download`, with the same sign-in header.

## Calls for the salesperson

| Screen | Call |
|---|---|
| Who am I, my branches, my permissions | `GET /me` |
| My customers | `GET /core/customers?q=` |
| Check before adding a customer | `POST /sales/customers/check { name, phone, address }` → `items[]`: code, name, whose (`agentName`, `mine`), `reasons`, `same` (never added again) or a maybe |
| New customer on the order | `POST /sales/customers { name, phone, address, email?, idNumber?, notDuplicate? }` (`notDuplicate` after checking the maybes) |
| Ask to take over another salesperson's customer | `POST /sales/customers/transfer-requests { customerCode, reason }`; mine: `GET` the same. The customer is visible and can be ordered for while the office decides |
| Packages, with pictures, terms and gifts | `GET /sales/lookups/packages` |
| Items with price and stock | `GET /sales/lookups/items?customerCode=&q=&sellableOnly=1` |
| Vouchers that can be used today | `GET /sales/lookups/vouchers` |
| My orders | `GET /sales/orders` |
| New order, as a draft | `POST /sales/orders` (below) |
| One order, with totals and what may be done | `GET /sales/orders/:id` |
| Change or delete a draft | `PATCH` / `DELETE /sales/orders/:id` |
| Release it | `POST /sales/orders/:id/release { version }` |
| Ask for approval | `POST /sales/orders/:id/request-approval { version, reason }` |
| Revise a released order | `POST /sales/orders/:id/revise { version, reason }` |
| Share on WhatsApp | `share` in the order: the number and the message, ready |
| Record a payment | `POST /sales/receipts` (below) |
| My alerts | `GET /me/notifications`, `POST /me/notifications/:id/read`. A salesperson hears: an approval decided, a receipt verified or sent back, a cancellation released, an installation moved, postponed, at risk or completed, an order about to lapse, a customer transfer asked for or decided. `link` is the website's address of the record (`/sales/orders/:id`, `/core/customers/:id`) |
| What the company shows on the phone | `GET /me/app-content` → `duitNow { imageUrl, merchant }` or null, `contacts[]`, `officeHours`; admin sets it in Configuration › Phone App. The picture is fetched with the sign-in header |
| Home: this month so far and the target | `GET /sales/dashboard/month` → `ordered { count, total }`, `paid { count, total }` (fully paid this month), `target { amount, orderedPct, paidPct, branch }` |
| Home tiles: installations and payment | `GET /sales/orders?install=today\|toBook\|dateTbc\|donePaymentPending` and `?payment=unpaid\|partial\|notPaid\|paid` |
| Commission (orders that count) | `GET /sales/reports/paid-orders?period=2026-11&agent=<me>` |
| Ageing | `GET /sales/reports/customer-aging` |

A new order. `installDate` is the customer's **preferred** day; the office books the installer. A package line carries no price. With fixed prices on, `unitPrice` must be the price the items call gave.

```json
POST /sales/orders
{
  "customerCode": "C-0004",
  "installOption": "INSTALLATION",
  "installDate": "2026-11-27",
  "deliveryPostcode": "80400",
  "deliveryState": "Johor",
  "lines": [
    { "packageCode": "PK-01", "qty": "1" },
    { "itemCode": "ITEM-01", "qty": "1", "unitPrice": "89.0000" }
  ],
  "vouchers": [{ "voucherNo": "CV50", "amount": "50.00" }]
}
```

`installOption` is `INSTALLATION`, `DELIVERY` or `COLLECT`. Where a package's `giftRule` is `CHOOSE_ONE`, the line also carries `giftItemCode`.

A payment. Account verifies it against the bank; only then does it count.

```json
POST /sales/receipts
{
  "salesOrderId": "…", "docDate": "2026-11-25",
  "kind": "DEPOSIT", "method": "TRANSFER", "amount": "100.00",
  "payerRef": "TRX 1", "proofIds": ["<attachment id, kind PAYMENT_PROOF>"]
}
```

`kind`: `DEPOSIT`, `BALANCE`. `method`: `CASH`, `TRANSFER`, `CARD`, `CARD_EPP`, `CHEQUE`.

## Calls for the installer

| Screen | Call |
|---|---|
| Jobs | `GET /service/jobs?status=&q=`, or a day with everyone on it: `GET /service/board?date=` |
| One job | `GET /service/jobs/:id` |
| Photo of the work | `POST /attachments` with `kind=JOB_PHOTO`, `entityType=SVC_JOB`, `entityId=<job>` |
| Record the visit | `POST /service/jobs/:id/record` (below). At least one photo first |
| The customer signs the delivery order | `POST /sales/deliveries/:id/sign { version, signerName, fileIds }`, file `kind=SIGNED_DO` |
| The customer will not sign | `POST /sales/deliveries/:id/refuse { version, reason, fileIds }`. Management decides |
| Parts to bring back | `returns` in the visit |

```json
POST /service/jobs/:id/record
{
  "version": 2, "result": "COMPLETE",
  "arrivedAt": "10:00", "finishedAt": "11:30",
  "paidStatus": "NOT_PAID", "notPaidReason": "Will transfer tonight",
  "returns": [{ "itemCode": "ITEM-01", "qty": "1" }]
}
```

`result`: `COMPLETE`, `PARTIAL` (with `reason`), `POSTPONED` (with `reason`, and `nextDate` if known). `paidStatus`: `PAID` (with `paidMethod`), `NOT_PAID` (with `notPaidReason`), `NO_CHARGE`.

A job appears a few seconds after its order is released, because it is made from an event. Wait and ask again; do not treat it as an error.

## Not built yet

These need a backend change, and the owner's agreement first:

| What | Today |
|---|---|
| Installers sign in | A person in Service is not a user. No link between the two, and no "my jobs only" |
| Accept a job | The stage exists in the database and is not used |
| Staying signed in on a phone | The website's 30-minute rule applies. The proposal is a device token that can be revoked per phone |
| Push notifications | Alerts are read by asking; nothing is pushed |
| Working offline | Every call needs the server. Keep a draft on the phone and send it later |
| Payment recorded by the installer | The office records it |
| The customer signing the sales order | Not asked for now. The delivery order is signed |

## Where to read more

| File | For |
|---|---|
| `CLAUDE.md` | Every rule, and why |
| `docs/design/SCREENS.md` | Each ERP screen, its route and its API |
| `docs/integration/EVENTS.md` | What one module tells another |
| `backend/src/**/dto/` | The exact fields of every call, with their messages |
| `backend/test/*.e2e-spec.ts` | Working examples of whole journeys |
| Help › Guides in the ERP (dev mode) | The journeys, click by click, to see the flow before building it |

## Tests

They use the standard demo, never a company's data. Copy `backend/.env.example` to `backend/.env`, point it at an empty database called `zora_erp`, then:

```powershell
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm test            # rules
npm run test:e2e    # journeys; starts again from the demo data each time
```

Run them in a window where you have **not** started a company's backend, so its settings are not picked up.
