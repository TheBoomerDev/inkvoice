// Spanish fiscal calendar plugin: aggregation maths against a real SQLite
// database, deadline states with an injected clock, and the plugin gate over
// the real HTTP app.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import type { Hono } from "hono";
import { createApp } from "../app";
import { closeDatabase, getDb, initDatabase } from "../database/connection";
import { runMigrations } from "../database/migrations";
import { seed } from "../database/seed";
import "../plugins"; // registers es-tax-calendar
import {
  buildReport,
  getConfig,
  MODEL_347_THRESHOLD,
  quarterBounds,
  setFiscalForm,
  setRegime,
} from "../plugins/es-tax-calendar/service";
import { runPluginMigrations } from "../plugins/runner";
import { createCustomer } from "../services/customer.service";
import { createExpense } from "../services/expense.service";
import { createInvoice, markSent } from "../services/invoice.service";
import { updateSettings } from "../services/settings.service";
import { createTaxDefinition } from "../services/tax.service";
import { resetEnvCache } from "../utils/env";

const TEST_DB = "./data/test-es-tax-calendar.db";
const YEAR = 2026;
const TODAY = new Date("2026-05-15T10:00:00Z");

let app: Hono;
let token: string;

async function authed(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...((opts.headers as Record<string, string>) || {}),
    Authorization: `Bearer ${token}`,
  };
  if (opts.method && opts.method !== "GET") headers["Content-Type"] = "application/json";
  return app.request(new Request(`http://localhost${path}`, { ...opts, headers }));
}

beforeAll(async () => {
  process.env.DATABASE_PATH = TEST_DB;
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASS = "estaxpass123";
  process.env.JWT_SECRET = "test-secret-key-that-is-at-least-32-chars-long";
  process.env.RATE_LIMIT_ENABLED = "false";
  resetEnvCache();

  initDatabase();
  runMigrations();
  runPluginMigrations();
  await seed();
  // A fork ships its own plugins, which the public inkvoice.app catalog cannot
  // know about. Point this install at the bundled snapshot so plugin metadata
  // (name, description) comes from the fork instead of falling back to the raw
  // id — the same setting the production deployment of this fork uses.
  updateSettings({ plugin_catalog_url: "" });
  app = createApp();

  const res = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "estaxpass123" }),
  });
  token = ((await res.json()) as any).data.token;
});

afterAll(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(TEST_DB + suffix);
    } catch {}
  }
});

describe("es-tax-calendar: quarterly aggregation", () => {
  // Customers are created inside a test, not in the describe body: bun:test
  // collects describes before beforeAll runs, so the database does not exist
  // yet at module scope.
  let small: { id: string };
  let big: { id: string };
  // createExpense derives the VAT from the tax definition (it ignores a passed
  // tax_rate), so the fixture needs a real 21% definition to reference.
  let vat21: { id: string };

  test("seed fixtures through the real services", () => {
    vat21 = createTaxDefinition({ name: "IVA 21%", rate: 21, category_code: "S" });
    small = createCustomer({
      name: "Cliente Pequeño SL",
      tax_id: "B12345678",
      country: "ES",
    });
    big = createCustomer({
      name: "Cliente Grande SA",
      tax_id: "A87654321",
      country: "ES",
    });
    const q1 = createInvoice({
      customer_id: small.id,
      issue_date: "2026-02-10",
      currency: "EUR",
      items: [{ description: "Servicio Q1", quantity: 1, unit_price: 1000, tax_rate: 21 }],
    });
    expect(q1.tax_total).toBeCloseTo(210, 2);
    markSent(q1.id);

    // Credit note: negative line, so it must subtract from the period.
    const cn = createInvoice({
      customer_id: small.id,
      issue_date: "2026-03-05",
      currency: "EUR",
      type: "credit_note",
      reference_invoice_id: q1.id,
      items: [{ description: "Abono", quantity: 1, unit_price: -100, tax_rate: 21 }],
    });
    expect(cn.tax_total).toBeCloseTo(-21, 2);
    markSent(cn.id);

    const q2 = createInvoice({
      customer_id: big.id,
      issue_date: "2026-04-10",
      currency: "EUR",
      items: [{ description: "Servicio Q2", quantity: 1, unit_price: 4000, tax_rate: 21 }],
    });
    markSent(q2.id);

    // A draft is not an accrued operation: excluded from the figures, counted
    // as an open "cierre".
    createInvoice({
      customer_id: big.id,
      issue_date: "2026-06-01",
      currency: "EUR",
      items: [{ description: "Borrador", quantity: 1, unit_price: 500, tax_rate: 21 }],
    });

    const expense = createExpense({
      vendor: "Proveedor",
      expense_date: "2026-02-20",
      amount: 500,
      tax_id: vat21.id,
      currency: "EUR",
    });
    expect(expense.tax_amount).toBeCloseTo(105, 2);
  });

  test("quarters add up issued invoices, credit notes and expenses", () => {
    const report = buildReport(YEAR, TODAY);
    const [q1, q2, q3, q4] = report.quarters;

    expect(q1.sales_taxable).toBeCloseTo(900, 2);
    expect(q1.output_vat).toBeCloseTo(189, 2);
    expect(q1.input_vat).toBeCloseTo(105, 2);
    expect(q1.result).toBeCloseTo(84, 2);
    expect(q1.invoices).toBe(1);
    expect(q1.credit_notes).toBe(1);
    expect(q1.expenses).toBe(1);
    expect(q1.draft_invoices).toBe(0);

    expect(q2.sales_taxable).toBeCloseTo(4000, 2);
    expect(q2.output_vat).toBeCloseTo(840, 2);
    expect(q2.input_vat).toBe(0);
    expect(q2.draft_invoices).toBe(1);

    expect(q3.output_vat).toBe(0);
    expect(q4.output_vat).toBe(0);

    expect(report.year_totals.output_vat).toBeCloseTo(1029, 2);
    expect(report.year_totals.input_vat).toBeCloseTo(105, 2);
    expect(report.year_totals.result).toBeCloseTo(924, 2);
    expect(report.year_totals.draft_invoices).toBe(1);
  });

  test("per-rate breakdown splits by VAT rate", () => {
    const q1 = buildReport(YEAR, TODAY).quarters[0];
    expect(q1.rates).toHaveLength(1);
    expect(q1.rates[0].rate).toBe(21);
    expect(q1.rates[0].tax).toBeCloseTo(189, 2);
    expect(q1.rates[0].taxable).toBeCloseTo(900, 2);
  });

  test("modelo 347 flags counterparties above the threshold", () => {
    const rows = buildReport(YEAR, TODAY).annual.customers_347;
    const bigRow = rows.find((r) => r.customer_id === big.id);
    const smallRow = rows.find((r) => r.customer_id === small.id);
    expect(bigRow?.total).toBeCloseTo(4840, 2);
    expect(bigRow?.over_threshold).toBe(true);
    expect(bigRow?.tax_id).toBe("A87654321");
    expect(smallRow?.over_threshold).toBe(false);
    expect(MODEL_347_THRESHOLD).toBe(3005.06);
  });

  test("IRPF instalment estimate is 20% of the year's profit", () => {
    const report = buildReport(YEAR, TODAY);
    // (4900 sales - 500 purchases) * 0.2
    expect(report.annual.irpf_estimate).toBeCloseTo(880, 2);
    expect(report.annual.irpf_model).toBe("130");
  });
});

describe("es-tax-calendar: deadlines and territories", () => {
  test("quarter bounds and AEAT deadlines for the régimen común", () => {
    expect(quarterBounds(2026, 1, "comun")).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
      deadline: "2026-04-20",
    });
    expect(quarterBounds(2026, 2, "comun").deadline).toBe("2026-07-20");
    expect(quarterBounds(2026, 3, "comun").deadline).toBe("2026-10-20");
    expect(quarterBounds(2026, 4, "comun")).toEqual({
      from: "2026-10-01",
      to: "2026-12-31",
      deadline: "2027-01-30",
    });
  });

  test("period states follow the injected clock", () => {
    const [q1, q2, q3] = buildReport(YEAR, TODAY).quarters;
    expect(q1.state).toBe("overdue");
    expect(q1.days_left).toBe(-25);
    expect(q2.state).toBe("open");
    // Q3 only holds a draft, which is not an accrued operation.
    expect(q3.state).toBe("no_activity");

    // The day the return is due is still on time, not late.
    const onDeadline = buildReport(YEAR, new Date("2026-04-20T08:00:00Z")).quarters[0];
    expect(onDeadline.state).toBe("due");
    expect(onDeadline.days_left).toBe(0);
    expect(onDeadline.days_left).not.toBeLessThan(0);
  });

  test("a period with no recorded activity is not reported as overdue", () => {
    // 2025 has no invoices or expenses in the fixtures, and every deadline is
    // long past: the period is empty, not a missed filing.
    const empty = buildReport(2025, TODAY);
    expect(empty.quarters.every((q) => q.state === "no_activity")).toBe(true);
    expect(empty.quarters.every((q) => q.invoices === 0 && q.expenses === 0)).toBe(true);
    // A period with data still reports the passed deadline.
    expect(buildReport(YEAR, TODAY).quarters[0].state).toBe("overdue");
  });

  test("annual deadlines fall in the following January/February", () => {
    const { annual } = buildReport(YEAR, TODAY);
    expect(annual.vat_model).toBe("390");
    expect(annual.vat_deadline).toBe("2027-01-30");
    expect(annual.info_model).toBe("347");
    expect(annual.info_deadline).toBe("2027-02-28");
    expect(annual.intracom_model).toBe("349");
  });

  test("Canarias uses the IGIC models", () => {
    const previous = getConfig().regime;
    try {
      setRegime("canarias");
      const report = buildReport(YEAR, TODAY);
      expect(report.quarters.every((q) => q.model === "420")).toBe(true);
      expect(report.annual.vat_model).toBe("425");
      expect(report.notes).toContain("igic_instead_of_iva");
    } finally {
      setRegime(previous);
    }
  });

  test("foral territory reports amounts without inventing deadlines", () => {
    const previous = getConfig().regime;
    try {
      setRegime("foral");
      const report = buildReport(YEAR, TODAY);
      expect(report.quarters.every((q) => q.deadline === null)).toBe(true);
      expect(report.quarters.every((q) => q.model === null)).toBe(true);
      expect(report.annual.vat_model).toBeNull();
      expect(report.annual.info_deadline).toBeNull();
      expect(report.notes).toContain("foral_calendar");
      // The figures are still the business's own bookkeeping.
      expect(report.year_totals.output_vat).toBeCloseTo(1029, 2);
    } finally {
      setRegime(previous);
    }
  });
});

describe("es-tax-calendar: HTTP surface", () => {
  test("the plugin answers 404 until an admin enables it", async () => {
    // Registered with defaultEnabled: false, so the gate hides it on a fresh install.
    const denied = await authed(`/api/v1/plugins/es-tax-calendar/report?year=${YEAR}`);
    expect(denied.status).toBe(404);

    const toggle = await authed("/api/v1/plugins/es-tax-calendar", {
      method: "PUT",
      body: JSON.stringify({ enabled: true }),
    });
    expect(toggle.status).toBe(200);
    expect(((await toggle.json()) as any).data.enabled).toContain("es-tax-calendar");
  });

  test("requires authentication", async () => {
    const res = await app.request(`/api/v1/plugins/es-tax-calendar/report?year=${YEAR}`);
    expect([401, 403]).toContain(res.status);
  });

  test("GET /report returns the year's calendar", async () => {
    const res = await authed(`/api/v1/plugins/es-tax-calendar/report?year=${YEAR}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.year).toBe(YEAR);
    expect(body.data.quarters).toHaveLength(4);
    expect(body.data.regime).toBe("comun");
  });

  test("rejects a year that cannot be a fiscal year", async () => {
    for (const bad of ["abc", "1999", "2101"]) {
      const res = await authed(`/api/v1/plugins/es-tax-calendar/report?year=${bad}`);
      expect(res.status).toBe(400);
    }
  });

  test("PUT /config persists the territory and is validated", async () => {
    const put = await authed("/api/v1/plugins/es-tax-calendar/config", {
      method: "PUT",
      body: JSON.stringify({ regime: "canarias" }),
    });
    expect(put.status).toBe(200);
    expect(((await put.json()) as any).data.regime).toBe("canarias");

    const stored = getDb()
      .query("SELECT value FROM settings WHERE key = 'es_tax_regime'")
      .get() as { value: string };
    expect(stored.value).toBe("canarias");

    const bad = await authed("/api/v1/plugins/es-tax-calendar/config", {
      method: "PUT",
      body: JSON.stringify({ regime: "madrid" }),
    });
    expect(bad.status).toBe(400);

    await authed("/api/v1/plugins/es-tax-calendar/config", {
      method: "PUT",
      body: JSON.stringify({ regime: "comun" }),
    });
  });

  describe("es-tax-calendar: dated filings", () => {
    test("every quarter produces a 303 filing, and an autónomo also a 130", () => {
      const report = buildReport(YEAR, TODAY);
      const vat = report.filings.filter((f) => f.model === "303").map((f) => f.date);
      expect(vat).toEqual(["2026-04-20", "2026-07-20", "2026-10-20", "2027-01-30"]);

      const irpf = report.filings.filter((f) => f.model === "130").map((f) => f.date);
      expect(irpf).toEqual(["2026-04-20", "2026-07-20", "2026-10-20", "2027-01-20"]);

      // The list is sorted by deadline, which is what the calendar renders.
      const dates = report.filings.map((f) => f.date);
      expect([...dates].sort()).toEqual(dates);
      expect(report.filings.every((f) => f.amount !== null || f.note === null)).toBe(true);
    });

    test("the annual returns and the sociedad's 200 appear once", () => {
      const report = buildReport(YEAR, TODAY);
      const annual = report.filings.filter(
        (f) => f.period_from === `${YEAR}-01-01` && f.period_to === `${YEAR}-12-31`,
      );
      expect(annual.map((f) => f.model).sort()).toEqual(["347", "349", "390"]);
      // Only the customer above the threshold counts: 4000 + 21% VAT.
      expect(report.filings.find((f) => f.model === "347")?.amount).toBeCloseTo(4840, 2);
    });

    test("a sociedad files 200 instead of 130", () => {
      setFiscalForm("sociedad");
      try {
        const report = buildReport(YEAR, TODAY);
        expect(report.filings.some((f) => f.model === "200")).toBe(true);
        expect(report.filings.some((f) => f.model === "130")).toBe(false);
        expect(report.filings.find((f) => f.model === "200")?.date).toBe("2027-07-25");
        expect(report.annual.is_model).toBe("200");
        expect(report.annual.irpf_model).toBeNull();
      } finally {
        setFiscalForm("autonomo");
      }
    });

    test("PUT /config accepts the legal form and rejects anything else", async () => {
      const ok = await authed("/api/v1/plugins/es-tax-calendar/config", {
        method: "PUT",
        body: JSON.stringify({ fiscal_form: "sociedad" }),
      });
      expect(ok.status).toBe(200);
      expect(((await ok.json()) as any).data.fiscal_form).toBe("sociedad");

      const bad = await authed("/api/v1/plugins/es-tax-calendar/config", {
        method: "PUT",
        body: JSON.stringify({ fiscal_form: "sl" }),
      });
      expect(bad.status).toBe(400);

      await authed("/api/v1/plugins/es-tax-calendar/config", {
        method: "PUT",
        body: JSON.stringify({ fiscal_form: "autonomo" }),
      });
    });
  });

  test("appears in the plugin catalog as installed and enabled", async () => {
    const res = await authed("/api/v1/plugins/catalog");
    expect(res.status).toBe(200);
    const plugins = ((await res.json()) as any).data.plugins as any[];
    const entry = plugins.find((p) => p.id === "es-tax-calendar");
    expect(entry).toBeDefined();
    expect(entry.installed).toBe(true);
    expect(entry.enabled).toBe(true);
    expect(entry.blockedReason).toBeNull();
    expect(entry.name).toBe("Spanish Fiscal Calendar");
  });
});
