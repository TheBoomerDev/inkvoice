// Month-by-month view of the year's filing deadlines. The backend already
// derives every date (quarterly 303/420, 130 instalments, annual 390/425, 347,
// 349 and the sociedad's 200), so this component only lays them out: one card
// per month, plus January of the next year, because the fourth-quarter and
// annual deadlines land there.

import { CalendarDays } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import type { EsTaxReport, FilingRow } from "./api";

const KIND_COLOR: Record<FilingRow["kind"], string> = {
  iva: "bg-blue-500",
  irpf: "bg-violet-500",
  is: "bg-orange-500",
  info: "bg-slate-400",
  intracom: "bg-teal-500",
};

const STATE_TEXT: Record<FilingRow["state"], string> = {
  open: "text-muted-foreground",
  due: "text-foreground",
  overdue: "text-destructive",
  no_activity: "text-muted-foreground",
  closed: "text-muted-foreground",
};

function monthName(year: number, month: number, locale: string): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale, {
    month: "long",
    timeZone: "UTC",
  });
}

export default function FiscalYearCalendar({
  report,
  money,
}: {
  report: EsTaxReport;
  money: (value: number) => string;
}) {
  const { t, language } = useTranslation();

  // Deadlines of the year itself, then the following January: the fourth
  // quarter and the annual returns are filed there.
  const months = Array.from({ length: 12 }, (_, i) => report.year * 100 + i);
  months.push((report.year + 1) * 100); // January of the next year

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium">{t("es_tax.calendar_legend")}</span>
        {(["iva", "irpf", "is", "info", "intracom"] as const).map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", KIND_COLOR[kind])} />
            {t(`es_tax.kind_${kind}`)}
          </span>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {months.map((key) => {
          const year = Math.floor(key / 100);
          const month = key % 100;
          const events = report.filings.filter((f) => {
            const m = Number(f.date.slice(5, 7));
            const y = Number(f.date.slice(0, 4));
            return y === year && m === month + 1;
          });
          const isNextJanuary = key === (report.year + 1) * 100;

          return (
            <div
              key={key}
              className={cn("rounded-lg border p-3", isNextJanuary && "border-dashed bg-muted/30")}
            >
              <p className="mb-2 flex items-center gap-2 text-sm font-medium capitalize">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                {monthName(year, month, language)}
                {isNextJanuary && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {t("es_tax.next_year_january", { year })}
                  </span>
                )}
              </p>

              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-2">
                  {events.map((f) => (
                    <li key={`${f.date}-${f.model}`} className="flex items-start gap-2 text-xs">
                      <span
                        className={cn(
                          "w-6 shrink-0 rounded px-1 text-center font-semibold tabular-nums",
                          f.state === "overdue"
                            ? "bg-destructive/10 text-destructive"
                            : f.state === "no_activity"
                              ? "bg-muted text-muted-foreground"
                              : "bg-primary/10 text-primary",
                        )}
                      >
                        {Number(f.date.slice(8, 10))}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-x-1.5">
                          <span className="font-medium">Modelo {f.model}</span>
                          <span
                            className={cn(
                              "inline-block h-1.5 w-1.5 rounded-full",
                              KIND_COLOR[f.kind],
                            )}
                          />
                          {f.amount !== null && (
                            <span className="font-semibold tabular-nums">{money(f.amount)}</span>
                          )}
                        </span>
                        <span className={cn("block", STATE_TEXT[f.state])}>
                          {t(`es_tax.state_${f.state}`)}
                          {f.note ? ` · ${t(`es_tax.note_${f.note}`)}` : ""}
                          {f.period_from && f.period_to
                            ? ` · ${f.period_from} → ${f.period_to}`
                            : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
