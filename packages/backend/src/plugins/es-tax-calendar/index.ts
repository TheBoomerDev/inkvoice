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
import { buildReport, getConfig, isRegime, REGIMES, setRegime } from "./service";

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

routes.get("/config", (c) => c.json(ok({ ...getConfig(), regimes: REGIMES })));

const configSchema = z.object({ regime: z.enum(["comun", "canarias", "foral"]) });

routes.put("/config", async (c) => {
  if (!isAdmin(c)) return c.json({ success: false, error: "Forbidden" }, 403);
  const parsed = configSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, error: "Invalid regime" }, 400);
  if (!isRegime(parsed.data.regime))
    return c.json({ success: false, error: "Invalid regime" }, 400);
  return c.json(ok(setRegime(parsed.data.regime)));
});

routes.get("/report", (c) => {
  const year = parseYear(c.req.query("year"));
  if (year === null) return c.json({ success: false, error: "Invalid year" }, 400);
  return c.json(ok(buildReport(year)));
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
