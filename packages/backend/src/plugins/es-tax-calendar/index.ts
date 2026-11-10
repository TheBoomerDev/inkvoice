// Spanish fiscal calendar plugin: reports the quarterly VAT periods, their AEAT
// filing deadlines, the annual VAT/informative deadlines and the IRPF
// instalment estimate, all computed from this install's own invoices and
// expenses. Mounted at /api/v1/plugins/es-tax-calendar.
//
// Read-only apart from the regime setting: nothing here writes to AEAT, files a
// declaration, or changes an invoice.

import { Hono } from "hono";
import { z } from "zod";
import { registerBackendPlugin } from "../registry";
import { buildBriefing, buildBriefingZip, GUIDES } from "./briefing";
import {
  buildReport,
  FORMS,
  getConfig,
  isForm,
  isRegime,
  REGIMES,
  setFiscalForm,
  setRegime,
} from "./service";

const routes = new Hono();

const ok = (data: unknown) => ({ success: true as const, data });

function isAdmin(c: { get: (k: string) => unknown }): boolean {
  return !!(c.get("user") as { is_admin?: boolean } | undefined)?.is_admin;
}

function parseYear(raw: string | undefined, today = new Date()): number | null {
  if (raw === undefined || raw === "") return today.getUTCFullYear();
  if (!/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  // Fiscal years before Inkvoice existed and far-future ones are mistakes, not
  // data; refuse them rather than returning an all-zero calendar.
  if (year < 2000 || year > 2100) return null;
  return year;
}

routes.get("/config", (c) =>
  c.json(ok({ ...getConfig(), regimes: REGIMES, forms: FORMS, models: Object.keys(GUIDES) })),
);

const configSchema = z
  .object({
    regime: z.enum(["comun", "canarias", "foral"]).optional(),
    fiscal_form: z.enum(["autonomo", "sociedad"]).optional(),
  })
  .refine((v) => v.regime !== undefined || v.fiscal_form !== undefined, {
    message: "Nothing to update",
  });

routes.put("/config", async (c) => {
  if (!isAdmin(c)) return c.json({ success: false, error: "Forbidden" }, 403);
  const parsed = configSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, error: "Invalid config" }, 400);
  if (parsed.data.regime !== undefined) {
    if (!isRegime(parsed.data.regime))
      return c.json({ success: false, error: "Invalid regime" }, 400);
    setRegime(parsed.data.regime);
  }
  if (parsed.data.fiscal_form !== undefined) {
    if (!isForm(parsed.data.fiscal_form))
      return c.json({ success: false, error: "Invalid fiscal form" }, 400);
    setFiscalForm(parsed.data.fiscal_form);
  }
  return c.json(ok(getConfig()));
});

routes.get("/report", (c) => {
  const year = parseYear(c.req.query("year"));
  if (year === null) return c.json({ success: false, error: "Invalid year" }, 400);
  return c.json(ok(buildReport(year)));
});

// Beginner briefing for one filing: the figures plus a guide to where and how
// the declaration is presented. `format=zip` downloads the bundle.
const briefingSchema = z.object({
  model: z.string().min(1).max(8),
  period: z.string().min(4).max(12),
});

routes.get("/briefing", (c) => {
  const parsed = briefingSchema.safeParse({
    model: c.req.query("model"),
    period: c.req.query("period"),
  });
  if (!parsed.success) return c.json({ success: false, error: "Invalid briefing request" }, 400);

  const briefing = buildBriefing(parsed.data.model, parsed.data.period);
  if (!briefing) {
    return c.json(
      {
        success: false,
        error: `No ${parsed.data.model} briefing for period ${parsed.data.period}`,
      },
      404,
    );
  }

  if (c.req.query("format") === "zip") {
    const zip = buildBriefingZip(briefing);
    const label = briefing.period.quarter ? `T${briefing.period.quarter}` : "anual";
    return new Response(zip.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="modelo-${briefing.model}-${briefing.period.year}-${label}.zip"`,
      },
    });
  }

  return c.json(ok(briefing));
});

registerBackendPlugin({
  id: "es-tax-calendar",
  version: "1.0.0",
  routes,
  // No tables of its own: the only state is the regime setting, kept in the
  // core settings KV store so a re-deploy never loses it.
  migrations: [],
  // Off by default: only relevant to businesses filing Spanish taxes. Enable it
  // under Settings → Plugins.
  defaultEnabled: false,
});
