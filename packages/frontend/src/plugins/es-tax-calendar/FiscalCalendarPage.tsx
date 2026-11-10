// Spanish fiscal calendar page: the four VAT periods of a year with their AEAT
// deadlines and figures, the annual returns, and the modelo 347 customer list.
// Read-only: it never files anything, it shows what this install's own invoices
// and expenses add up to. Wrapped in PluginGuard by the route registration, so
// it only renders while the plugin is enabled.

import { CalendarClock, Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/i18n";
import { formatCurrency } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth.store";
import { type EsTaxRegime, type EsTaxReport, esTaxApi, type QuarterRow } from "./api";

const STATE_VARIANT: Record<
  QuarterRow["state"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  open: "outline",
  due: "default",
  overdue: "destructive",
  closed: "secondary",
  no_activity: "outline",
};

function formatDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(fileName: string, rows: (string | number | null)[][]): void {
  const body = rows.map((row) => row.map(csvCell).join(";")).join("\n");
  // BOM so Excel opens the file as UTF-8 instead of mangling the accents.
  const blob = new Blob([`\uFEFF${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FiscalCalendarPage() {
  const { t, language } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = !!user?.is_admin;

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [report, setReport] = useState<EsTaxReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingRegime, setSavingRegime] = useState(false);

  const years = useMemo(
    () => [thisYear + 1, thisYear, thisYear - 1, thisYear - 2, thisYear - 3],
    [thisYear],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await esTaxApi.report(year));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = report?.currency ?? "EUR";
  const money = useCallback((value: number) => formatCurrency(value, currency), [currency]);

  async function changeRegime(regime: EsTaxRegime) {
    setSavingRegime(true);
    try {
      await esTaxApi.setRegime(regime);
      await load();
      toast.success(t("es_tax.title"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingRegime(false);
    }
  }

  function exportCsv() {
    if (!report) return;
    const rows: (string | number | null)[][] = [
      [
        t("es_tax.year"),
        t("es_tax.quarter"),
        t("es_tax.period"),
        t("es_tax.deadline"),
        t("es_tax.vat_summary", { model: "" }).trim(),
        t("es_tax.sales_taxable"),
        t("es_tax.output_vat"),
        t("es_tax.purchases_taxable"),
        t("es_tax.input_vat"),
        t("es_tax.result"),
      ],
    ];
    for (const q of report.quarters) {
      rows.push([
        report.year,
        q.quarter,
        `${q.from} → ${q.to}`,
        q.deadline ?? "",
        q.model ?? "",
        q.sales_taxable,
        q.output_vat,
        q.purchases_taxable,
        q.input_vat,
        q.result,
      ]);
    }
    rows.push([]);
    rows.push([
      t("es_tax.customer"),
      t("es_tax.tax_id"),
      t("es_tax.total"),
      t("es_tax.over_threshold"),
    ]);
    for (const c of report.annual.customers_347) {
      rows.push([c.name, c.tax_id ?? "", c.total, c.over_threshold ? "SI" : "NO"]);
    }
    downloadCsv(`calendario-fiscal-${report.year}.csv`, rows);
  }

  function resultLabel(value: number): string {
    if (Math.abs(value) < 0.01) return t("es_tax.settled");
    return value > 0 ? t("es_tax.to_pay") : t("es_tax.to_offset");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("es_tax.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("es_tax.subtitle", { year })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[110px]">
              {/* Explicit children: Radix shows the raw value until the item
                  list mounts, which reads as "comun" in the trigger. */}
              <SelectValue>{year}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={report?.regime ?? "comun"}
            onValueChange={(v) => void changeRegime(v as EsTaxRegime)}
            disabled={!isAdmin || savingRegime || loading}
          >
            <SelectTrigger className="w-[230px]">
              <SelectValue>{t(`es_tax.regime_${report?.regime ?? "comun"}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="comun">{t("es_tax.regime_comun")}</SelectItem>
              <SelectItem value="canarias">{t("es_tax.regime_canarias")}</SelectItem>
              <SelectItem value="foral">{t("es_tax.regime_foral")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!report || loading}>
            <Download className="mr-2 h-4 w-4" />
            {t("es_tax.export_csv")}
          </Button>
        </div>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            {t("es_tax.error_load", { reason: error })}
          </CardContent>
        </Card>
      ) : loading || !report ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            {t("es_tax.loading")}
          </CardContent>
        </Card>
      ) : (
        <>
          {report.notes.map((note) => (
            <div
              key={note}
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
            >
              {t(`es_tax.note_${note}`)}
            </div>
          ))}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("es_tax.output_vat")}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {money(report.year_totals.output_vat)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("es_tax.input_vat")}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {money(report.year_totals.input_vat)}
              </CardContent>
            </Card>
            <Card className="sm:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("es_tax.totals_result")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-baseline gap-3">
                <span className="text-2xl font-semibold tabular-nums">
                  {money(Math.abs(report.year_totals.result))}
                </span>
                <span className="text-sm text-muted-foreground">
                  {resultLabel(report.year_totals.result)}
                </span>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {report.quarters.map((q) => (
              <Card key={q.quarter}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                  <div>
                    <CardTitle className="text-base">
                      {t("es_tax.quarter", { n: q.quarter })}
                      {q.model ? ` · ${t("es_tax.vat_summary", { model: q.model })}` : ""}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(q.from, language)} — {formatDate(q.to, language)}
                    </p>
                  </div>
                  <Badge variant={STATE_VARIANT[q.state]}>{t(`es_tax.state_${q.state}`)}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">{t("es_tax.sales_taxable")}</dt>
                    <dd className="text-right tabular-nums">{money(q.sales_taxable)}</dd>
                    <dt className="text-muted-foreground">{t("es_tax.output_vat")}</dt>
                    <dd className="text-right tabular-nums">{money(q.output_vat)}</dd>
                    <dt className="text-muted-foreground">{t("es_tax.input_vat")}</dt>
                    <dd className="text-right tabular-nums">{money(q.input_vat)}</dd>
                    <dt className="font-medium">{t("es_tax.result")}</dt>
                    <dd className="text-right font-semibold tabular-nums">
                      {money(q.result)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {resultLabel(q.result)}
                      </span>
                    </dd>
                  </dl>

                  <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                    {q.state === "no_activity" ? (
                      <span>{t("es_tax.no_activity")}</span>
                    ) : q.deadline ? (
                      <span>
                        {t("es_tax.deadline")}: {formatDate(q.deadline, language)} ·{" "}
                        {q.days_left !== null && q.days_left >= 0
                          ? t("es_tax.days_left", { count: q.days_left })
                          : t("es_tax.overdue_by", { count: Math.abs(q.days_left ?? 0) })}
                      </span>
                    ) : (
                      <span>{t("es_tax.no_deadline")}</span>
                    )}
                  </div>

                  {q.draft_invoices > 0 && (
                    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                      {t("es_tax.drafts_warning", { count: q.draft_invoices })}
                    </p>
                  )}

                  {q.rates.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {t("es_tax.rates_title")}
                      </p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="h-7 py-1 text-xs">{t("es_tax.rate")}</TableHead>
                            <TableHead className="h-7 py-1 text-right text-xs">
                              {t("es_tax.taxable")}
                            </TableHead>
                            <TableHead className="h-7 py-1 text-right text-xs">
                              {t("es_tax.tax")}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {q.rates.map((r) => (
                            <TableRow key={r.rate}>
                              <TableCell className="py-1 text-xs">{r.rate}%</TableCell>
                              <TableCell className="py-1 text-right text-xs tabular-nums">
                                {money(r.taxable)}
                              </TableCell>
                              <TableCell className="py-1 text-right text-xs tabular-nums">
                                {money(r.tax)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {t("es_tax.invoices", { count: q.invoices })}
                    {q.credit_notes > 0
                      ? ` · ${t("es_tax.credit_notes", { count: q.credit_notes })}`
                      : ""}
                    {q.expenses > 0 ? ` · ${t("es_tax.expenses", { count: q.expenses })}` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">
              {t("es_tax.annual_title")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {report.annual.vat_model
                      ? t("es_tax.vat_summary", { model: report.annual.vat_model })
                      : t("es_tax.vat_summary", { model: "—" })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground">
                  <p>{t("es_tax.vat_summary_desc")}</p>
                  {report.annual.vat_deadline && (
                    <p className="font-medium text-foreground">
                      {t("es_tax.deadline")}: {formatDate(report.annual.vat_deadline, language)}
                    </p>
                  )}
                  <p className="tabular-nums">
                    {money(report.year_totals.output_vat)} − {money(report.year_totals.input_vat)} ={" "}
                    {money(report.year_totals.result)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {report.annual.info_model
                      ? t("es_tax.info_return", { model: report.annual.info_model })
                      : t("es_tax.info_return", { model: "—" })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    {t("es_tax.info_return_desc", {
                      threshold: money(report.annual.info_threshold),
                    })}
                  </p>
                  {report.annual.info_deadline && (
                    <p className="font-medium text-foreground">
                      {t("es_tax.deadline")}: {formatDate(report.annual.info_deadline, language)}
                    </p>
                  )}
                  <p>
                    {report.annual.customers_347.filter((c) => c.over_threshold).length} /{" "}
                    {report.annual.customers_347.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {report.annual.intracom_model
                      ? t("es_tax.intracom", { model: report.annual.intracom_model })
                      : t("es_tax.intracom", { model: "—" })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground">
                  <p>{t("es_tax.intracom_desc")}</p>
                  {report.annual.intracom_deadline && (
                    <p className="font-medium text-foreground">
                      {t("es_tax.deadline")}:{" "}
                      {formatDate(report.annual.intracom_deadline, language)}
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {report.annual.irpf_model
                      ? t("es_tax.irpf", { model: report.annual.irpf_model })
                      : t("es_tax.irpf", { model: "—" })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground">
                  <p>{t("es_tax.irpf_desc")}</p>
                  {report.annual.irpf_deadline && (
                    <p className="font-medium text-foreground">
                      {t("es_tax.deadline")}: {formatDate(report.annual.irpf_deadline, language)}
                    </p>
                  )}
                  <p className="text-sm font-medium text-foreground tabular-nums">
                    {t("es_tax.irpf_estimate")}: {money(report.annual.irpf_estimate)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("es_tax.customers_title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {report.annual.customers_347.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("es_tax.no_customers")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("es_tax.customer")}</TableHead>
                      <TableHead>{t("es_tax.tax_id")}</TableHead>
                      <TableHead className="text-right">{t("es_tax.total")}</TableHead>
                      <TableHead className="w-[120px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.annual.customers_347.map((c) => (
                      <TableRow key={c.customer_id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground">{c.tax_id ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(c.total)}</TableCell>
                        <TableCell>
                          {c.over_threshold && (
                            <Badge variant="secondary">{t("es_tax.over_threshold")}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">{t("es_tax.disclaimer")}</p>
        </>
      )}
    </div>
  );
}
