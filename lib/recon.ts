// Scheme rules, expected credit notes, reconciliation against the supplier's
// credit note, and settlement. Pure functions over the app's data; the screens
// and the store call these.
import { calcRow, type Line, type Settings } from "./calc";
import type { Claim, CnRule, CnBase, GstTreatment, Purchase, Sale, SettlementEntry, Sku, SkuPrice, SupplierCn } from "./store";

// ---------- SKU prices ----------

/** The SKU's price record in force on `date` (latest `from` on/before it), else the earliest. */
export function priceOn(sku: Sku | undefined, date: string): SkuPrice | null {
  if (!sku?.prices.length) return null;
  const sorted = [...sku.prices].sort((a, b) => a.from.localeCompare(b.from));
  let pick = sorted[0];
  for (const p of sorted) if (!date || p.from <= date) pick = p;
  return pick;
}

export const normCode = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/** SKU lookup by SKU code or barcode, for one brand. */
export function skuIndex(skus: Sku[], brandId?: string) {
  const map = new Map<string, Sku>();
  for (const s of skus) {
    if (brandId && s.brandId !== brandId) continue;
    if (s.barcode) map.set(normCode(s.barcode), s);
    if (s.sku) map.set(normCode(s.sku), s);
  }
  return (code: string) => map.get(normCode(code));
}

// ---------- GST on a credit note ----------

/** Splits a CN amount into basic + GST according to how the supplier treats GST on credit notes. */
export function applyGst(amount: number, rate: number, treatment: GstTreatment) {
  if (treatment === "none" || !rate) return { basic: amount, gst: 0, gross: amount };
  if (treatment === "included") {
    const gst = (amount * rate) / (1 + rate);
    return { basic: amount - gst, gst, gross: amount };
  }
  const gst = amount * rate;
  return { basic: amount, gst, gross: amount + gst };
}

export const GST_TREATMENTS: { value: GstTreatment; label: string; hint: string }[] = [
  { value: "on_top", label: "GST added on CN", hint: "CN = basic + GST" },
  { value: "included", label: "GST included in CN", hint: "GST is inside the CN amount" },
  { value: "none", label: "No GST on CN", hint: "Financial CN, no tax" },
];

export const CN_BASES: { value: CnBase; label: string; per: "pct" | "rs"; hint: string }[] = [
  { value: "wsp", label: "WSP", per: "pct", hint: "WSP × qty × rate" },
  { value: "purchase_rate", label: "Purchase rate", per: "pct", hint: "Purchase rate × qty × rate" },
  { value: "mrp", label: "MRP", per: "pct", hint: "MRP × qty × rate" },
  { value: "taxable", label: "Taxable value", per: "pct", hint: "Taxable (pre-GST) value × rate" },
  { value: "sale_value", label: "Sale value", per: "pct", hint: "Net sale value (after discount) × rate" },
  { value: "qty", label: "Per piece", per: "rs", hint: "Qty × ₹ per piece" },
  { value: "fixed_line", label: "Fixed per line", per: "rs", hint: "₹ per eligible invoice/bill line" },
];
export const baseInfo = (b: CnBase) => CN_BASES.find((x) => x.value === b) ?? CN_BASES[0];

// ---------- expected CN from scheme rules ----------

/** One line of expected credit note: one purchase or sale line under one rule. */
export interface ExpectedLine {
  id: string; // ruleId:refId — also what marks the line as claimed
  ruleId: string;
  ruleCode: string;
  source: "purchase" | "sale";
  refId: string;
  date: string;
  invoiceNo: string; // brand's invoice (purchases) or your bill no. (sales)
  barcode: string;
  qty: number;
  baseUnit: number; // ₹ per piece the rate is applied to (0 for per-piece / fixed)
  baseValue: number; // ₹ the rate is applied to, or qty / 1 line
  rate: number;
  gstRate: number;
  basic: number;
  gst: number;
  gross: number;
  formula: string;
}

const inr0 = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

function lineMatches(rule: CnRule, l: { barcode: string; category: string; division: string; department: string }, sku: Sku | undefined) {
  const m = rule.match;
  if (m.barcodes.length) {
    const codes = new Set(m.barcodes.map(normCode));
    if (!codes.has(normCode(l.barcode)) && !(sku && codes.has(normCode(sku.sku)))) return false;
  }
  const eq = (want: string, have: string) => !want || normCode(want) === normCode(have);
  return eq(m.category, sku?.category || l.category) && eq(m.division, sku?.division || l.division) && eq(m.department, sku?.department || l.department);
}

interface Candidate {
  source: "purchase" | "sale";
  refId: string;
  date: string;
  invoiceNo: string;
  barcode: string;
  category: string;
  division: string;
  department: string;
  qty: number;
  mrp: number;
  wsp: number | null;
  purchaseRate: number | null;
  taxable: number; // line total before GST
  saleValue: number; // line total after discount, incl. GST (sales)
  gstRate: number | null;
}

/**
 * Expected credit note for one brand in a period, from its approved rules.
 * Rules are tried in priority order (lowest number first); a line takes the
 * first matching non-stacking rule, plus every matching stacking rule. A
 * rule's minimum quantity is checked on everything it matches in the period,
 * and its maximum caps the pieces it pays on.
 */
export function expectedFromRules(opts: {
  rules: CnRule[];
  purchases: Purchase[];
  sales: Sale[];
  skus: Sku[];
  settings: Settings;
  from: string;
  to: string;
  exclude?: Set<string>; // ExpectedLine ids already claimed
}): { lines: ExpectedLine[]; ineligible: { ruleId: string; reason: string }[] } {
  const { rules, settings, from, to } = opts;
  const findSku = skuIndex(opts.skus);
  const active = rules
    .filter((r) => r.active && r.from <= to && (!r.to || r.to >= from))
    .sort((a, b) => a.priority - b.priority || a.from.localeCompare(b.from));

  const inPeriod = (d: string) => d >= from && d <= to;
  const candidates: Candidate[] = [
    ...opts.purchases.filter((p) => inPeriod(p.date)).map((p): Candidate => {
      const sku = findSku(p.barcode);
      const price = priceOn(sku, p.date);
      return {
        source: "purchase", refId: p.id, date: p.date, invoiceNo: p.invoiceNo, barcode: p.barcode,
        category: p.category, division: p.division, department: p.department, qty: p.qty,
        mrp: p.mrp || price?.mrp || 0,
        wsp: p.rate || price?.wsp || null,
        purchaseRate: price?.purchaseRate ?? p.rate ?? null,
        taxable: p.gross,
        saleValue: 0,
        gstRate: p.gross ? p.tax / p.gross : (price?.gstRate ?? null),
      };
    }),
    ...opts.sales.filter((s) => inPeriod(s.date)).map((s): Candidate => {
      const sku = findSku(s.barcode);
      const price = priceOn(sku, s.purchaseDate || s.date);
      const row = calcRow(s, settings);
      return {
        source: "sale", refId: s.id, date: s.date, invoiceNo: s.billNo, barcode: s.barcode,
        category: "", division: s.division, department: s.department, qty: s.qty,
        mrp: s.mrp || price?.mrp || 0,
        wsp: row.wspValue / (s.qty || 1),
        purchaseRate: price?.purchaseRate ?? null,
        taxable: row.realization - row.gstB2C,
        saleValue: row.realization,
        gstRate: price?.gstRate ?? row.gstB2BRate,
      };
    }),
  ];

  // Which rules each candidate line qualifies for.
  const taken = new Map<string, CnRule[]>();
  for (const c of candidates) {
    const sku = findSku(c.barcode);
    if (sku && !sku.cnEligible) continue;
    const got: CnRule[] = [];
    let exclusive = false;
    for (const r of active) {
      if ((r.appliesOn === "purchases") !== (c.source === "purchase")) continue;
      if (c.date < r.from || (r.to && c.date > r.to)) continue;
      if (!lineMatches(r, c, sku)) continue;
      if (r.stacking) got.push(r);
      else if (!exclusive) {
        got.push(r);
        exclusive = true;
      }
    }
    if (got.length) taken.set(c.refId + "|" + c.source, got);
  }

  const lines: ExpectedLine[] = [];
  const ineligible: { ruleId: string; reason: string }[] = [];
  for (const r of active) {
    const mine = candidates.filter((c) => taken.get(c.refId + "|" + c.source)?.includes(r)).sort((a, b) => a.date.localeCompare(b.date));
    const totalQty = mine.reduce((a, c) => a + c.qty, 0);
    if (r.minQty && totalQty < r.minQty) {
      if (mine.length) ineligible.push({ ruleId: r.id, reason: `${inr0(totalQty)} pcs is below the minimum of ${inr0(r.minQty)}` });
      continue;
    }
    let left = r.maxQty ?? Infinity;
    for (const c of mine) {
      const id = `${r.id}:${c.refId}`;
      const qty = Math.min(c.qty, left);
      left -= qty;
      if (qty <= 0 || opts.exclude?.has(id)) continue;
      const share = c.qty ? qty / c.qty : 0;
      let baseUnit = 0;
      let baseValue = 0;
      let amount = 0;
      let formula = "";
      const unit = (v: number | null, label: string) => {
        baseUnit = v ?? 0;
        baseValue = baseUnit * qty;
        amount = baseValue * r.rate;
        formula = `${label} ₹${inr0(baseUnit)} × ${inr0(qty)} × ${+(r.rate * 100).toFixed(2)}%`;
      };
      switch (r.base) {
        case "wsp": unit(c.wsp, "WSP"); break;
        case "purchase_rate": unit(c.purchaseRate, "Purchase rate"); break;
        case "mrp": unit(c.mrp, "MRP"); break;
        case "taxable":
          baseValue = c.taxable * share;
          amount = baseValue * r.rate;
          formula = `Taxable ₹${inr0(baseValue)} × ${+(r.rate * 100).toFixed(2)}%`;
          break;
        case "sale_value":
          baseValue = c.saleValue * share;
          amount = baseValue * r.rate;
          formula = `Sale value ₹${inr0(baseValue)} × ${+(r.rate * 100).toFixed(2)}%`;
          break;
        case "qty":
          baseValue = qty;
          amount = qty * r.rate;
          formula = `${inr0(qty)} pcs × ₹${inr0(r.rate)}`;
          break;
        case "fixed_line":
          baseValue = 1;
          amount = r.rate;
          formula = `Fixed ₹${inr0(r.rate)} per line`;
          break;
      }
      const gstRate = r.gstRate ?? c.gstRate ?? 0;
      const g = applyGst(amount, gstRate, r.gstTreatment);
      lines.push({
        id, ruleId: r.id, ruleCode: r.code || r.name, source: c.source, refId: c.refId, date: c.date,
        invoiceNo: c.invoiceNo, barcode: c.barcode, qty, baseUnit, baseValue, rate: r.rate, gstRate,
        basic: g.basic, gst: g.gst, gross: g.gross, formula,
      });
    }
  }
  return { lines, ineligible };
}

// ---------- the claim's expected lines, for reconciliation ----------

/** What the claim expects, line by line: scheme lines as they are, sales as their CN (GST inside). */
export function claimExpected(c: Claim): ExpectedLine[] {
  if (c.kind === "scheme") return c.schemeLines;
  return c.lines.map((l: Line) => {
    const r = calcRow(l, c.settings);
    const g = applyGst(r.cn, r.gstB2BRate, "included");
    return {
      id: l.id, ruleId: "", ruleCode: "Sales CN", source: "sale", refId: l.id, date: l.date, invoiceNo: l.billNo,
      barcode: l.barcode, qty: l.qty, baseUnit: 0, baseValue: r.cn, rate: 1, gstRate: r.gstB2BRate,
      basic: g.basic, gst: g.gst, gross: g.gross, formula: "WSP + GST (B-B) − net payable",
    };
  });
}

// ---------- reconciliation ----------

export type ReconStatus = "matched" | "short" | "excess" | "missing";

export const RECON_LABEL: Record<ReconStatus, string> = {
  matched: "Matched",
  short: "Short",
  excess: "Excess",
  missing: "Missing",
};

export interface Amounts { qty: number; basic: number; gst: number; gross: number }
const zero = (): Amounts => ({ qty: 0, basic: 0, gst: 0, gross: 0 });
const add = (a: Amounts, b: Partial<Amounts>) => {
  a.qty += b.qty ?? 0;
  a.basic += b.basic ?? 0;
  a.gst += b.gst ?? 0;
  a.gross += b.gross ?? 0;
};

export interface ReconRow {
  key: string;
  label: string;
  expected: Amounts;
  actual: Amounts;
  hasExpected: boolean;
  hasActual: boolean;
  diff: number; // expected − actual, gross (positive = short)
  status: ReconStatus;
  notes: string[]; // e.g. "GST differs by ₹ 12", "Qty 5 vs 4", "Not in the claim"
}

export interface Tolerance { amount: number; gst: number; qty: number }
export const DEFAULT_TOLERANCE: Tolerance = { amount: 1, gst: 1, qty: 0 };

export type MatchBy = "barcode" | "invoice" | "total";

export interface Recon {
  by: MatchBy;
  rows: ReconRow[];
  expected: Amounts;
  actual: Amounts;
  diff: number;
  counts: Record<ReconStatus, number>;
  short: number; // sum of shortfalls on short / missing rows
  excess: number; // sum of excess on excess rows
  status: ReconStatus | "no_cn";
}

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Matched within tolerance, else short / excess on the gross; missing when the CN has nothing for the line. */
export function rowStatus(e: Amounts, a: Amounts, hasE: boolean, hasA: boolean, tol: Tolerance): { status: ReconStatus; notes: string[] } {
  const notes: string[] = [];
  if (!hasA) return { status: "missing", notes };
  if (!hasE) notes.push("Not in the claim");
  if (hasE && a.qty && e.qty && Math.abs(e.qty - a.qty) > tol.qty) notes.push(`Qty ${fmt(e.qty)} claimed, ${fmt(a.qty)} credited`);
  if (hasE && a.gst && Math.abs(e.gst - a.gst) > tol.gst) notes.push(`GST differs by ₹ ${fmt(Math.abs(e.gst - a.gst))}`);
  const d = e.gross - a.gross;
  return { status: Math.abs(d) <= tol.amount ? "matched" : d > 0 ? "short" : "excess", notes };
}

/**
 * Compares the claim's expected lines with the supplier's CN lines. Lines are
 * matched by barcode/SKU when the CN has them, else by invoice number, else
 * the CN is checked as one total.
 */
export function reconcile(expected: ExpectedLine[], cns: SupplierCn[], tol: Tolerance = DEFAULT_TOLERANCE): Recon {
  const cnLines = cns.flatMap((c) => c.lines);
  const withBarcode = cnLines.filter((l) => l.barcode).length;
  const withInvoice = cnLines.filter((l) => l.invoiceNo).length;
  const by: MatchBy = cnLines.length && withBarcode * 2 >= cnLines.length ? "barcode" : cnLines.length && withInvoice * 2 >= cnLines.length ? "invoice" : "total";

  const rows = new Map<string, ReconRow>();
  const row = (key: string, label: string) => {
    if (!rows.has(key)) rows.set(key, { key, label, expected: zero(), actual: zero(), hasExpected: false, hasActual: false, diff: 0, status: "matched", notes: [] });
    return rows.get(key)!;
  };
  const keyOf = (barcode: string, invoice: string) => (by === "barcode" ? normCode(barcode) || "—" : by === "invoice" ? normCode(invoice) || "—" : "TOTAL");
  const labelOf = (barcode: string, invoice: string) => (by === "barcode" ? barcode || "(no barcode)" : by === "invoice" ? invoice || "(no invoice)" : "Whole credit note");

  for (const e of expected) {
    const r = row(keyOf(e.barcode, e.invoiceNo), labelOf(e.barcode, e.invoiceNo));
    add(r.expected, e);
    r.hasExpected = true;
  }
  for (const c of cns) {
    if (by === "total" || !c.lines.length) {
      const r = row(by === "total" ? "TOTAL" : "UNALLOCATED", by === "total" ? "Whole credit note" : `CN ${c.number} (no lines)`);
      add(r.actual, { qty: 0, basic: c.basic, gst: c.gst, gross: c.gross });
      r.hasActual = true;
      continue;
    }
    for (const l of c.lines) {
      const r = row(keyOf(l.barcode, l.invoiceNo), labelOf(l.barcode, l.invoiceNo));
      add(r.actual, { qty: l.qty ?? 0, basic: l.basic, gst: l.gst, gross: l.gross });
      r.hasActual = true;
    }
  }

  const counts: Record<ReconStatus, number> = { matched: 0, short: 0, excess: 0, missing: 0 };
  const out = [...rows.values()].map((r) => {
    const { status, notes } = rowStatus(r.expected, r.actual, r.hasExpected, r.hasActual, tol);
    counts[status]++;
    return { ...r, status, notes, diff: r.expected.gross - r.actual.gross };
  });
  const expectedT = zero();
  const actualT = zero();
  for (const r of out) {
    add(expectedT, r.expected);
    add(actualT, r.actual);
  }
  const short = out.filter((r) => r.diff > tol.amount).reduce((a, r) => a + r.diff, 0);
  const excess = out.filter((r) => r.diff < -tol.amount).reduce((a, r) => a - r.diff, 0);
  const worst: ReconStatus[] = ["missing", "short", "excess"];
  const status = !cns.length ? "no_cn" : (worst.find((s) => counts[s]) ?? "matched");
  // Problems first, then by size of the difference.
  out.sort((a, b) => Number(a.status === "matched") - Number(b.status === "matched") || Math.abs(b.diff) - Math.abs(a.diff));
  return { by, rows: out, expected: expectedT, actual: actualT, diff: expectedT.gross - actualT.gross, counts, short, excess, status };
}

// ---------- settlement ----------

export interface SettlementSummary {
  expected: number; // what was claimed
  approved: number; // what the supplier agreed to (defaults to claimed)
  cnReceived: number; // supplier CNs against the claim
  adjusted: number; // CN set off against payables to the supplier
  refunded: number; // paid back in money
  writtenOff: number; // shortfall accepted as not recoverable
  toRecover: number; // approved − CN received − written off: still to get from the supplier
  toUse: number; // CN received − adjusted − refunded: CN in hand, not yet used
  pending: number; // approved − adjusted − refunded − written off
  status: "pending" | "partial" | "settled";
}

export function settlementOf(c: Claim, cns: SupplierCn[], entries: SettlementEntry[]): SettlementSummary {
  const sumKind = (k: SettlementEntry["kind"]) => entries.filter((e) => e.kind === k).reduce((a, e) => a + e.amount, 0);
  const approved = c.approvedAmount ?? c.total;
  const cnReceived = cns.filter((x) => !x.disputed).reduce((a, x) => a + x.gross, 0);
  const adjusted = sumKind("adjusted");
  const refunded = sumKind("refund");
  const writtenOff = sumKind("write_off");
  const pending = approved - adjusted - refunded - writtenOff;
  const done = adjusted + refunded + writtenOff;
  return {
    expected: c.total,
    approved,
    cnReceived,
    adjusted,
    refunded,
    writtenOff,
    toRecover: Math.max(0, approved - cnReceived - writtenOff),
    toUse: Math.max(0, cnReceived - adjusted - refunded),
    pending,
    status: pending <= 0.5 ? "settled" : done > 0 ? "partial" : "pending",
  };
}

// ---------- claim ageing ----------

export function ageDays(from: string, to = new Date().toISOString().slice(0, 10)) {
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.max(0, Math.round((d(to) - d(from)) / 864e5));
}
export function ageBucket(days: number) {
  return days <= 30 ? "0–30" : days <= 60 ? "31–60" : days <= 90 ? "61–90" : "90+";
}

// ---------- building the SKU master ----------

/** Adds a price record if it differs from what is in force on its date. */
export function withPrice(sku: Sku, p: SkuPrice): Sku {
  const cur = priceOn(sku, p.from);
  const same = cur && cur.mrp === p.mrp && cur.wsp === p.wsp && cur.purchaseRate === p.purchaseRate && cur.gstRate === p.gstRate;
  if (same) return sku;
  const prices = [...sku.prices.filter((x) => x.from !== p.from), p].sort((a, b) => a.from.localeCompare(b.from));
  return { ...sku, prices };
}

/**
 * SKUs from a brand's imported invoices: one per barcode, with a price record
 * whenever the invoice rate, MRP or GST rate changes. Existing SKUs keep their
 * details and only gain price records.
 */
export function skusFromPurchases(brandId: string, purchases: Purchase[], existing: Sku[], make: (patch: Partial<Sku>) => Sku): { changed: Sku[]; created: number; repriced: number } {
  const find = skuIndex(existing, brandId);
  const out = new Map<string, Sku>();
  let created = 0;
  let repriced = 0;
  const sorted = purchases.filter((p) => p.brandId === brandId && p.barcode).sort((a, b) => a.date.localeCompare(b.date));
  for (const p of sorted) {
    const code = normCode(p.barcode);
    let sku = out.get(code) ?? find(p.barcode);
    if (!sku) {
      sku = make({ sku: p.barcode, barcode: p.barcode, division: p.division, department: p.department, category: p.category, season: p.season });
      created++;
    }
    const gstRate = p.gross ? Math.round((p.tax / p.gross) * 1000) / 1000 : null;
    const next = withPrice(sku, { from: p.date, mrp: p.mrp, wsp: p.rate, purchaseRate: p.rate, gstRate, source: `Invoice ${p.invoiceNo}`.trim() });
    if (next !== sku && sku.prices.length) repriced++;
    out.set(code, next);
  }
  return { changed: [...out.values()], created, repriced };
}
