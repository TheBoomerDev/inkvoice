// Spanish fiscal calendar. Computes, from this install's own data only:
//   - the quarterly VAT self-assessment (modelo 303 régimen común, 420 Canarias)
//   - the annual VAT summary deadlines (390 / 425)
//   - the informative return deadlines that depend on the year's operations
//     (347 per customer, 349 intra-community)
//   - an estimate of the IRPF instalment (modelo 130, estimación directa)
//   - per-quarter "cierre" state: whether the period has unissued drafts.
//
// Nothing here talks to the AEAT. Figures are the business's own bookkeeping,
// converted to the base currency with each row's frozen exchange_rate, so they
// are the numbers an accountant would start from — not a filed declaration.

import { getDb } from "../../database/connection";
import { getSetting, updateSettings } from "../../services/settings.service";

export type EsTaxRegime = "comun" | "canarias" | "foral";

export const REGIMES: readonly EsTaxRegime[] = ["comun", "canarias", "foral"] as const;

export function isRegime(value: unknown): value is EsTaxRegime {
  return typeof value === "string" && (REGIMES as readonly string[]).includes(value);
}

const SETTING_REGIME = "es_tax_regime";

// Invoice states that represent a real, issued operation. Drafts are excluded
// (nothing has accrued yet) and voided rows are excluded (they never existed
// fiscally). Credit notes are included: their amounts are negative, so they
// subtract from the period naturally.
const COUNTED_STATUSES = "('sent','paid','partially_paid','overdue','complete')";

/** Modelo 347 reporting threshold for a single counterparty over the year. */
export const MODEL_347_THRESHOLD = 3005.06;
/** Modelo 130 rate on the cumulative profit under estimación directa. */
const IRPF_RATE = 0.2;

const VAT_MODEL: Record<EsTaxRegime, string | null> = {
  comun: "303",
  canarias: "420",
  foral: null,
};

const ANNUAL_VAT_MODEL: Record<EsTaxRegime, string | null> = {
  comun: "390",
  canarias: "425",
  foral: null,
};

// --- Dates ------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function todayIso(today: Date): string {
  return `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}`;
}

/** Whole days from `from` to `to` (positive = to is in the future). */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export interface QuarterBounds {
  from: string;
  to: string;
  /** Filing deadline of the quarterly VAT return, null where there is none. */
  deadline: string | null;
}

/**
 * Quarter bounds and the VAT filing deadline. The régimen común and the Canary
 * IGIC share the same calendar shape: 20 April, 20 July, 20 October and
 * 30 January for the fourth quarter. Foral territories (Navarra, Álava,
 * Bizkaia, Gipuzkoa) file on their own calendar, which is not modelled here and
 * is reported as null rather than guessed.
 */
export function quarterBounds(year: number, quarter: number, regime: EsTaxRegime): QuarterBounds {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const from = isoDate(year, startMonth, 1);
  const to = isoDate(year, endMonth, lastDayOfMonth(year, endMonth));

  let deadline: string | null = null;
  if (regime !== "foral") {
    deadline = quarter === 4 ? isoDate(year + 1, 1, 30) : isoDate(year, endMonth + 1, 20);
  }
  return { from, to, deadline };
}

// --- Config -----------------------------------------------------------------

export interface EsTaxConfig {
  regime: EsTaxRegime;
  /** company_country setting, so the UI can explain why it is (not) relevant. */
  company_country: string | null;
  currency: string;
}

export function getConfig(): EsTaxConfig {
  const stored = getSetting(SETTING_REGIME);
  const country = getSetting("company_country");
  return {
    regime: isRegime(stored) ? stored : "comun",
    company_country: country || null,
    currency: getSetting("currency") || getSetting("base_currency") || "EUR",
  };
}

export function setRegime(regime: EsTaxRegime): EsTaxConfig {
  updateSettings({ [SETTING_REGIME]: regime });
  return getConfig();
}

// --- Aggregation ------------------------------------------------------------

export interface TaxRateRow {
  rate: number;
  taxable: number;
  tax: number;
}

export interface QuarterRow {
  quarter: number;
  from: string;
  to: string;
  /** Filing model for the period, null in foral territory. */
  model: string | null;
  deadline: string | null;
  /** Days until the deadline; negative once it has passed; null with no deadline. */
  days_left: number | null;
  /** open = period not over · due = period over, deadline ahead · overdue · closed */
  state: "open" | "due" | "overdue" | "closed";
  /** Base imponible of issued invoices (net of credit notes). */
  sales_taxable: number;
  /** IVA repercutido. */
  output_vat: number;
  /** Base imponible of recorded expenses. */
  purchases_taxable: number;
  /** IVA soportado. */
  input_vat: number;
  /** output_vat - input_vat; positive = a ingresar, negative = a compensar. */
  result: number;
  rates: TaxRateRow[];
  invoices: number;
  credit_notes: number;
  expenses: number;
  /** Drafts dated in the period: the quarter cannot be closed while these exist. */
  draft_invoices: number;
}

export interface Customer347Row {
  customer_id: string;
  name: string;
  tax_id: string | null;
  total: number;
  over_threshold: boolean;
}

export interface EsTaxReport {
  year: number;
  today: string;
  regime: EsTaxRegime;
  currency: string;
  company_country: string | null;
  notes: string[];
  quarters: QuarterRow[];
  year_totals: {
    sales_taxable: number;
    output_vat: number;
    purchases_taxable: number;
    input_vat: number;
    result: number;
    draft_invoices: number;
  };
  annual: {
    vat_model: string | null;
    vat_deadline: string | null;
    info_model: string | null;
    info_deadline: string | null;
    info_threshold: number;
    customers_347: Customer347Row[];
    intracom_model: string | null;
    intracom_deadline: string | null;
    irpf_model: string | null;
    irpf_deadline: string | null;
    irpf_estimate: number;
  };
}

interface InvoiceRow {
  id: string;
  issue_date: string;
  type: string | null;
  status: string;
  subtotal: number;
  tax_total: number;
  exchange_rate: number;
  split_rows: number;
  split_taxable: number;
  split_tax: number;
}

interface ExpenseRow {
  expense_date: string;
  taxable: number;
  tax: number;
}

interface RateRow {
  issue_date: string;
  rate: number;
  taxable: number;
  tax: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function quarterOf(isoDateValue: string): number {
  const month = Number(isoDateValue.slice(5, 7));
  return Math.floor((month - 1) / 3) + 1;
}

/**
 * Builds the fiscal calendar for `year`. `today` is injectable so the period
 * states are testable without freezing the clock.
 */
export function buildReport(year: number, today: Date = new Date()): EsTaxReport {
  const db = getDb();
  const config = getConfig();
  const { regime } = config;
  const todayStr = todayIso(today);

  const yearFrom = isoDate(year, 1, 1);
  const yearTo = isoDate(year, 12, 31);

  const invoices = db
    .query(
      `SELECT i.id, i.issue_date, i.type, i.status, i.subtotal, i.tax_total,
              COALESCE(i.exchange_rate, 1) AS exchange_rate,
              (SELECT COUNT(*) FROM invoice_taxes t WHERE t.invoice_id = i.id) AS split_rows,
              (SELECT COALESCE(SUM(t.taxable_amount), 0) FROM invoice_taxes t
                 WHERE t.invoice_id = i.id) AS split_taxable,
              (SELECT COALESCE(SUM(t.tax_amount), 0) FROM invoice_taxes t
                 WHERE t.invoice_id = i.id) AS split_tax
         FROM invoices i
        WHERE i.deleted_at IS NULL
          AND i.status IN ${COUNTED_STATUSES}
          AND i.issue_date >= ?
          AND i.issue_date <= ?`,
    )
    .all(yearFrom, yearTo) as InvoiceRow[];

  const rateRows = db
    .query(
      // Per-rate split comes from the line items: every invoice has them, while
      // the invoice_taxes summary rows only exist for invoices written by
      // releases that materialised them.
      `SELECT i.issue_date, t.tax_rate AS rate,
              SUM(t.line_total * COALESCE(i.exchange_rate, 1)) AS taxable,
              SUM(t.tax_amount * COALESCE(i.exchange_rate, 1)) AS tax
         FROM invoice_items t
         JOIN invoices i ON i.id = t.invoice_id
        WHERE i.deleted_at IS NULL
          AND i.status IN ${COUNTED_STATUSES}
          AND i.issue_date >= ?
          AND i.issue_date <= ?
        GROUP BY i.issue_date, t.tax_rate`,
    )
    .all(yearFrom, yearTo) as RateRow[];

  const expenses = db
    .query(
      `SELECT expense_date,
              amount * COALESCE(exchange_rate, 1) AS taxable,
              tax_amount * COALESCE(exchange_rate, 1) AS tax
         FROM expenses
        WHERE expense_date >= ? AND expense_date <= ?`,
    )
    .all(yearFrom, yearTo) as ExpenseRow[];

  const drafts = db
    .query(
      `SELECT issue_date, COUNT(*) AS n
         FROM invoices
        WHERE deleted_at IS NULL AND status = 'draft'
          AND issue_date >= ? AND issue_date <= ?
        GROUP BY issue_date`,
    )
    .all(yearFrom, yearTo) as { issue_date: string; n: number }[];

  const quarters: QuarterRow[] = [];

  for (let q = 1; q <= 4; q++) {
    const bounds = quarterBounds(year, q, regime);
    const rates = new Map<number, TaxRateRow>();
    let salesTaxable = 0;
    let outputVat = 0;
    let invoicesCount = 0;
    let creditNotes = 0;

    for (const inv of invoices) {
      if (quarterOf(inv.issue_date) !== q) continue;
      const rate = inv.exchange_rate || 1;
      // Prefer the itemised tax rows; fall back to the invoice totals for
      // invoices written before per-rate tax rows existed.
      const taxable = (inv.split_rows > 0 ? inv.split_taxable : inv.subtotal) * rate;
      const tax = (inv.split_rows > 0 ? inv.split_tax : inv.tax_total) * rate;
      salesTaxable += taxable;
      outputVat += tax;
      if (inv.type === "credit_note") creditNotes++;
      else invoicesCount++;
    }

    for (const row of rateRows) {
      if (quarterOf(row.issue_date) !== q) continue;
      const key = round2(row.rate);
      const acc = rates.get(key) ?? { rate: key, taxable: 0, tax: 0 };
      acc.taxable += row.taxable;
      acc.tax += row.tax;
      rates.set(key, acc);
    }

    let purchasesTaxable = 0;
    let inputVat = 0;
    let expensesCount = 0;
    for (const exp of expenses) {
      if (quarterOf(exp.expense_date) !== q) continue;
      purchasesTaxable += exp.taxable;
      inputVat += exp.tax;
      expensesCount++;
    }

    const draftCount = drafts
      .filter((d) => quarterOf(d.issue_date) === q)
      .reduce((sum, d) => sum + d.n, 0);

    const daysLeft = bounds.deadline ? daysBetween(todayStr, bounds.deadline) : null;
    let state: QuarterRow["state"];
    if (todayStr <= bounds.to) state = "open";
    else if (daysLeft === null) state = "due";
    else if (daysLeft < 0) state = "overdue";
    else state = "due";

    quarters.push({
      quarter: q,
      from: bounds.from,
      to: bounds.to,
      model: VAT_MODEL[regime],
      deadline: bounds.deadline,
      days_left: daysLeft,
      state,
      sales_taxable: round2(salesTaxable),
      output_vat: round2(outputVat),
      purchases_taxable: round2(purchasesTaxable),
      input_vat: round2(inputVat),
      result: round2(outputVat - inputVat),
      rates: [...rates.values()]
        .map((r) => ({ rate: r.rate, taxable: round2(r.taxable), tax: round2(r.tax) }))
        .sort((a, b) => b.rate - a.rate),
      invoices: invoicesCount,
      credit_notes: creditNotes,
      expenses: expensesCount,
      draft_invoices: draftCount,
    });
  }

  // --- Modelo 347: per-customer yearly volume -------------------------------
  const customers347 = db
    .query(
      `SELECT i.customer_id AS customer_id, c.name AS name, c.tax_id AS tax_id,
              SUM(i.total * COALESCE(i.exchange_rate, 1)) AS total
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.deleted_at IS NULL
          AND i.status IN ${COUNTED_STATUSES}
          AND i.issue_date >= ? AND i.issue_date <= ?
        GROUP BY i.customer_id, c.name, c.tax_id
        HAVING SUM(i.total * COALESCE(i.exchange_rate, 1)) <> 0
        ORDER BY ABS(SUM(i.total * COALESCE(i.exchange_rate, 1))) DESC`,
    )
    .all(yearFrom, yearTo) as {
    customer_id: string;
    name: string | null;
    tax_id: string | null;
    total: number;
  }[];

  const reports347: Customer347Row[] = customers347.map((row) => ({
    customer_id: row.customer_id,
    name: row.name ?? row.customer_id,
    tax_id: row.tax_id ?? null,
    total: round2(row.total),
    over_threshold: Math.abs(row.total) >= MODEL_347_THRESHOLD,
  }));

  const totals = quarters.reduce(
    (acc, q) => ({
      sales_taxable: acc.sales_taxable + q.sales_taxable,
      output_vat: acc.output_vat + q.output_vat,
      purchases_taxable: acc.purchases_taxable + q.purchases_taxable,
      input_vat: acc.input_vat + q.input_vat,
      draft_invoices: acc.draft_invoices + q.draft_invoices,
    }),
    { sales_taxable: 0, output_vat: 0, purchases_taxable: 0, input_vat: 0, draft_invoices: 0 },
  );

  const notes: string[] = [];
  if (regime === "foral") {
    notes.push("foral_calendar");
  }
  if (regime === "canarias") {
    notes.push("igic_instead_of_iva");
  }
  if (!config.company_country) {
    notes.push("no_company_country");
  }

  return {
    year,
    today: todayStr,
    regime,
    currency: config.currency,
    company_country: config.company_country,
    notes,
    quarters,
    year_totals: {
      sales_taxable: round2(totals.sales_taxable),
      output_vat: round2(totals.output_vat),
      purchases_taxable: round2(totals.purchases_taxable),
      input_vat: round2(totals.input_vat),
      result: round2(totals.output_vat - totals.input_vat),
      draft_invoices: totals.draft_invoices,
    },
    annual: {
      vat_model: ANNUAL_VAT_MODEL[regime],
      vat_deadline: regime === "foral" ? null : isoDate(year + 1, 1, 30),
      info_model: regime === "foral" ? null : "347",
      info_deadline: regime === "foral" ? null : isoDate(year + 1, 2, lastDayOfMonth(year + 1, 2)),
      info_threshold: MODEL_347_THRESHOLD,
      customers_347: reports347,
      intracom_model: regime === "foral" ? null : "349",
      intracom_deadline: regime === "foral" ? null : isoDate(year + 1, 1, 20),
      irpf_model: regime === "foral" ? null : "130",
      irpf_deadline: regime === "foral" ? null : isoDate(year + 1, 1, 30),
      // Cumulative for the year under estimación directa: 20% of profit.
      irpf_estimate: round2(
        Math.max(0, totals.sales_taxable - totals.purchases_taxable) * IRPF_RATE,
      ),
    },
  };
}
