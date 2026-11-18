# Field sales and installation: seed data (phase 5, planning)

Made in step F0 with the mockups. **Nothing is seeded yet.** It uses the existing demo company, customers and items, so no client's data is here. The demo moment stays Tuesday 29 Sep 2026.

This data shows the profile turned on. The standard demo seed keeps the profile off, so its numbers do not change. How the two live side by side (a second tenant or a test-only switch) is decided in F1.

## Sales flow settings (S34)

| Setting | Standard | Profile |
|---|---|---|
| Use enquiries | On | Off |
| Office drafts quotations | On | Off |
| Customer signature confirms the order | Off | On |
| Sales agents may add customers | Off | On |
| Price approval | Discount limit 15% | Allowed price range: 10% below to 20% above list |
| Ask for an installation option on the order | Off | On |

## New items

| Code | Name | Unit | Use |
|---|---|---|---|
| GF-CUSH-04 | Seat cushion set of 4 | SET | Free gift. Stock 40 at HQ-MAIN |
| GF-RUN-01 | Table runner, linen | PCS | Free gift. Stock 25 at HQ-MAIN |
| GF-PIL-02 | Pillow set of 2 | SET | In package PK-BED-KG. List price 80.00 |
| VC-0050 | Cash voucher RM 50 | — | Voucher line, −50.00 |

## Packages (C15, C16)

| Code | Name | Items | Normal value | Package price | Saves | Free gift | Runs | Status |
|---|---|---|---|---|---|---|---|---|
| PK-DIN-06 | Dining set, 6-seater | 1 × TB-DIN-06, 6 × CH-DIN-01 | 2,950.00 | 2,700.00 | 250.00 | Choose 1 of GF-CUSH-04, GF-RUN-01 | 1 Sep – 31 Dec 2026 | Running |
| PK-BED-KG | King bedroom set | 1 × BD-KNG-01, 2 × GF-PIL-02 | 1,560.00 | 1,450.00 | 110.00 | None | 1 Sep – 31 Dec 2026 | Running |
| PK-DIN-YE | Year-end dining set | 1 × TB-DIN-06, 6 × CH-DIN-01 | 2,950.00 | 2,600.00 | 350.00 | Choose 1 of 2 | 1 – 31 Dec 2026 | Scheduled |

Normal values use the Standard 2026 prices: TB-DIN-06 1,450.00, CH-DIN-01 250.00, BD-KNG-01 1,400.00.

**Price spread for PK-DIN-06** (by list value, the last item takes the remainder so the lines add up to the package price):
- TB-DIN-06: 2,700.00 × 1,450 ÷ 2,950 = 1,327.12
- CH-DIN-01: 2,700.00 − 1,327.12 = 1,372.88 for 6, unit price 228.8133

## The signed order (S11)

SO-0009, 29 Sep 2026, C-0078 Klinik Sihat Jaya, agent Faizal Omar, HQ, from quotation QT-0013, signed by Dr. Nurul Huda (Owner) at 10:02 AM. Installation: *Installation*, preferred date Thu 1 Oct 2026.

| # | Line | Qty | Price | Amount |
|---|---|---|---|---|
| 1 | PK-DIN-06 package | 1 SET | 2,700.00 | 2,700.00 |
| 2 | GF-CUSH-04 free gift | 1 SET | 0.00 | Free |
| 3 | VC-0050 voucher no. CV-2609-0031 | 1 | −50.00 | −50.00 |

Subtotal 2,700.00 · vouchers −50.00 · tax 10% of 2,650.00 = 265.00 · total **2,915.00**. Credit: limit 15,000.00, exposure with this order 2,915.00, OK. Releasing it makes installation job JB-0012, *Not booked*.

## Service (V01–V05)

**People:** Hafiz Rahman and Lee Jun Wei (Installer), Suresh Nair (Technician), Nor Aisyah (Warranty). Installers take installation jobs; the technician takes service and repair; warranty takes warranty jobs.

**Slot groups:**

| Group | Slot | Day | Used for |
|---|---|---|---|
| Standard | 2 hours | 10 AM – 6 PM | Installation |
| Early | 2 hours | 9 AM – 5 PM | Installation |
| Short | 1 hour | 9 AM – 5 PM | Service, warranty, repair |
| Long | 4 hours | 10 AM – 6 PM | Installation with building work |

**Stages:** Not booked → Booked → Accepted → Done → Checked → Closed, or Cancelled.

**Jobs on Tue 29 Sep** (8 in all: 2 not booked, 2 booked, 2 accepted, 2 done):

| Job | Type | Customer | Order | Person | Slot | Stage |
|---|---|---|---|---|---|---|
| JB-0005 | Installation | Hotel Seri Bayu | SO-0001 | Hafiz Rahman | 10 AM – 12 PM | Done, paid on site, fee 180.00 + 12.00 parking |
| JB-0006 | Installation | Villa Damai Resort | SO-0007 | Hafiz Rahman | 2 PM – 4 PM | Accepted |
| JB-0007 | Service | Syarikat Delta Trading | — | Suresh Nair | 9 AM – 10 AM | Done, not paid |
| JB-0008 | Warranty | Klinik Sihat Jaya | — | Nor Aisyah | 11 AM – 12 PM | Booked |
| JB-0009 | Installation | Hotel Seri Bayu | SO-0003 | Lee Jun Wei | 10 AM – 2 PM | Accepted |
| JB-0010 | Repair | Villa Damai Resort | — | Suresh Nair | 2 PM – 3 PM | Booked |
| JB-0011 | Service | Restoran Selera Kampung | Service reminder | — | Due 5 Oct | Not booked |
| JB-0012 | Installation | Klinik Sihat Jaya | SO-0009 | — | Asks for Thu 1 Oct | Not booked |

The board mockup shows Thu 1 Oct with JB-0013 to JB-0015 already booked and JB-0012 being booked for Hafiz Rahman, 12 PM – 2 PM.

## Choices made (the user confirms these in F0)

| # | Choice | Why |
|---|---|---|
| 1 | The demo uses furniture with assembly as the "installation" | The repo holds no client data; the demo company already sells furniture |
| 2 | A voucher is shown as a line with a negative amount, and it lowers the taxable amount. It is kept beside the order's lines (not as one), so it never goes on a delivery order; the order's first invoice that covers it uses it | It prints the way such orders are printed today. Whether tax should be worked out before or after a voucher, and what a return gives back on an invoice that used one, need the client's accountant |
| 3 | A free gift is a line at RM 0.00 with no tax | The stock must still go out on the delivery order |
| 4 | A package's price is spread over its items by list value | Each item then has a real price for delivery, invoice and returns |
| 5 | The installation option is a field on the order, not a line at RM 0.00 | Simpler to read; the job is made from the field |
| 6 | "Paid on site" is the installer's note only | Payments are out of scope for this phase |
| 7 | The Service module is orange | A colour no other module uses |
| 8 | Job numbers JB-####, voucher numbers typed by the user | Vouchers are not issued or checked by the system in this phase |
| 9 | A customer a salesperson adds from an order gets cash terms, no credit limit and the cash customer's price list, and is marked *To complete* until the office checks it in Core. A phone already on file is refused | Households pay on delivery or on site; the office keeps master data right; one household, one record. The demo seed has no such customer and turns the switch off |
| 11 | Each Service person has their own job types and the sites they go to (landed house, condo / apartment, shop / office); the role only sets what a new person starts with. A booked job is expected to finish at the end of its slot, the office can extend it with a reason, and once that time has passed with the visit not recorded the job stays overdue until the visit is recorded | The client's process diagrams: installers take some warranty jobs and technicians some installations; landed and condo suit different people; "the overdue flag stays until done". The demo seed has no people or jobs |
| 10 | A package or item picture is only a picture. The card shows the system's price under it, and the order is priced from Core | Promotion posters carry a printed price that goes out of date; the order must never take a price from a picture |
