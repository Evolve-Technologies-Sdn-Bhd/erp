# Design tokens

Since the UI refresh (U1, 27 Nov 2026) the ERP looks like the Zora MES design, so the Zora products share one standard. The reference is the MES repository (`src/assets/main.css` from *Page ink* on, `src/main.ts`, `components/common/StatCard.vue`, `TableTools.vue`, `FoundationCrudTable.vue`, `components/layout/AppSidebar.vue`, `AppHeader.vue`).

The values live in one place in the frontend, `src/assets/erp-theme.css`. Use them through CSS variables or the Tailwind names in `main.css` (`bg-erp-card`, `text-erp-muted`, `bg-mod-primary` …). Do not hard-code hex values inside components.

The mockups in `docs/design/mockups` still decide **what** is on each screen: layout, labels, column order, buttons and wording. This file decides **how it looks**.

## Type and shape

| Token | Value |
|---|---|
| Font | `Inter` for text, with its single-storey a and open digits (`cv11`, `ss01`) and −0.01em letter-spacing; `Geist` for page titles (every `h1`), big numbers and dialog titles (`--erp-font-display`, class `.erp-display`). Both from Google Fonts, weights 400–700 |
| Weights | 400 text; 500 labels, buttons and table headers; 600 titles and numbers. `font-bold` draws 600 |
| Base text | 13px; labels 12px; table headers 13px medium `#667085`, not uppercase |
| Page title | Geist semibold, tight: 20px on lists, 26px on documents |
| Card | white, 1px `#E4E7EC`, radius 12px, shadow `0 1px 2px rgb(0 0 0 / .05)` |
| KPI card | radius 16px; label 13px medium `#667085`; figure Geist 30px semibold, −0.03em; a soft glow of the module colour (`--mod-glow`) in the top-right corner |
| Fields | 32px, radius 10px, border `#E4E4E7` (hover `#D4D4D8`), focus: border `#A1A1AA` and a 3px halo `rgb(0 0 0 / .06)`; placeholder `#A1A1AA`; read-only and disabled `#FAFAFA`; a date field's calendar is an icon inside the field |
| Buttons | 32px, radius 10px, 13px medium; pressed 98% |
| Tables | 40px rows; header 13px medium `#667085` over a `#E4E7EC` line; hairlines `#F2F4F7` between rows, and between columns in list tables (DataList); hover `#F9FAFB`; picked row the module colour at 6% |
| Page | background `#F9F9FA`; text `#18181B`, soft `#3F3F46`, muted `#667085` |
| Scrollbars | thin, a grey thumb (`rgb(0 0 0 / .18)`) with room around it, no track |
| Layout | sidebar 220px, top bar 56px, content padding 18px 28px (changes in U2) |

## Module themes

Each module has its own colour so users always know where they are. Set the theme on the module layout root (`<div data-module="purchase">`); the layout also puts it on `<html>` so dialogs follow.

| Variable | Purchase (green) | Sales (purple) | Core (indigo) | Configuration (slate) | Use |
|---|---|---|---|---|---|
| `--mod-side` | `#15803D` | `#7B4FE0` | `#4F53D6` | `#5B6170` | Sidebar background |
| `--mod-hover` | `#17733A` | `#6A42D6` | `#4448C9` | `#525868` | Sidebar item hover |
| `--mod-active` | `#14532D` | `#5B35C9` | `#3A3DB5` | `#454A59` | Active sidebar item |
| `--mod-pill` | `#166534` | `#6A42D6` | `#4448C9` | `#525868` | Search box in the top bar |
| `--mod-primary` | `#166534` | `#6D45DB` | `#4448C9` | `#4B5165` | The one filled button (Add, Release, Award, Confirm), links, ticks, the chosen day |
| `--mod-accent` | `#166534` | `#5B35C9` | `#3A3DB5` | `#3D4352` | Badge text |
| `--mod-line` | `#15803D` | `#6D45DB` | `#4F53D6` | `#5B6170` | Editable cell border |
| `--mod-light` | `#F0FDF4` | `#F8F5FF` | `#F5F5FF` | `#F4F5F8` | Info notes, chosen options |
| `--mod-light-border` | `#BBF7D0` | `#DDD6FE` | `#D9DAFB` | `#D8DBE3` | Border for info notes |
| `--mod-grad-from` | `#6FD8A4` | `#AC78EB` | `#8F93FF` | `#A9B0C2` | The module's art: gradient, light corner |
| `--mod-grad-to` | `#14532D` | `#4E25CA` | `#2E31A3` | `#3D4352` | … and deep corner |
| `--mod-glow` | `#DCC25A` | `#EF8C8A` | `#E6866D` | `#9AA6FF` | The warm glow that blooms through the art and the KPI cards |

WMS (teal) and Service (orange) follow the same pattern: WMS side `#0E7490`, primary `#0B6577`, gradient `#5EC8DE` → `#0B4F61`, glow `#F0A37C`; Service side `#C2410C`, primary `#B23C0B`, gradient `#FFAD72` → `#B83A0B`, glow `#F5B64C`. Outside a module (launcher, sign-in) the colour is graphite, the absence of one: primary `#475569`, gradient `#94A3B8` → `#334155`, glow `#8EA3C7`.

The launcher uses one coloured tile per module (`--tile-*`).

## Buttons (same in every module)

| Class | Look | When |
|---|---|---|
| `erp-btn-add` | module colour, white text, a hairline of light on top and a soft drop | Starts a new document |
| `erp-btn-primary` | the same | The next step. Only one filled button per screen |
| `erp-btn-secondary` | white, border `#E4E4E7`, ink; hover `#FAFAFA` | Print, Email, Save draft, Back |
| `erp-btn-danger` | white, text `#B42318`, border `#FECDCA`; hover `#FEF3F2` | Reject, Cancel balance |
| `erp-btn-delete` | red `#D92D20`, white; hover `#B42318` | Delete drafts only |
| `erp-btn-import`, `erp-btn-export` | quiet: no fill, ink `#475467`, a grey wash on hover | Bulk upload, download as Excel |

## Status chips (same in every module)

A light tint, a hairline border, the text and a dot, so a chip reads as a status at a glance. 12px medium, 24px tall.

| Status group | Tint | Border | Text | Dot | Examples |
|---|---|---|---|---|---|
| draft | `#F9FAFB` | `#E4E7EC` | `#344054` | `#98A2B3` | Draft |
| pending | `#FFFAEB` | `#FEDF89` | `#B54708` | `#F79009` | Pending approval, To match, Waiting for credit |
| released | `#EFF8FF` | `#B2DDFF` | `#175CD3` | `#2E90FA` | Released, Submitted, Waiting, Sent |
| partial | `#F4F3FF` | `#D9D6FE` | `#5925DC` | `#7A5AF8` | Partially received, Short 5, Partial |
| done | `#ECFDF3` | `#ABEFC6` | `#067647` | `#17B26A` | Done, Converted, Awarded, Settled, Approved, Paid |
| cancelled | `#FEF3F2` | `#FECDCA` | `#B42318` | `#F04438` | Rejected, Cancelled, Closed |

Make one `StatusChip` component that maps a document status to these groups. Never colour a status by hand in a page.

## Tabs

Every row of tabs (status tabs of a list, the approvals inbox, a document's own tabs) is the MES segmented control: a `#F4F4F5` pill, the chosen tab lifted in white with a soft shadow, each count at 60% after its label. Classes `.erp-tabs`, `.erp-tab`, `.erp-tab-count`; `StatusTabs` uses them.

## Pager

"21–40 of 52" in 12px muted, then the pages as quiet 32px squares (radius 10px); the current page white with a hairline and a soft shadow.

## Notes and banners

| Kind | Background | Border | Text | Use |
|---|---|---|---|---|
| Info | `--mod-light` | `--mod-light-border` | `#18181B` | Policy hints |
| Warning | `#FFFAEB` | `#FEDF89` | `#93370D` (strong `#B54708`) | “Inventory is not connected yet…”, soft warnings |
| Error | `#FEF3F2` | `#FECDCA` | `#912018` | Blocked actions, failed checks |

Radius 12px, 13px text, the icon in the strong colour.

## Dropdowns, menus, the date picker and tooltips

One panel for every popup list (AutoComplete, Menu, Popover, the date picker): white, 1px `#E4E7EC`, radius 14px, shadow `0 20px 48px rgb(0 0 0 / .1)`. Rows 34px, radius 8px, highlight `#F2F4F7`; the chosen option keeps a plain row with a tick in the module colour. The date picker has round 32px days, today ringed, the chosen day in the module colour. Tooltips are a small white label with a hairline and a soft shadow, no arrow. Native tick boxes and radio buttons take the module colour.

## Dialogs

Radius 20px, border `#E4E4E7`, the page behind dimmed (`rgb(9 9 11 / .4)`) and blurred 3px. Title in Geist 17px semibold; the actions on a quiet `#FAFAFA` band with a `#F0F0F2` line; a round close button. In a question, the answer is filled and the way out is outlined.

## Toasts

One shared component, `ErpToast`, draws every toast; pages keep calling PrimeVue's `toast.add({ severity, summary, detail, life })`.

| Part | Value |
|---|---|
| Card | white `--erp-card`, 1px `--erp-input-border`, radius 16px, `--toast-shadow`, 352px wide; top right under the floating top bar (76px from the top, 24px from the right, in line with the bar); full width with a 16px gutter under 640px |
| Severity badge | 28px circle in the status-chip colours, the same in every module: success = done (green), info = released (blue), warn = pending (amber), error = cancelled (red). Icons: circle-check, info, triangle-alert, circle-x |
| Text | title 13px semibold `--erp-text`; detail 13px `--erp-muted` |
| Close | 28px round ghost button, `--erp-muted`, hover `--erp-muted-bg` |
| Time left | 3px bar along the bottom in the severity colour, paused while the pointer is on the toast (the toast stays open too) |
| Motion | in from the right, 300 ms `cubic-bezier(0.16, 1, 0.3, 1)`; out folding up, 220 ms; none with *reduce motion* |

## Guided tours (Help)

| Token | Value | Use |
|---|---|---|
| `--tour-accent` | `--mod-primary`; on the launcher `--launcher-bar` | Highlight ring, progress bar, tour buttons, the Help dot |
| `--tour-accent-soft` | `--mod-light`; on the launcher `#EEF0FB` | Soft tour backgrounds |
| `--tour-scrim` | `rgb(20 26 60 / 0.46)` | The dimmed page around the highlight, the Help panel backdrop (half strength) |
| `--tour-shadow`, `--tour-shadow-soft` | `rgb(20 26 60 / 0.35)`, `/ 0.08` | Tour box, pill and Help panel shadows |

The tour box is an `erp-card`-like card (16px radius) with the ERP's own buttons. Motion follows the module layout: 300 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, none with *reduce motion*. Under 640px the box docks at the bottom with a 16px gutter. A guide's *what to type* is a dashed `--erp-border` box; *You should see* uses the done chip colours (`--chip-done-*`), as do the letters of finished guides in Help.

## Numbers and dates

- Money: `RM 4,400.00` in totals and KPIs; `4,400.00` inside tables with the currency in the column header. Always 2 decimals, right-aligned, `font-variant-numeric: tabular-nums`.
- Quantities: whole numbers unless the unit allows decimals; show the unit (`100 ROLL`).
- Dates: `29 Sep 2026`. Date and time: `29 Sep, 10:05 AM`. Timezone `Asia/Kuala_Lumpur`.

## PrimeVue and Tailwind

- Use Tailwind (TailAdmin) for layout, cards, typography and spacing.
- Use PrimeVue 4 for the heavy widgets: DataTable, AutoComplete (Master Data pickers), DatePicker, Dialog, Toast, ConfirmDialog, Popover, Menu.
- The PrimeVue preset (`main.ts`) points the primary colour at `--mod-primary` and sizes fields, dropdown panels and option rows as MES does. The look itself is in `main.css`'s `components` layer, which comes after PrimeVue's own layer, so it wins without `!important`.
- Icons: `@lucide/vue` (the mockups use the same icon style).

## Not taken from MES

- MES turns text selection off everywhere except fields and table cells. The ERP keeps it on: people copy numbers and addresses from document pages.
- Dark mode comes as its own step (U5).
