// Typed client for the Spanish fiscal calendar plugin
// (/api/v1/plugins/es-tax-calendar).

import { pluginFetch } from "../api";

const BASE = "/plugins/es-tax-calendar";

export type EsTaxRegime = "comun" | "canarias" | "foral";
export type EsTaxForm = "autonomo" | "sociedad";

export interface EsTaxConfig {
  regime: EsTaxRegime;
  fiscal_form: EsTaxForm | null;
  company_country: string | null;
  currency: string;
  regimes: EsTaxRegime[];
  forms: EsTaxForm[];
}

export interface TaxRateRow {
  rate: number;
  taxable: number;
  tax: number;
}

export type QuarterState = "open" | "due" | "overdue" | "closed" | "no_activity";

export interface QuarterRow {
  quarter: number;
  from: string;
  to: string;
  model: string | null;
  deadline: string | null;
  days_left: number | null;
  state: QuarterState;
  sales_taxable: number;
  output_vat: number;
  purchases_taxable: number;
  input_vat: number;
  result: number;
  rates: TaxRateRow[];
  invoices: number;
  credit_notes: number;
  expenses: number;
  draft_invoices: number;
}

export interface FilingRow {
  date: string;
  model: string;
  kind: "iva" | "irpf" | "is" | "info" | "intracom";
  period_from: string | null;
  period_to: string | null;
  state: "open" | "due" | "overdue" | "no_activity" | "closed";
  amount: number | null;
  note: string | null;
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
  fiscal_form: EsTaxForm | null;
  currency: string;
  company_country: string | null;
  notes: string[];
  quarters: QuarterRow[];
  filings: FilingRow[];
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
    is_model: string | null;
    is_deadline: string | null;
  };
}

export const esTaxApi = {
  config: () => pluginFetch<{ data: EsTaxConfig }>(`${BASE}/config`).then((r) => r.data),
  setRegime: (regime: EsTaxRegime) =>
    pluginFetch<{ data: EsTaxConfig }>(`${BASE}/config`, {
      method: "PUT",
      body: JSON.stringify({ regime }),
    }).then((r) => r.data),
  setFiscalForm: (fiscal_form: EsTaxForm) =>
    pluginFetch<{ data: EsTaxConfig }>(`${BASE}/config`, {
      method: "PUT",
      body: JSON.stringify({ fiscal_form }),
    }).then((r) => r.data),
  report: (year: number) =>
    pluginFetch<{ data: EsTaxReport }>(`${BASE}/report?year=${year}`).then((r) => r.data),
};
