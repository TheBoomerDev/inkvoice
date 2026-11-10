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
| `GET` | `/config` | Current territory, `company_country` and currency. |
| `PUT` | `/config` | `{ "regime": "comun" \| "canarias" \| "foral" }`, admin only. |

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
