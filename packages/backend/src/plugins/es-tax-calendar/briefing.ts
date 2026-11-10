import { getDb } from "../../database/connection";
import { buildZip } from "../../utils/zip";
import { buildReport, type Customer347Row, type FilingRow } from "./service";

/**
 * Beginner-facing briefing for one filing: what it is, where the AEAT expects
 * it, who has to present it and what this installation computes for the period.
 *
 * The text is Spanish on purpose — the agency, its portal and its forms are
 * Spanish — and it is what goes into the downloadable ZIP. The UI keeps its own
 * i18n labels around it.
 */

export interface ModelGuide {
  model: string;
  title: string;
  /** One-line description of what the form declares. */
  summary: string;
  agency: string;
  url: string;
  /** How to identify yourself on the portal. */
  auth: string[];
  who: string;
  deadline: string;
  steps: string[];
  caveats: string[];
}

const AEAT = "Agencia Tributaria (AEAT) — Sede Electrónica";
const SEDE = "https://sede.agenciatributaria.gob.es/";

export const GUIDES: Record<string, ModelGuide> = {
  "303": {
    model: "303",
    title: "Modelo 303 — IVA trimestral (régimen general)",
    summary:
      "Autodeclaración del IVA del trimestre: el IVA repercutido a tus clientes menos el IVA soportado de tus gastos.",
    agency: AEAT,
    url: SEDE,
    auth: [
      "Certificado electrónico o DNIe",
      "Cl@ve PIN (pide el PIN por SMS, válido para ese trámite)",
      "Cl@ve permanente (con el móvil, si ya lo tienes activado)",
    ],
    who: "Autónomos y empresas dados de alta en el censo con actividad en régimen general de IVA.",
    deadline:
      "Del 1 al 20 del mes siguiente al trimestre (20 abril, 20 julio y 20 octubre). El cuarto trimestre se presenta hasta el 30 de enero.",
    steps: [
      "Entra en la Sede Electrónica y elige «IVA» → «Modelo 303».",
      "Identifícate con certificado, DNIe o Cl@ve.",
      "Rellena los cuadros con los importes del resumen que tienes en el ZIP: base imponible, IVA repercutido, IVA soportado y resultado.",
      "Revisa la autoliquidación y firma la declaración.",
      "Si el resultado es a pagar, el propio formulario propone la domiciliación o el pago con tarjeta; guarda el justificante (PDF y número de referencia).",
    ],
    caveats: [
      "Si el resultado es negativo (a compensar), puedes arrastrarlo al trimestre siguiente; solo se pide la devolución en el cuarto trimestre o en una declaración complementaria.",
      "Las facturas en borrador no cuentan como operación devengada: regularízalas antes de presentar.",
      "El resumen del ZIP es orientativo y sale de tus propios libros; revísalo contra el libro registro de facturas emitidas y recibidas.",
    ],
  },
  "420": {
    model: "420",
    title: "Modelo 420 — IGIC trimestral (Canarias)",
    summary:
      "Autodeclaración del IGIC (Impuesto General Indirecto Canario) del trimestre: IGIC repercutido menos IGIC soportado.",
    agency: `${AEAT} — la AEAT gestiona el IGIC en nombre del Gobierno de Canarias`,
    url: SEDE,
    auth: ["Certificado electrónico o DNIe", "Cl@ve PIN", "Cl@ve permanente"],
    who: "Autónomos y empresas con actividad en Canarias sujetas al IGIC.",
    deadline:
      "Del 1 al 20 del mes siguiente al trimestre (20 abril, 20 julio y 20 octubre). El cuarto trimestre se presenta hasta el 30 de enero.",
    steps: [
      "Entra en la Sede Electrónica y busca «Modelo 420» (IGIC).",
      "Identifícate con certificado, DNIe o Cl@ve.",
      "Rellena el impuesto repercutido, el soportado y el resultado con los importes del resumen.",
      "Firma y guarda el justificante.",
    ],
    caveats: [
      "El IGIC tiene tipos propios (0 %, 3 %, 5 %, 9,5 %, 13,5 %, 20 % y 33 %) y no es el IVA: no mezcles las bases.",
      "Si tributas en Canarias pero también tienes operaciones en península, el IVA y el IGIC van en declaraciones separadas.",
    ],
  },
  "130": {
    model: "130",
    title: "Modelo 130 — Pagos a cuenta del IRPF (autónomos)",
    summary:
      "Pago a cuenta del IRPF por tu actividad: un porcentaje del rendimiento del trimestre, que luego se descuenta de la renta.",
    agency: AEAT,
    url: SEDE,
    auth: ["Certificado electrónico o DNIe", "Cl@ve PIN", "Cl@ve permanente"],
    who: "Autónomos en estimación directa (la modalidad más habitual) que no tributan por módulos.",
    deadline:
      "Del 1 al 20 del mes siguiente al trimestre (20 abril, 20 julio y 20 octubre) y del 1 al 20 de enero para el cuarto trimestre.",
    steps: [
      "Entra en la Sede Electrónica y elige «Modelo 130».",
      "Identifícate con certificado, DNIe o Cl@ve.",
      "Declara el rendimiento neto del trimestre (ingresos menos gastos) y aplica el tipo que corresponda.",
      "Descuenta las retenciones que te hayan practicado y los pagos a cuenta ya presentados.",
      "Firma y guarda el justificante.",
    ],
    caveats: [
      "El importe del ZIP es una estimación al 20 % del beneficio del trimestre; tu asesor puede ajustarlo.",
      "Si no tienes beneficios, la cuota puede ser 0 euros, pero la presentación sigue siendo obligatoria si estás dado de alta.",
      "El modelo 200 es el de las sociedades; si eres autónomo persona física no lo presentes.",
    ],
  },
  "200": {
    model: "200",
    title: "Modelo 200 — Impuesto sobre Sociedades",
    summary:
      "Declaración anual del Impuesto sobre Sociedades: el beneficio del ejercicio multiplicado por el tipo impositivo.",
    agency: AEAT,
    url: SEDE,
    auth: ["Certificado electrónico o DNIe", "Cl@ve PIN", "Cl@ve permanente"],
    who: "Sociedades mercantiles (SL, SA, SLL…) y entidades con personalidad jurídica.",
    deadline:
      "Los 25 días naturales siguientes a los 6 meses posteriores al cierre del ejercicio: para un ejercicio cerrado el 31 de diciembre, del 1 al 25 de julio.",
    steps: [
      "Entra en la Sede Electrónica y elige «Impuesto sobre Sociedades» → «Modelo 200».",
      "Identifícate con certificado, DNIe o Cl@ve.",
      "Cumplimenta el balance y la cuenta de pérdidas y ganancias y deja que el formulario calcule la base imponible.",
      "Aplica el tipo (15 % para emprendedores, 25 % general) y las deducciones que correspondan.",
      "Firma y guarda el justificante junto con las cuentas anuales.",
    ],
    caveats: [
      "El ZIP no calcula el impuesto: solo te da el beneficio estimado de tus facturas y gastos. El resultado contable y el fiscal se ajustan en la declaración.",
      "Las sociedades deben llevar libro registro de acciones y, si facturan más de 6 M€, cuentas anuales auditadas.",
    ],
  },
  "390": {
    model: "390",
    title: "Modelo 390 — Resumen anual de IVA",
    summary:
      "Resumen anual de las autodeclaraciones de IVA del año: es la declaración que cierra el ejercicio y contradice la suma de los cuatro 303.",
    agency: AEAT,
    url: SEDE,
    auth: ["Certificado electrónico o DNIe", "Cl@ve PIN", "Cl@ve permanente"],
    who: "Quienes presenten el modelo 303 trimestral: autónomos y empresas en régimen general.",
    deadline: "Del 1 al 30 de enero siguiente al ejercicio.",
    steps: [
      "Entra en la Sede Electrónica y elige «Modelo 390».",
      "Identifícate con certificado, DNIe o Cl@ve.",
      "Comprueba que el total anual coincide con la suma de los cuatro trimestres presentados.",
      "Firma y guarda el justificante.",
    ],
    caveats: [
      "Si detectas un error en un trimestre ya presentado, corrige con una declaración complementaria del 303 antes de presentar el 390.",
      "Presentar el 390 no exime de los 303 trimestrales.",
    ],
  },
  "425": {
    model: "425",
    title: "Modelo 425 — Resumen anual de IGIC",
    summary: "Resumen anual de las autodeclaraciones de IGIC del ejercicio.",
    agency: `${AEAT} — la AEAT gestiona el IGIC en nombre del Gobierno de Canarias`,
    url: SEDE,
    auth: ["Certificado electrónico o DNIe", "Cl@ve PIN", "Cl@ve permanente"],
    who: "Quienes presenten el modelo 420 trimestral.",
    deadline: "Del 1 al 30 de enero siguiente al ejercicio.",
    steps: [
      "Entra en la Sede Electrónica y busca «Modelo 425».",
      "Identifícate con certificado, DNIe o Cl@ve.",
      "Comprueba que el total anual coincide con la suma de los cuatro trimestres.",
      "Firma y guarda el justificante.",
    ],
    caveats: ["Igual que el 390, cierra el ejercicio y no sustituye a los 420 trimestrales."],
  },
  "347": {
    model: "347",
    title: "Modelo 347 — Operaciones con terceros",
    summary:
      "Declaración informativa anual de operaciones con clientes y proveedores que superan el umbral legal.",
    agency: AEAT,
    url: SEDE,
    auth: ["Certificado electrónico o DNIe", "Cl@ve PIN", "Cl@ve permanente"],
    who: "Empresas y autónomos cuya facturación con un mismo tercero supere 3.005,06 € al año (IVA excluido).",
    deadline: "Del 1 al 28 de febrero siguiente al ejercicio.",
    steps: [
      "Entra en la Sede Electrónica y elige «Modelo 347».",
      "Identifícate con certificado, DNIe o Cl@ve.",
      "Carga la lista de terceros del ZIP (clientes que superan el umbral) con su NIF y el importe anual.",
      "Comprueba los importes por trimestre y firma la declaración.",
    ],
    caveats: [
      "El umbral se aplica por tercero y por año natural, sin IVA. Si un cliente no llega, no entra en la declaración.",
      "Hay que declarar también las operaciones con la Administración y las de seguros, aunque no superen el umbral.",
      "El ZIP lista a los clientes que superan el umbral según tus facturas; revísalo antes de presentar.",
    ],
  },
  "349": {
    model: "349",
    title: "Modelo 349 — Operaciones intracomunitarias",
    summary:
      "Declaración informativa de entregas y adquisiciones de bienes y servicios con otros países de la Unión Europea.",
    agency: AEAT,
    url: SEDE,
    auth: ["Certificado electrónico o DNIe", "Cl@ve PIN", "Cl@ve permanente"],
    who: "Operadores intracomunitarios dados de alta (tengan o no operaciones).",
    deadline:
      "Del 1 al 30 de enero siguiente al ejercicio (las declaraciones mensuales tienen su propio calendario).",
    steps: [
      "Entra en la Sede Electrónica y elige «Modelo 349».",
      "Identifícate con certificado, DNIe o Cl@ve.",
      "Declara cada cliente o proveedor intracomunitario con su NIF-IVA y el importe de las operaciones.",
      "Firma y guarda el justificante.",
    ],
    caveats: [
      "Solo entran operaciones con NIF-IVA válido de otro Estado miembro; las ventas a particulares no.",
      "Comprueba que el NIF-IVA de cada cliente aparece en el censo VIES antes de declararlo.",
    ],
  },
};

export function getGuide(model: string): ModelGuide | null {
  return GUIDES[model] ?? null;
}

export interface BriefingPeriod {
  year: number;
  quarter: number | null;
  from: string;
  to: string;
}

/** Accepts `2026-T3`, `2026-Q3` and plain `2026` (annual models). */
export function parsePeriod(value: string): BriefingPeriod | null {
  const match = /^(\d{4})(?:-[TtQq]([1-4]))?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 2000 || year > 2100) return null;
  const quarter = match[2] ? Number(match[2]) : null;
  const from = quarter
    ? `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`
    : `${year}-01-01`;
  const to = quarter
    ? `${year}-${String(quarter * 3).padStart(2, "0")}-${String(
        new Date(Date.UTC(year, quarter * 3, 0)).getUTCDate(),
      ).padStart(2, "0")}`
    : `${year}-12-31`;
  return { year, quarter, from, to };
}

export interface BriefingInvoice {
  number: string;
  date: string;
  customer: string;
  tax_id: string | null;
  taxable: number;
  vat: number;
  total: number;
  status: string;
}

export interface BriefingExpense {
  date: string;
  vendor: string;
  category: string | null;
  taxable: number;
  vat: number;
  total: number;
  link: string | null;
}

export interface Briefing {
  model: string;
  title: string;
  period: BriefingPeriod;
  filing: FilingRow;
  /** Beginner guide: where it is presented, who presents it, how. */
  guide: {
    summary: string;
    agency: string;
    url: string;
    auth: string[];
    who: string;
    deadline: string;
    steps: string[];
    caveats: string[];
  };
  lines: { label: string; value: string }[];
  invoices: BriefingInvoice[];
  expenses: BriefingExpense[];
  customers_347: Customer347Row[];
}

interface InvoiceRow {
  number: string;
  issue_date: string;
  customer: string;
  tax_id: string | null;
  taxable: number;
  vat: number;
  total: number;
  status: string;
}

interface ExpenseRow {
  expense_date: string;
  vendor: string;
  category: string | null;
  taxable: number;
  vat: number;
  total: number;
  attachment_url: string | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Builds the briefing for one model and period. Returns null when the model has
 * no guide or the installation has no such obligation (e.g. the 420 outside
 * Canarias), so the route can answer 404 instead of inventing a document.
 */
export function buildBriefing(model: string, periodValue: string): Briefing | null {
  const guide = getGuide(model);
  if (!guide) return null;
  const period = parsePeriod(periodValue);
  if (!period) return null;

  const report = buildReport(period.year);
  const filing = report.filings.find(
    (f) => f.model === model && f.period_from === period.from && f.period_to === period.to,
  );
  if (!filing) return null;

  const db = getDb();
  const invoices = db
    .query(
      `SELECT i.invoice_number AS number, i.issue_date, c.name AS customer, c.tax_id AS tax_id,
              COALESCE((SELECT SUM(t.line_total * COALESCE(i.exchange_rate, 1))
                          FROM invoice_items t WHERE t.invoice_id = i.id), i.subtotal) AS taxable,
              COALESCE((SELECT SUM(t.tax_amount * COALESCE(i.exchange_rate, 1))
                          FROM invoice_items t WHERE t.invoice_id = i.id), i.tax_total) AS vat,
              i.total * COALESCE(i.exchange_rate, 1) AS total,
              i.status AS status
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.deleted_at IS NULL
          AND i.status IN ('sent','paid','partially_paid','overdue','complete')
          AND i.issue_date >= ? AND i.issue_date <= ?
        ORDER BY i.issue_date ASC`,
    )
    .all(period.from, period.to) as InvoiceRow[];

  const expenses = db
    .query(
      `SELECT expense_date, vendor, category, amount * COALESCE(exchange_rate, 1) AS taxable,
              tax_amount * COALESCE(exchange_rate, 1) AS vat,
              (amount + COALESCE(tax_amount, 0)) * COALESCE(exchange_rate, 1) AS total,
              attachment_url
         FROM expenses
        WHERE expense_date >= ? AND expense_date <= ?
        ORDER BY expense_date ASC`,
    )
    .all(period.from, period.to) as ExpenseRow[];

  const currency = report.currency;
  const money = (value: number) =>
    `${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

  const lines: { label: string; value: string }[] = [
    { label: "Modelo", value: guide.title },
    { label: "Periodo", value: `${period.from} → ${period.to}` },
    { label: "Fecha de presentación", value: filing.date },
    { label: "Estado", value: filing.state },
  ];
  if (model === "303" || model === "420" || model === "390" || model === "425") {
    lines.push(
      { label: "Base imponible facturada", value: money(report.year_totals.sales_taxable) },
      { label: "IVA repercutido", value: money(report.year_totals.output_vat) },
      { label: "IVA soportado", value: money(report.year_totals.input_vat) },
      { label: "Resultado", value: money(report.year_totals.result) },
    );
  }
  if (model === "130") {
    lines.push({ label: "Cuota estimada (20 % del beneficio)", value: money(filing.amount ?? 0) });
  }
  if (model === "347") {
    lines.push({
      label: "Clientes sobre el umbral",
      value: String(report.annual.customers_347.filter((c) => c.over_threshold).length),
    });
  }

  return {
    model,
    title: guide.title,
    period,
    filing,
    guide: {
      summary: guide.summary,
      agency: guide.agency,
      url: guide.url,
      auth: guide.auth,
      who: guide.who,
      deadline: guide.deadline,
      steps: guide.steps,
      caveats: guide.caveats,
    },
    lines,
    invoices: invoices.map((row) => ({
      number: row.number,
      date: row.issue_date,
      customer: row.customer ?? "—",
      tax_id: row.tax_id,
      taxable: round2(row.taxable),
      vat: round2(row.vat),
      total: round2(row.total),
      status: row.status,
    })),
    expenses: expenses.map((row) => ({
      date: row.expense_date,
      vendor: row.vendor,
      category: row.category,
      taxable: round2(row.taxable),
      vat: round2(row.vat),
      total: round2(row.total),
      link: row.attachment_url,
    })),
    customers_347: report.annual.customers_347,
  };
}

const csvEscape = (value: string | number | null | undefined): string => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const body = [header, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n");
  return `${body}\n`;
}

/** The ZIP a taxpayer takes to the agency: the guide, the numbers and the rows. */
export function buildBriefingZip(briefing: Briefing): Uint8Array {
  const guide = getGuide(briefing.model)!;
  const readme = [
    `# ${guide.title}`,
    "",
    briefing.period.from === `${briefing.period.year}-01-01` &&
    briefing.period.to === `${briefing.period.year}-12-31`
      ? `Ejercicio ${briefing.period.year}`
      : `Trimestre ${briefing.period.quarter} de ${briefing.period.year} (${briefing.period.from} → ${briefing.period.to})`,
    "",
    guide.summary,
    "",
    "## ¿Dónde se presenta?",
    "",
    guide.agency,
    "",
    guide.url,
    "",
    "## ¿Quién la presenta?",
    "",
    guide.who,
    "",
    "## Plazo",
    "",
    guide.deadline,
    "",
    "## Cómo identificarse",
    "",
    ...guide.auth.map((line) => `- ${line}`),
    "",
    "## Pasos",
    "",
    ...guide.steps.map((line, index) => `${index + 1}. ${line}`),
    "",
    "## Importe que sale de tus libros",
    "",
    ...briefing.lines.map((line) => `- ${line.label}: ${line.value}`),
    "",
    "## Avisos",
    "",
    ...guide.caveats.map((line) => `- ${line}`),
    "",
    "## Documentos del ZIP",
    "",
    "- `resumen.csv` — los importes de esta declaración.",
    "- `facturas.csv` — las facturas del periodo que sostienen los números.",
    "- `gastos.csv` — los gastos del periodo.",
    briefing.customers_347.length > 0
      ? "- `clientes_347.csv` — los terceros que entran en la declaración."
      : "",
    "",
    "## Aviso legal",
    "",
    "Estos importes salen de la contabilidad de esta instalación y son una ayuda para",
    "rellenar la declaración, no una declaración presentada. Revisa los datos contra el",
    "libro registro de facturas emitidas y recibidas y confirma el resultado con tu",
    "asesor o con la propia Sede Electrónica antes de firmar.",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const entries: { name: string; data: string }[] = [
    { name: "LEEME.md", data: readme },
    {
      name: "resumen.csv",
      data: toCsv(
        ["Concepto", "Importe"],
        briefing.lines.map((line) => [line.label, line.value]),
      ),
    },
    {
      name: "facturas.csv",
      data: toCsv(
        ["Factura", "Fecha", "Cliente", "NIF", "Base", "IVA", "Total", "Estado"],
        briefing.invoices.map((row) => [
          row.number,
          row.date,
          row.customer,
          row.tax_id,
          row.taxable,
          row.vat,
          row.total,
          row.status,
        ]),
      ),
    },
    {
      name: "gastos.csv",
      data: toCsv(
        ["Fecha", "Proveedor", "Categoría", "Base", "IVA", "Total", "Enlace"],
        briefing.expenses.map((row) => [
          row.date,
          row.vendor,
          row.category,
          row.taxable,
          row.vat,
          row.total,
          row.link,
        ]),
      ),
    },
  ];

  if (briefing.model === "347") {
    entries.push({
      name: "clientes_347.csv",
      data: toCsv(
        ["Cliente", "NIF", "Total anual", "Sobre el umbral"],
        briefing.customers_347.map((row) => [
          row.name,
          row.tax_id,
          row.total,
          row.over_threshold ? "sí" : "no",
        ]),
      ),
    });
  }

  return buildZip(entries);
}
