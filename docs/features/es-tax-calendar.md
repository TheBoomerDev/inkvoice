# Spanish Fiscal Calendar

A plugin that turns the invoices and expenses already in Inkvoice into the
Spanish tax calendar for a year: the four VAT periods with their AEAT
deadlines, the annual returns, and an estimate of the IRPF instalment.

It files nothing. It computes what your own books say and puts a date next to
each figure, so the quarter can be handed to an accountant — or entered in the
AEAT portal — without rebuilding the numbers anywhere else.

> This plugin ships with the fork at `github.com/TheBoomerDev/inkvoice`. The
> upstream OSS build does not carry it, and the public plugin catalog at
> `inkvoice.app` does not list it, so a fork install should keep the bundled
> catalog (set the `plugin_catalog_url` setting to an empty string) to get its
> name and description from the snapshot committed in this repo.

## Enabling it

Settings → Plugins → **Spanish Fiscal Calendar** → Enable. It is off by
default: only relevant to businesses filing Spanish taxes.

Once enabled, **Fiscal calendar** appears in the sidebar under Extensions.

## What it computes

| Period | What you see |
|---|---|
| Each quarter | Taxable sales, output VAT, input VAT, result — with the per-rate breakdown |
| Each quarter | The AEAT deadline, days left, and the period state |
| Each quarter | How many drafts are dated in the period, blocking the close |
| Year | Output VAT, input VAT and the VAT result of the exercise |
| Modelo 303 / 420 | Quarterly self-assessment figures |

The annual block covers:

- **Modelo 390 / 425** — annual VAT summary, due 30 January.
- **Modelo 347** — operations with each customer above €3,005.06 over the year,
  due 28/29 February. The customer list marks who is reportable.
- **Modelo 349** — intra-community operations, due the 20th of the following
  month (or quarter).
- **Modelo 130** — IRPF instalment under estimación directa, estimated as 20%
  of the year's profit (taxable sales minus taxable purchases). It is an
  estimate, not a filing.

## Territories

The **Territory** selector switches the calendar:

- **Régimen común (AEAT)** — modelos 303 / 390 / 347 / 349 / 130, deadlines on
  20 April, 20 July, 20 October and 30 January.
- **Canarias (IGIC)** — modelos 420 / 425 on the same dates; the amounts come
  from the same invoices, so label them as IGIC.
- **Foral territory** (Navarra, Álava, Bizkaia, Gipuzkoa) — amounts only. Their
  calendars and models come from each foral treasury, so none are invented
  here; the page says so.

## How the figures are produced

Everything comes from the local SQLite database:

- **Output VAT** — `invoice_items.tax_amount` of invoices whose status is
  `sent`, `paid`, `partially_paid`, `overdue` or `complete`, grouped per
  quarter by `issue_date`. Credit notes carry negative lines, so they subtract
  naturally. Drafts and voided invoices are excluded.
- **Input VAT** — `expenses.tax_amount` per quarter by `expense_date`.
- **Currency** — every row is converted to the base currency with the
  `exchange_rate` frozen on that row, so a past quarter never moves when rates
  do.
- **Modelo 347** — yearly `total` per customer, credit notes included.

## API

Mounted at `/api/v1/plugins/es-tax-calendar` and gated by plugin enablement:

| Method | Path | Notes |
|---|---|---|
| `GET` | `/report?year=YYYY` | The whole calendar. Defaults to the current year; years outside 2000–2100 are rejected. |
| `GET` | `/config` | Current territory, `fiscal_form`, `company_country` and currency, plus the selectable regimes, forms and models. |
| `PUT` | `/config` | `{ "regime": "comun" \| "canarias" \| "foral", "fiscal_form": "autonomo" \| "sociedad" }`, admin only. |
| `GET` | `/briefing?model=<m>&period=<p>` | The guide, the figures and the rows for one filing. `period` is `2026-T3` for a quarter or `2026` for an annual return. |
| `GET` | `/briefing?model=<m>&period=<p>&format=zip` | The same bundle as a ZIP: `LEEME.md`, `resumen.csv`, `facturas.csv`, `gastos.csv` and, for the 347, `clientes_347.csv`. |

## Two views of the same numbers

The plugin renders a monthly calendar next to the quarterly summary. The
calendar is the answer to "when do I file this?", which the quarter table does
not show on its own: every deadline has its own date, and several of them fall
in the following year.

`report.filings` is the single source of truth for it — a flat, date-ordered
list of every obligation the installation can derive for the year:

| Field | Meaning |
|---|---|
| `date` | Filing deadline (always the 20th/28th/30th/31st of the month, per model). |
| `model` | 303, 420, 130, 200, 390, 425, 347, 349. |
| `kind` | `iva`, `irpf`, `is`, `info`, `intracom`. |
| `period_from` / `period_to` | The quarter or the year the filing covers. |
| `state` | `open`, `overdue`, `closed`, `no_activity`, `pending`. |
| `amount` | Computed amount, or `0` when nothing exceeds the threshold. |
| `note` | Machine key for the explanation (`choose_form`, `note_annual`, …). |

Which filings exist depends on the settings:

- **Régimen común**: 303 (quarterly), 390 (annual), 347, 349.
- **Canarias**: 420 (quarterly), 425 (annual), 347, 349.
- **Autónomo**: 130 (quarterly IRPF advance) on top.
- **Sociedad**: 200 (annual corporation tax) instead of 130.

Months of the following year that hold a deadline (January for 303/130/390/349,
February for 347, July for 200) are appended to the calendar, because the
fourth quarter is filed there. `fiscal_form = null` keeps both the 130 and the
200 out and shows a `choose_form` note rather than guessing.

## Filing guides and the ZIP

Each filing carries a beginner guide: what the model declares, **where it is
presented** (the AEAT Sede Electrónica), who has to file it, the deadline, how
to identify yourself (certificate, DNIe, Cl@ve), the steps in order and the
pitfalls. The text is Spanish on purpose — it is about the Spanish agency — and
the same guide is written into the ZIP as `LEEME.md`.

Models covered: 303, 420 (Canarias), 130, 200, 390, 425, 347 and 349. A guide
only exists for an obligation this installation actually has: the 420 needs the
Canarias regime, the 130 needs an autónomo and the 200 a sociedad. The route
answers 404 instead of inventing a declaration.

The ZIP is what the taxpayer takes to the agency:

| File | Contents |
|---|---|
| `LEEME.md` | The guide: where, who, when, how, and the warnings. |
| `resumen.csv` | The amounts this installation computes for that period. |
| `facturas.csv` | The invoices of the period that back the numbers. |
| `gastos.csv` | The expenses of the period, with their invoice links. |
| `clientes_347.csv` | Only for the 347: counterparties and their annual total. |

Quarterly briefings show the quarter's own figures; the annual returns show
the whole exercise. Amounts are formatted Spanish style (`2.000,00 EUR`).

## Expense invoice links

Gastos can carry a URL to the invoice instead of (or besides) a local copy:
`expenses.attachment_url` (migration 36). It is a plain `TEXT` column, accepted
on create/update, in the CSV import (aliases `attachment_url`, `link`, `url`,
`drive`, `gdrive`, `receipt_url`, `invoice_url`) and in the CSV export, shown in
the expenses table as a link to the original file. Only `http(s)://` values are
accepted. The link lets an accountant or a reviewer open the Drive/Dropbox copy
of the invoice when reviewing a period, without uploading anything to the
server.

Scoped API tokens cannot reach plugin paths; unscoped tokens act as their
owner.

## Why this is a plugin and not a separate service

Inkvoice plugins are statically compiled-in modules with their own migrations,
routes under `/api/v1/plugins/<id>`, an admin toggle, and a sidebar entry. That
is exactly the shape of this feature: it reads core tables, adds no service to
operate, and can be switched off without touching the invoicing core. A
companion microservice would have needed credentials, a sync loop and a second
deployment for numbers that already live in the same database.

## Disclaimer

The figures are bookkeeping derived from this installation, not a filed
declaration. Check them against the libro registro before presenting anything
to the AEAT.
