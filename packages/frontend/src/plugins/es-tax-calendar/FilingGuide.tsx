// Beginner guide for one filing: what it is, where the AEAT expects it, who
// has to present it, and a button to download the ZIP with the figures and the
// invoices/expenses that back them. The guide text itself is Spanish (it is
// about the Spanish agency) and ships inside the ZIP.

import { Download, ExternalLink, HelpCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/i18n";
import { type Briefing, downloadBriefingZip, esTaxApi } from "./api";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

export default function FilingGuide({
  model,
  period,
  compact = false,
  withDownload = false,
  children,
}: {
  model: string;
  /** `2026-T3` for a quarter, `2026` for an annual return. */
  period: string;
  /** Icon-only button, for dense lists such as the calendar month cells. */
  compact?: boolean;
  /** Adds a direct ZIP download button next to the guide button. */
  withDownload?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function openGuide() {
    setOpen(true);
    setBriefing(null);
    setError(null);
    try {
      setBriefing(await esTaxApi.briefing(model, period));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function download() {
    setDownloading(true);
    try {
      await downloadBriefingZip(model, period);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void openGuide()}
          className="gap-1.5"
          title={t("es_tax.guide_title")}
          aria-label={`${t("es_tax.guide_button")} — modelo ${model}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          {compact ? null : (children ?? t("es_tax.guide_button"))}
        </Button>
        {withDownload && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void download()}
            disabled={downloading}
            className="gap-1.5"
            title={t("es_tax.guide_download")}
            aria-label={`${t("es_tax.guide_download")} — modelo ${model}`}
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {compact ? null : t("es_tax.guide_download")}
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] w-[75vw] max-w-[1400px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8 text-base">
              {briefing?.title ?? `Modelo ${model}`}
            </DialogTitle>
          </DialogHeader>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {!briefing && !error && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("es_tax.guide_loading")}
            </p>
          )}

          {briefing && (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">{briefing.guide.summary}</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Section title={t("es_tax.guide_where")}>
                  <p>{briefing.guide.agency}</p>
                  <a
                    href={briefing.guide.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-primary underline"
                  >
                    {briefing.guide.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Section>
                <Section title={t("es_tax.guide_who")}>
                  <p>{briefing.guide.who}</p>
                </Section>
              </div>

              <Section title={t("es_tax.guide_deadline")}>
                <p>{briefing.guide.deadline}</p>
              </Section>

              <Section title={t("es_tax.guide_auth")}>
                <ul className="list-disc space-y-0.5 pl-5">
                  {briefing.guide.auth.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </Section>

              <Section title={t("es_tax.guide_steps")}>
                <ol className="list-decimal space-y-1 pl-5">
                  {briefing.guide.steps.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </Section>

              <Section title={t("es_tax.guide_amount")}>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {briefing.lines.map((line) => (
                    <div key={line.label} className="contents">
                      <dt className="text-muted-foreground">{line.label}</dt>
                      <dd className="text-right font-medium tabular-nums">
                        {line.label === "Estado"
                          ? t(`es_tax.state_${briefing.filing.state}`)
                          : line.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Section>

              <Section title={t("es_tax.guide_caveats")}>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {briefing.guide.caveats.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </Section>

              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button onClick={() => void download()} disabled={downloading} className="gap-1.5">
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {t("es_tax.guide_download")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t("es_tax.guide_download_hint", {
                    model: briefing.model,
                    period:
                      briefing.period.quarter === null
                        ? `${briefing.period.year}-anual`
                        : `${briefing.period.year}-T${briefing.period.quarter}`,
                  })}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
