# Screen map

Every screen in the mockups, with the file to copy from, the Vue route to build, and the API it needs.
Open `docs/design/mockups/index.html` in a browser to click through the mockups like the real app.
Screenshots of the same screens are in `docs/design/screenshots/`.

**How to use a mockup when building a screen**

1. Open the mockup HTML and its screenshot.
2. Match the layout, wording, column order, buttons and status chips. Copy the labels exactly; they were written for users.
3. The sample numbers in the mockup (PO-0001, RM 4,400.00 …) come from the seed data in `CLAUDE.md` → *Seed data*. After seeding, the built screen should show the same values as the mockup.
4. Mockups are 1440 × 1000 px desktop screens. Build them responsive, but desktop first.

---

## Launcher

| Code | Screen | Mockup | Route | API |
|---|---|---|---|---|
| 00 | Choose a module | `Launcher.html` | `/` | `GET /api/v1/me/modules` (static list for now) |

Tiles: Core (Master Data, open since phase 3), Purchase (open), Sales (open), MES (later), WMS (existing, another team), Configuration (later). Core, Purchase and Sales are clickable.

**Help and guided tours (20 Nov 2026, no mockup; CLAUDE.md → *Guided tours*):** a *Help* button in every top bar (launcher, module homes, module screens; also the `?` key) opens the Help panel: the tours for this page and the others, Tutorial mode, *Start again*. A first-time person with Tutorial mode on sees the welcome card on the launcher (*Take the tour*, *Not now*, *I know my way around*). Each person's progress: `GET`, `PUT`, `DELETE /api/v1/me/tutorial`.

---

## Purchase module (build first)

Sidebar groups: **Purchase Transaction**, **Supplier Billing**, **Operation Policies**. Theme: green (see `DESIGN_TOKENS.md`).

| Code | Screen | Mockup | Route | Main API |
|---|---|---|---|---|
| P01 | Purchase home (tiles + dashboard) | `PurHome.html` | `/purchase` | `GET /purchase/dashboard` (KPI cards), `GET` · `PUT` · `DELETE /purchase/dashboard/board` (the person's charts) |
| P02 | Approvals inbox | `PurApprovals.html` | `/purchase/approvals` | `GET /purchase/approvals?status=waiting`, `POST /purchase/approvals/:id/approve` · `/reject` |
| P03 | Document flow of a PO | `PurDocFlow.html` | `/purchase/orders/:id/flow` | `GET /purchase/orders/:id/flow` |
| P04 | Demand · what to buy | `PurDemand.html` | `/purchase/demand` | `GET /purchase/demand`, `POST /purchase/requests/from-demand` |
| P05 | Purchase request list | `PurRequestList.html` | `/purchase/requests` | `GET /purchase/requests` |
| P06 | Purchase request | `PurRequestForm.html` | `/purchase/requests/:id` (and `/new`) | `GET/POST/PATCH /purchase/requests/:id`, `POST …/submit` · `/reject` · `/to-rfq` · `/to-po` |
| P07 | RFQ list | `RfqList.html` | `/purchase/rfqs` | `GET /purchase/rfqs` |
| P08 | RFQ · compare replies and award | `RfqCompare.html` | `/purchase/rfqs/:id` | `GET /purchase/rfqs/:id`, `POST …/replies`, `POST …/award`, `POST …/close` |
| P09 | Purchase order list | `PoList.html` | `/purchase/orders` | `GET /purchase/orders` |
| P10 | Purchase order | `PoForm.html` | `/purchase/orders/:id` (and `/new`) | `GET/POST/PATCH /purchase/orders/:id`, `POST …/release` · `/email` |
| P10 | Purchase order print preview (A4, laid out like S20; prints as a draft until released) | `InvoicePrint.html` | `/purchase/orders/:id/print` | `GET /purchase/orders/:id`, `POST …/email` |
| P11 | Send PO for approval (dialog) | `PoApproval.html` | dialog on P10 | `GET /purchase/orders/:id/approval-check`, `POST …/submit-for-approval` |
| P12 | Cancel order list | `PoCancelList.html` | `/purchase/cancel-orders` | `GET /purchase/cancel-orders` |
| P13 | Cancel PO balance | `PoCancel.html` | `/purchase/cancel-orders/:id` (and `/new?po=`) | `GET/POST/PATCH …`, `POST …/release` |
| P14 | Goods receipt list (+ waiting to receive) | `GrnList.html` | `/purchase/receipts` | `GET /purchase/receipts`, `GET /purchase/receipts/waiting` |
| P15 | Confirm goods received | `GrnConfirm.html` | `/purchase/receipts/:id` (and `/new?po=`) | `GET/POST/PATCH …`, `POST …/confirm` |
| P16 | Purchase invoice list | `PiList.html` | `/purchase/invoices` | `GET /purchase/invoices` |
| P17 | Purchase invoice · three-way match | `PiMatch.html` | `/purchase/invoices/:id` (and `/new`) | `GET/POST/PATCH …`, `GET …/match`, `POST …/decide` · `/approve` |
| P18 | Cash purchase list | `CashPurchaseList.html` | `/purchase/cash-purchases` | `GET /purchase/cash-purchases` |
| P19 | Cash purchase | `CashPurchase.html` | `/purchase/cash-purchases/:id` | `GET/POST/PATCH …`, `POST …/release`, attachments |
| P20 | Supplier debit note list | `PurDebitNoteList.html` | `/purchase/debit-notes` | `GET /purchase/debit-notes` |
| P21 | Supplier debit note | `PurDebitNote.html` | `/purchase/debit-notes/:id` | `GET/POST/PATCH …`, `POST …/submit-for-approval` · `/release` |
| P22 | Purchase return list | `PurReturnList.html` | `/purchase/returns` | `GET /purchase/returns` |
| P23 | Purchase return | `PurReturn.html` | `/purchase/returns/:id` (and `/new?grn=`) | `GET/POST/PATCH …`, `POST …/release`, `POST …/credit-note` |
| P24 | Approval rules | `PurPolicies.html` | `/purchase/settings/approval-rules` | `GET/PUT /purchase/settings/approval-rules` |
| P25 | Document types and numbering | `PurDocTypes.html` | `/purchase/settings/document-types` | `GET/PUT /purchase/settings/document-types` |
| P26 | Email templates | `PurEmailTemplates.html` | `/purchase/settings/email-templates` | `GET/PUT /purchase/settings/email-templates/:key` |

All API paths are under `/api/v1`.

### Purchase guide and flows (read before building)

| Board | File | What it tells you |
|---|---|---|
| UX guide | `PurUxGuide.html` | Patterns, three-way match, approval limits, the 7 rules, roles, numbers |
| Navigation map | `PurNavMap.html` | Menu tree from launcher to every screen |
| P1 | `FlowP1.html` | Demand → purchase request → RFQ or PO |
| P2 | `FlowP2.html` | RFQ → compare → award → draft PO |
| P3 | `FlowP3.html` | PO approval limits and release |
| P4 | `FlowP4.html` | Receiving goods, short deliveries |
| P5 | `FlowP5.html` | Supplier invoice and three-way match |
| P6 | `FlowP6.html` | Cancel balance, purchase return, supplier debit note |
| P7 | `FlowP7.html` | Cash purchase |

Each flow board ends with a **Step by step** table: what the user does, the rules the screen enforces, and what changes after. Treat that table as the acceptance criteria for the screen.

---

## Sales module (build after Purchase)

Theme: purple. Sidebar groups: **Sales Transaction**, **Billing**, **Operation Policies**, **Reports**.

| Code | Screen | Mockup | Route |
|---|---|---|---|
| S01 | Sales home (tiles + dashboard: KPI cards from `GET /sales/dashboard`, the person's charts from `GET` · `PUT` · `DELETE /sales/dashboard/board`) | `Main.html` | `/sales` |
| S02 | Approvals inbox | `Approvals.html` | `/sales/approvals` |
| S03 | Document flow | `DocFlow.html` | `/sales/orders/:id/flow` |
| S04 | Add item from Master Data (dialog). Phase 5: a small picture beside an item that has one in Core | `ItemPicker.html` | dialog |
| S05 | Reports: Sales by customer (the mockup), Sales by item, Open orders, Quotation conversion, Customer aging, Invoice register, e-Invoice status (`GET /sales/reports/:report`) | `SalesReports.html` | `/sales/reports/:report` |
| S06 | Enquiry list | `EnquiryList.html` | `/sales/enquiries` |
| S07 | New enquiry | `EnquiryForm.html` | `/sales/enquiries/:id` |
| S08 | Quotation list | `QuotationList.html` | `/sales/quotations` |
| S09 | Quotation. Phase 5: with the price range on, *Price needs approval* replaces *Discount needs approval* (`priceCheck` in the detail) | `QuotationForm.html` | `/sales/quotations/:id` |
| S09 | Quotation print preview (A4, like S20) | `InvoicePrint.html` | `/sales/quotations/:id/print` |
| S10 | Sales order list. Phase 5: the *Pre-order* chip and *Pre-orders only* filter (`?preOrder=1`) while pre-orders are on | `SalesOrderList.html` | `/sales/orders` |
| S11 | Sales order. Phase 5: with the price range on, *Price needs approval* (`price` in the detail) and the hint under each line; with official receipts on, the **Payments** card and *Record payment* on a released order (`payments` in the detail) | `SalesOrderForm.html` | `/sales/orders/:id` |
| S35 | Official Receipts (phase 5): Account's queue, a tab per status (Waiting to verify first), what waits in RM · `GET /api/v1/sales/receipts`. No mockup: same layout as the other Sales lists | — | `/sales/receipts` |
| S36 | Official receipt (phase 5): amount, received on, payment, how, proof, the order's payment; *Verify* (with the bank or settlement reference), *Send back*, *Correct and send again*, *Cancel receipt* · `GET`, `PATCH /api/v1/sales/receipts/:id`, `POST /api/v1/sales/receipts`, `POST …/verify`, `…/send-back`, `…/cancel` | — | `/sales/receipts/:id` |
| S11 | Sales order print preview (A4, like S20). Phase 5: each package's terms under the lines, as kept on the order | `InvoicePrint.html` | `/sales/orders/:id/print` |
| S12 | Credit check failed | `CreditApproval.html` | state of S11 |
| S13 | Cancel order list | `CancelOrderList.html` | `/sales/cancel-orders` |
| S14 | Cancel order balance | `CancelOrder.html` | `/sales/cancel-orders/:id` |
| S15 | Delivery orders | `DeliveryList.html` | `/sales/deliveries` |
| S16 | Confirm delivery | `DeliveryConfirm.html` | `/sales/deliveries/:id` |
| S16 | Delivery order print preview (A4, like S20; quantities only, no prices) | `InvoicePrint.html` | `/sales/deliveries/:id/print` |
| S17 | Invoice list | `InvoiceList.html` | `/sales/invoices` |
| S18 | Create invoice from order | `CreateInvoice.html` | `/sales/invoices/new` |
| S19 | Invoice. Phase 5: the price check names the range when it is on (`checks.priceReason`) | `InvoiceForm.html` | `/sales/invoices/:id` |
| S20 | Invoice print preview | `InvoicePrint.html` | `/sales/invoices/:id/print` |
| S21 | Proforma list | `ProformaList.html` | `/sales/proformas` |
| S22 | Proforma | `ProformaForm.html` | `/sales/proformas/:id` |
| S22 | Proforma print preview (A4, like S20) | `InvoicePrint.html` | `/sales/proformas/:id/print` |
| S23 | Cash sales list | `CashSaleList.html` | `/sales/cash-sales` |
| S24 | Cash sale | `CashSale.html` | `/sales/cash-sales/:id` |
| S25 | Debit note list | `DebitNoteList.html` | `/sales/debit-notes` |
| S26 | Debit note | `DebitNote.html` | `/sales/debit-notes/:id` |
| S27 | Sales return list | `SalesReturnList.html` | `/sales/returns` |
| S28 | Sales return | `SalesReturn.html` | `/sales/returns/:id` |
| S29 | Credit control | `Policies.html` | `/sales/settings/credit-control` |
| S30 | Document types | `DocTypes.html` | `/sales/settings/document-types` |
| S31 | Enquiry types and sources | `EnquiryTypes.html` | `/sales/settings/enquiry-types` |
| S32 | Excluded items | `ExcludedItems.html` | `/sales/settings/excluded-items` |
| S33 | Email templates | `EmailTemplates.html` | `/sales/settings/email-templates` |

Sales guide and flows: `SalesUxGuide.html`, `SalesNavMap.html`, `FlowS1.html` … `FlowS6.html`.

---

## Core module (Master Data, phase 3)

Theme: indigo. Sidebar groups: **Items & Units**, **Customers & Suppliers**, **Prices & Tax**, **Warehouses & Locations**, **Setup**. Seed data: `CORE_SEED_DATA.md`. Core is the only module that writes `mdm_` tables; Purchase and Sales keep reading them through `MasterDataPort`.

The Core mockups were made in step C0, after the app's layout redesign, so they show the current shell (icon rail, group panel, floating top bar). Lists and forms follow the Purchase and Sales patterns. They were revised after checking the SRS and SDD: `CORE_SEED_DATA.md` → *Decided by the SRS and SDD* lists each rule with its reference.

The item, customer and supplier forms show where the record is used. Delete is possible only while nothing uses it. Block and Discontinue wait while an open Purchase or Sales document uses it. Core gets this from a read-only check that Purchase and Sales provide. Forms pick from `GET /api/v1/core/lookups/item-form` (item groups, units, tax codes, LHDN classification codes), `GET /api/v1/core/lookups/customer-form` (categories, areas, credit terms, branches, sales agents, price lists, ID types), `GET /api/v1/core/lookups/supplier-form` (payment terms, currencies, ID types), `GET /api/v1/core/lookups/suppliers?q=` and `GET /api/v1/core/lookups/purchasable-items?q=` (for contract prices). The same usage answer is at `GET /api/v1/core/usage/:kind/:code` (`item`, `customer`, `supplier`, `uom`, `tax-code`, `price-list`, `warehouse`), e.g. `/core/usage/item/CH-DIN-01`.

| Code | Screen | Mockup | Route | Main API |
|---|---|---|---|---|
| C01 | Core home | `CoreHome.html` | `/core` | GET /api/v1/core/dashboard (phase 5: *Needs attention* also counts the customers salespeople added from an order, still to complete) |
| C02 | Item list | `CoreItemList.html` | `/core/items` | GET /api/v1/core/items |
| C03 | Item | `CoreItemForm.html` | `/core/items/:id` | GET, POST, PATCH /api/v1/core/items/:id (GET includes where it is used) · POST …/block, …/activate, …/discontinue · DELETE /api/v1/core/items/:id (only if never used) · phase 5: a Picture card (`pictureId`, uploaded with POST /api/v1/attachments) |
| C04 | Customer list | `CoreCustomerList.html` | `/core/customers` | GET /api/v1/core/customers (phase 5: `?toComplete=1` shows the customers added from an order, still to complete, each with a *To complete* chip) |
| C05 | Customer | `CoreCustomerForm.html` | `/core/customers/:id` | GET, POST, PATCH /api/v1/core/customers/:id (credit fields need core.customer.credit; GET includes where it is used) · POST …/block, …/activate · DELETE /api/v1/core/customers/:id (only if never used) · phase 5: a banner and POST …/complete (*Mark as complete*, core.customer.edit) for a customer a salesperson added from an order |
| C06 | Supplier list | `CoreSupplierList.html` | `/core/suppliers` | GET /api/v1/core/suppliers · GET /api/v1/core/suppliers/supplies (the *Supplies* filter) |
| C07 | Supplier with contract prices | `CoreSupplierForm.html` | `/core/suppliers/:id` | GET, POST, PATCH /api/v1/core/suppliers/:id (contract prices need core.supplier.contract; GET includes where it is used) · POST …/block, …/activate · DELETE /api/v1/core/suppliers/:id (only if never used) |
| C08 | Price lists | `CorePriceLists.html` | `/core/price-lists` | GET /api/v1/core/price-lists (prices, used by) |
| C09 | Price list with its prices | `CorePriceListForm.html` | `/core/price-lists/:id` | GET, POST, PATCH /api/v1/core/price-lists/:id (PATCH sends the prices from today on; earlier prices are history) · POST …/deactivate, …/activate · DELETE /api/v1/core/price-lists/:id (only if no customer or Sales document uses it) · GET /api/v1/core/lookups/sellable-items?q= (items with their units) |
| C10 | Tax codes | `CoreTaxCodes.html` | `/core/tax-codes` | GET, POST /api/v1/core/tax-codes · GET, PATCH, DELETE /api/v1/core/tax-codes/:code (by code: a code is all its rate periods; DELETE only if unused) · POST …/:code/rates (new rate) · DELETE …/:code/rates/:id (a rate that has not started) |
| C11 | Units of measure | `CoreUoms.html` | `/core/uoms` | GET, POST /api/v1/core/uoms · GET, PATCH, DELETE /api/v1/core/uoms/:id (delete only if never used) |
| C12 | Reference lists | `CoreReference.html` | `/core/reference` | GET /api/v1/core/reference (the five lists) · POST /api/v1/core/reference/:list · PATCH, DELETE …/:list/:id (`item-groups`, `customer-categories`, `areas`, `credit-terms`, and since phase 5 `package-categories`; tab in `?list=`) |
| C13 | Warehouses and locations (locations read only) | `CoreWarehouses.html` | `/core/warehouses` | GET /api/v1/core/warehouses (with their locations, read only) · POST · GET, PATCH, DELETE /api/v1/core/warehouses/:id (DELETE only if unused and without locations); selected warehouse in `?w=` |
| C14 | Import from CSV | `CoreImport.html` | `/core/import` | GET /api/v1/core/imports/kinds (with the template columns) · POST /api/v1/core/imports/check (multipart: file, kind; saves nothing) · POST /api/v1/core/imports/load (multipart: file, kind; saves each passing row on its own) |

## Configuration module (phase 4)

Theme: slate. Rail groups: **Organisation**, **Users & Access**, **Security**, **My Account**. Seed data: `CONFIG_SEED_DATA.md`. Configuration is the only module that writes the identity and organisation tables (`sys_legal_entity`, `sys_branch`, `sys_user`, `sys_role` …); the other modules keep reading users and branches through `MasterDataPort`.

The mockups were made in step A0 in the current shell. The top bar of every module gets the active-branch switch (shown in these mockups) and a user menu with *My account* and *Sign out* in step A5. Sign-in pages (A02, A03) sit outside the module layout. With `AUTH_MODE=dev` the user switcher stays and sign-in is skipped.

| Code | Screen | Mockup | Route | Main API |
|---|---|---|---|---|
| A01 | Configuration home | `CfgHome.html` | `/config` | GET /api/v1/config/dashboard |
| A02 | Sign in | `CfgSignIn.html` | `/sign-in` | POST /api/v1/auth/sign-in · POST /api/v1/auth/refresh · POST /api/v1/auth/sign-out · POST /api/v1/auth/forgot · POST /api/v1/auth/link · POST /api/v1/auth/reset (`/sign-in/forgot`, `/sign-in/reset?token=`) |
| A03 | Two-factor set-up and code | `CfgTwoFactor.html` | `/sign-in/two-factor` | POST /api/v1/auth/two-factor/setup · POST /api/v1/auth/two-factor (code from the app or a recovery code) |
| A04 | Company, with its branches | `CfgCompany.html` | `/config/company` (`?company=CODE`, `?new=1`) | GET, POST /api/v1/config/companies · GET, PATCH /api/v1/config/companies/:id · POST …/deactivate, …/activate |
| A05 | Branches: tree and branch form | `CfgBranches.html` | `/config/branches` (`?code=PNG`, `?new=1&company=ID`) | GET, POST /api/v1/config/branches · GET, PATCH /api/v1/config/branches/:id (the Active switch is part of the form) |
| A06 | User list | `CfgUserList.html` | `/config/users` (`?role=`, `?branch=`, `?twoFactor=missing`) | GET /api/v1/config/users · GET /api/v1/config/users/lookups |
| A07 | User | `CfgUserForm.html` | `/config/users/:id` | GET, POST, PATCH /api/v1/config/users/:id · POST …/deactivate, …/activate · …/send-link (reset, or set-password when there is no password yet), …/revoke-sessions, …/reset-two-factor, …/unlock |
| A08 | Role list | `CfgRoleList.html` | `/config/roles` | GET /api/v1/config/roles |
| A09 | Role with its permissions | `CfgRoleForm.html` | `/config/roles/:id` | GET, POST, PATCH, DELETE /api/v1/config/roles/:id · POST …/reset-to-starter · GET /api/v1/config/permissions/catalogue |
| A10 | Who can do what | `CfgPermissions.html` | `/config/permissions` | GET /api/v1/config/permissions/user/:id · GET /api/v1/config/permissions/compare?a=&b= |
| A11 | My account | `CfgMyAccount.html` | `/account` | GET /api/v1/account · POST /api/v1/account/password · DELETE /api/v1/account/sessions/:id · POST /api/v1/account/sessions/sign-out-others · POST /api/v1/account/two-factor/setup, …/enable, …/disable, …/recovery-codes |
| A12 | Security log | `CfgSecurityLog.html` | `/config/security-log` (`?kind=`, `?user=`, `?period=day\|week\|month\|year\|all`) | GET /api/v1/config/security-events · GET …/export (CSV) |
| A13 | Audit trail | `CfgAudit.html` | `/config/audit` (`?module=`, `?user=`, `?period=`) | GET /api/v1/config/audit · GET /api/v1/config/audit/:id · GET …/export (CSV) |
| A14 | Sign-in settings | `CfgSignInSettings.html` | `/config/sign-in-settings` | GET, PATCH /api/v1/config/settings/sign-in |

## WMS module (read-only view)

Opens from the launcher's WMS tile where a client's WMS is connected (`WMS_URL`). Everything is read only and comes live from the WMS; who owns what is in `docs/integration/WMS_DATA_OWNERSHIP.md`. All routes need `wms.view`.

| Code | Screen | Mockup | Route | API |
|---|---|---|---|---|
| W00 | WMS home (a tile per screen, KPI cards, charts; no separate mockup, it follows the other module homes) | none | `/wms` | GET /api/v1/wms/dashboard · GET, PUT, DELETE /api/v1/wms/dashboard/board |
| W01 | Inventory | `WmsInventory.html` | `/wms/inventory` | GET /api/v1/wms/inventory |
| W02 | Stock Location | `WmsStockLocation.html` | `/wms/stock-location` | GET /api/v1/wms/stock-locations |
| W03 | EPC Lookup | `WmsEpcLookup.html` | `/wms/epc-lookup` (`?code=`) | GET /api/v1/wms/epc/:code (EPC or serial number) |
| W04 | Receiving | `WmsReceiving.html` | `/wms/receiving` | GET /api/v1/wms/receiving |
| W05 | Shipping | `WmsShipping.html` | `/wms/shipping` | GET /api/v1/wms/shipping |

## Field sales and installation (phase 5, planning)

Mockups made in step F0 for the user's approval; nothing is built. Seed data and the choices made: `FIELD_SALES_SEED_DATA.md`. The plan is in `CLAUDE.md` → *Phase 5 · Field sales and installation*. Everything here shows the profile turned **on**; with it off, the Sales screens stay as in *Sales module* above.

The Service module is new: orange (side `#C2410C`, primary `#9A3412`, light `#FFF7ED`, chip `#FFEDD5`; proposed, to be added to `DESIGN_TOKENS.md` when approved). Sidebar groups: **Planning**, **Setup**. The phone app's screens are not listed here: they wait with the app (decision 13).

| Code | Screen | Mockup | Route (proposed) |
|---|---|---|---|
| S34 | Sales flow (Operation Policies): the profile's switches. **Built (F1, parts 1, 5 and 6):** the two step switches, *Ask for an installation option on the order* and *Salespeople add new customers on the order*; the Prices card (*Salespeople set prices within a range of the price list* and its two percentages, 18 Nov); the Payments card (*Salespeople record payments as official receipts*, 18 Nov); the Orders card (*Salespeople revise a released order until it is delivered*, *Short stock makes the order a pre-order*, and *Cancel an order with no receipt and no delivery after a number of days* with its days and *Check now*, 23 Nov), `GET`, `PUT /api/v1/sales/settings/sales-flow`; the other settings on the mockup come with their own parts | `FsPolicies.html` | `/sales/settings/sales-flow` |
| S11 | Sales order with a package, a free gift, a voucher, the installation option and the customer's signature (profile on). **Built (F1, parts 3 and 4):** *Add package* (picture cards under category tabs, with the terms of the one picked, since 18 Nov) and the package and gift lines, `GET /api/v1/sales/lookups/packages?date=`; *Add voucher* (`vouchers` on `POST`, `PATCH /api/v1/sales/orders`); **part 5:** the Installation and Preferred date fields (`installOption`, `installDate`) when Sales Flow asks for them, and since 23 Nov the delivery address's Postcode and State (`deliveryPostcode`, `deliveryState`); **revisions** (23 Nov): *Revise* with a reason on a released order with nothing made from it, the revision banner, *Discard revision*, *Revision needs approval*, the Revisions card and *Installer booked* (`revisions`, `installBooking` in the detail; `POST …/revise`, `POST …/discard-revision`); **part 6:** *+ New customer* under the customer field when Sales Flow allows it (`POST /api/v1/sales/customers`; Core makes the customer); the signature comes with its own part | `FsOrder.html` | `/sales/orders/:id` |
| C15 | Package list. **Built (F1, parts 2 and 3)**, the Orders column from the record-usage check; a picture and Category column (18 Nov) · `GET /api/v1/core/packages` | `CorePackages.html` | `/core/packages` |
| C16 | Package: items, package price, free gift. **Built (F1, part 2)**, without branches and gift stock; Category, Terms and a Picture card (18 Nov); codes with `@`, up to 30 · `GET, POST, PATCH, DELETE /api/v1/core/packages/:id`, `POST …/end`, `GET /api/v1/core/lookups/active-items?q=` (gift picker) | `CorePackageForm.html` | `/core/packages/:id` |
| V01 | Service home. **Built (F3, part 1):** not booked, oldest waiting, waiting to be booked · `GET /api/v1/service/home`; today by person comes with the booking board. **Part 4:** an *Overdue* card | `SvcHome.html` | `/service` |
| V02 | Planning Board (named as in the user's Service design). **Built (F3, part 2):** one day, a row per person, free slots for the picked job, book and move · `GET /api/v1/service/board?date=`, `POST /api/v1/service/jobs/:id/book`. **Part 4:** the job type's default slot group first; only people who take the job and go to its kind of site (the others greyed, with why); an extended job drawn to its new end; overdue jobs outlined in red; a line at the time now. **Part 5:** only the slot groups for the job's type and its kind of site; *Details missing* on a waiting job and a warning when it is picked (never blocking) | `SvcBoard.html` | `/service/board` |
| V03 | Job list. **Built (F3, part 1)**, person and slot fill in with the booking board · `GET /api/v1/service/jobs`. **Part 4:** a Site column, an *Overdue* chip and an *Overdue only* filter (`?overdue=1`) | `SvcJobs.html` | `/service/jobs` |
| V04 | Job: stages, booking, what the installer recorded, fees. **Built (F3, part 1):** customer and site, preferred date, note, items, activity, stage bar, cancel; and a job added by the office (`/service/jobs/new`). **Part 3:** *Record the visit* (result, times, paid on site, photos), *What the installer recorded*, follow-up job · `POST …/record`, `POST …/follow-up`. **Part 4:** site type, *Expected done by*, *Extend the time* (`POST …/extend`), the overdue banner; *Order payment* under Linked documents, from Sales' official receipts. **Part 5:** Postcode and State of the site, and *Missing before booking* (`missingForBooking`, `missingText`); the *At risk* banner when stock is not ready 24 hours before (`atRisk`, `atRiskNote`, `POST /api/v1/service/jobs/stock-check`) · `POST /api/v1/attachments` (entity `SVC_JOB`) · `GET`, `POST`, `PATCH /api/v1/service/jobs/:id`, `POST …/cancel`, `GET /api/v1/service/lookups/customers` | `SvcJob.html` | `/service/jobs/:id` |
| V06 | Service reminders (F6): due date, customer, item and interval, last done, the job made, dismiss; *Make jobs now* · `GET /api/v1/service/reminders`, `POST …/run`, `POST …/:id/dismiss`. No mockup: same layout as V03 | — | `/service/reminders` |
| V07 | Installer Claims (F5): a tab per status, installer, period and pay day, jobs, invoice, total, the PV once paid; the total on the tab · `GET /api/v1/service/claims`. No mockup: same layout as V03 | — | `/service/claims` |
| V08 | Installer claim (F5): installer and claim period, the jobs with the fee by rule (late ones marked), amount and reason, the jobs that cannot be claimed with why; the installer's invoice or *Self-billed*; *Submit to Account*; Account's *Send back*, *Approve*, *Record payment* (PV number and date) · `GET …/eligible`, `POST`, `PATCH /api/v1/service/claims/:id`, `POST …/submit`, `…/cancel`, `…/approve`, `…/send-back`, `…/pay` | — | `/service/claims/:id` |
| V05 | Slots and stages. **Built (F3, part 2):** people (kept by Service), slot groups, who takes which job, the fixed stages. **Part 4:** each person's own job types and the sites they go to; the slot group picked first per job type. **Part 5:** the sites each slot group is for (`siteTypes`), so a job category can suit only some sites. **F5:** *Claims fees* per person and the installer's fee per slot group · `GET /api/v1/service/settings`, `POST`, `PATCH …/people`, `…/slot-groups` | `SvcSettings.html` | `/service/settings` |

Still to draw, with the step that needs them: the quotation list as the office sees it with the profile on (F1), fee and commission rules and their report (F5), warranty jobs and service reminders (F6).
