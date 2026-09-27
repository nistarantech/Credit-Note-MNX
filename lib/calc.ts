// Credit-note engine. Mirrors the AW'25EOSS + SUMMARY sheets of NIKHIL.xlsx
// column for column (letters in comments are the Excel columns).

export type SaleType = "DISC" | "FRESH";

/**
 * One period of GST on apparel: from `from` onward, a piece worth up to
 * `threshold` (before GST) is taxed at `low`, above it at `high`. The list of
 * slabs is the rate history — e.g. 5%/12% at ₹1,000 until 21 Sep 2025, then
 * 5%/18% at ₹2,500 from 22 Sep 2025 (GST 2.0).
 */
export interface GstSlab {
  from: string; // yyyy-mm-dd, applies to bills on/after this date
  threshold: number; // per-piece value (excl. GST) above which the high rate applies
  low: number;
  high: number;
}

/** The GST rates notified for apparel, for the rate dropdowns. */
export const GST_RATES = [0, 0.05, 0.12, 0.18, 0.28];

/** Rate history before and after GST 2.0 (22 Sep 2025). */
export const DEFAULT_GST_SLABS: GstSlab[] = [
  { from: "2000-01-01", threshold: 1000, low: 0.05, high: 0.12 },
  { from: "2025-09-22", threshold: 2500, low: 0.05, high: 0.18 },
];

/**
 * A brand-specific margin for sales of one type up to a discount level, e.g.
 * "EOSS sales discounted up to 30% → 20% margin, up to 50% → 10%". The first
 * slab (lowest upTo) the sale's discount fits into wins; a sale matching no
 * slab gets the base margin for its type.
 */
export interface MarginSlab {
  type: SaleType;
  upTo: number; // discount, 0.3 = 30%
  margin: number;
}

/** A brand's terms: your margins, margin slabs by discount, and the WSP factor. */
export interface Terms {
  freshMargin: number; // your margin on FRESH sales (30%)
  discMargin: number; // your margin on DISC (EOSS) sales (20%)
  marginSlabs: MarginSlab[]; // optional per-discount margins, override the two above
  wspFactor: number; // WSP = MRP x factor when not given (0.625 = MRP / 1.6)
}

/** New terms agreed with a brand, for sales billed on/after `from`. */
export interface TermChange extends Terms {
  from: string; // yyyy-mm-dd
}

// Everything the formulas need: the global GST rules plus the brand's terms.
// The Terms fields are the brand's terms from the start; termChanges override
// them from later dates.
export interface Settings extends Terms {
  termChanges: TermChange[];
  b2cSlabs: GstSlab[]; // GST inside the retail sale price (B-C)
  roundGstFactor: boolean; // sheet uses 0.1071 / 0.0476 / 0.1525 (4 decimals)
  b2bSlabs: GstSlab[]; // GST on the brand's bill (B-B), by invoice date
  cnBasePct: number; // CN % is taken on dispatch MRP x this (90%)
  dispatch: { qty: number; mrp: number; wsp: number; gst: number };
}

export interface Line {
  id: string;
  date: string; // yyyy-mm-dd
  billNo: string;
  barcode: string;
  division: string;
  department: string;
  ageing: string;
  type: SaleType;
  disc: number; // 0.5 = 50%
  mrp: number;
  qty: number;
  wsp: number | null; // per-piece WSP from company invoice; null = MRP x wspFactor
  gstB2B: number | null; // total B-B GST override; null = slab on WSP
  flatDisc?: number | null; // ₹ off the whole line on the bill, on top of the % discount
  cashback?: number | null; // ₹ cashback given to the customer on the whole line, after billing
  marginOverride?: number | null; // custom margin for this sale; null = the brand's terms
  gstRateOverride?: number | null; // GST rate in the sale price; null = rate history
  purchaseDate?: string | null; // brand's invoice date, picks the B-B slab; null = sale date
}

export interface Row extends Line {
  mrpValue: number; // N
  discAmt: number; // O / P — % discount + flat discount
  flatDiscAmt: number;
  cashbackAmt: number;
  termsFrom: string | null; // date the brand terms used took effect; null = the brand's original terms
  realization: number; // Q
  gstRate: number; // B-C rate picked from slab (or the override)
  gstFactor: number; // S
  gstB2C: number; // R
  marginPct: number;
  marginCustom: boolean; // marginPct came from marginOverride, not the brand's terms
  margin: number; // T
  gstB2BRate: number; // B-B rate used when gstB2B isn't given
  netPayable: number; // U
  wspValue: number; // W
  gstB2BValue: number; // X
  cn: number; // V
}

export const DEFAULT_SETTINGS: Settings = {
  freshMargin: 0.3,
  discMargin: 0.2,
  marginSlabs: [],
  wspFactor: 0.625,
  termChanges: [],
  b2cSlabs: DEFAULT_GST_SLABS,
  roundGstFactor: true,
  b2bSlabs: DEFAULT_GST_SLABS,
  cnBasePct: 0.9,
  dispatch: { qty: 0, mrp: 0, wsp: 0, gst: 0 },
};

/** Settings saved before the B-B rate history had a single `b2b` rule; give them one. */
export function withGstHistory<T extends Partial<Settings> & { b2b?: { threshold: number; low: number; high: number } }>(s: T): T & Pick<Settings, "b2bSlabs"> {
  if (s.b2bSlabs?.length) return s as T & Pick<Settings, "b2bSlabs">;
  const b2bSlabs = s.b2b ? [{ from: "2000-01-01", ...s.b2b }, DEFAULT_GST_SLABS[1]] : DEFAULT_GST_SLABS;
  const { b2b: _old, ...rest } = s;
  return { ...(rest as T), b2bSlabs };
}

export function slabFor(date: string, slabs: GstSlab[]): GstSlab {
  const sorted = [...slabs].sort((a, b) => a.from.localeCompare(b.from));
  let pick = sorted[0];
  for (const s of sorted) if (!date || s.from <= date) pick = s;
  return pick;
}

/** The brand terms in force on `date`: the latest change from on/before it, else the original terms. */
export function termsFor(date: string, s: Settings): Terms & { from: string | null } {
  const change = [...(s.termChanges ?? [])]
    .sort((a, b) => a.from.localeCompare(b.from))
    .filter((c) => !date || c.from <= date)
    .pop();
  if (change) return change;
  return { freshMargin: s.freshMargin, discMargin: s.discMargin, marginSlabs: s.marginSlabs, wspFactor: s.wspFactor, from: null };
}

export function marginFor(type: SaleType, disc: number, s: Terms): number {
  const slab = s.marginSlabs
    .filter((m) => m.type === type)
    .sort((a, b) => a.upTo - b.upTo)
    .find((m) => disc <= m.upTo + 1e-9);
  return slab ? slab.margin : type === "FRESH" ? s.freshMargin : s.discMargin;
}

export function calcRow(l: Line, s: Settings): Row {
  const terms = termsFor(l.date, s);
  const mrpValue = l.mrp * l.qty;
  // A flat discount comes off the bill, like the % discount, so it lowers the GST too.
  const flatDiscAmt = l.flatDisc ?? 0;
  const discAmt = mrpValue * l.disc + flatDiscAmt;
  const realization = mrpValue - discAmt;
  // Cashback is paid to the customer after billing: the bill and its GST stay,
  // but what you keep — and so your margin and the brand's share — is lower.
  const cashbackAmt = l.cashback ?? 0;

  // B-C GST is inclusive in the sale price. Slab is chosen by bill date, then
  // on the per-piece value before GST (realization / (1 + low rate)).
  const slab = slabFor(l.date, s.b2cSlabs);
  const perPiece = l.qty ? realization / l.qty : 0;
  const gstRate = l.gstRateOverride ?? (perPiece / (1 + slab.low) > slab.threshold ? slab.high : slab.low);
  const rawFactor = gstRate / (1 + gstRate);
  const gstFactor = s.roundGstFactor ? Math.round(rawFactor * 1e4) / 1e4 : rawFactor;
  const gstB2C = realization * gstFactor;

  const marginCustom = l.marginOverride !== null && l.marginOverride !== undefined;
  const marginPct = marginCustom ? l.marginOverride! : marginFor(l.type, l.disc, terms);
  const margin = (realization - gstB2C - cashbackAmt) * marginPct;

  const wspUnit = l.wsp ?? l.mrp * terms.wspFactor;
  const wspValue = wspUnit * l.qty;
  // B-B GST follows the rate in force when the brand invoiced the goods.
  const b2bSlab = slabFor(l.purchaseDate || l.date, s.b2bSlabs);
  const gstB2BRate = wspUnit > b2bSlab.threshold ? b2bSlab.high : b2bSlab.low;
  const gstB2BValue = l.gstB2B ?? wspValue * gstB2BRate;

  const netPayable = realization - gstB2C - cashbackAmt - margin + gstB2BValue;
  const cn = wspValue + gstB2BValue - netPayable;

  return {
    ...l,
    mrpValue,
    discAmt,
    flatDiscAmt,
    cashbackAmt,
    termsFrom: terms.from,
    realization,
    gstRate,
    gstFactor,
    gstB2C,
    marginPct,
    marginCustom,
    margin,
    gstB2BRate,
    netPayable,
    wspValue,
    gstB2BValue,
    cn,
  };
}

export interface Totals {
  qty: number;
  mrpValue: number;
  discAmt: number;
  flatDiscAmt: number;
  cashbackAmt: number;
  realization: number;
  gstB2C: number;
  margin: number;
  netPayable: number;
  wspValue: number;
  gstB2BValue: number;
  cn: number;
}

export function sum(rows: Row[]): Totals {
  const t: Totals = { qty: 0, mrpValue: 0, discAmt: 0, flatDiscAmt: 0, cashbackAmt: 0, realization: 0, gstB2C: 0, margin: 0, netPayable: 0, wspValue: 0, gstB2BValue: 0, cn: 0 };
  for (const r of rows) for (const k of Object.keys(t) as (keyof Totals)[]) t[k] += r[k];
  return t;
}

export interface Summary {
  rows: Row[];
  all: Totals;
  disc: Totals;
  fresh: Totals;
  // BILLING WORKING-EOSS (DISC rows only)
  billing: { qty: number; mrpValue: number; wsp: number; gst: number; total: number };
  // MARGIN WORKING (DISC rows only)
  marginWorking: { rv: number; taxB2C: number; not: number; cashback: number; dealer: number; company: number; gst: number; netReceivable: number };
  eossCn: number; // SUMMARY!B25 = billing - net receivable
  freshCn: number; // SUMMARY!B26
  totalCn: number; // SUMMARY!B27
  cnPctOfMrp: number | null; // D27
  eossCnPctOfMrp: number | null; // D25
  goodsSoldPct: number | null; // G4
  discHitPct: number | null; // G5
  dispatchBilling: number;
  months: { month: string; t: Totals }[];
}

export function summarize(lines: Line[], s: Settings): Summary {
  const rows = lines.map((l) => calcRow(l, s));
  const discRows = rows.filter((r) => r.type === "DISC");
  const disc = sum(discRows);
  const fresh = sum(rows.filter((r) => r.type === "FRESH"));

  const billing = {
    qty: disc.qty,
    mrpValue: disc.mrpValue,
    wsp: disc.wspValue,
    gst: disc.gstB2BValue,
    total: disc.wspValue + disc.gstB2BValue,
  };
  const not = disc.realization - disc.gstB2C;
  const company = not - disc.cashbackAmt - disc.margin;
  const marginWorking = {
    rv: disc.realization,
    taxB2C: -disc.gstB2C,
    not,
    cashback: -disc.cashbackAmt,
    dealer: -disc.margin,
    company,
    gst: disc.gstB2BValue,
    netReceivable: company + disc.gstB2BValue,
  };
  const eossCn = billing.total - marginWorking.netReceivable;
  const freshCn = fresh.cn;
  const totalCn = eossCn + freshCn;
  const base = s.dispatch.mrp * s.cnBasePct;

  const byMonth = new Map<string, Row[]>();
  for (const r of discRows) {
    const m = r.date ? r.date.slice(0, 7) : "—";
    byMonth.set(m, [...(byMonth.get(m) ?? []), r]);
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, rs]) => ({ month, t: sum(rs) }));

  return {
    rows,
    all: sum(rows),
    disc,
    fresh,
    billing,
    marginWorking,
    eossCn,
    freshCn,
    totalCn,
    cnPctOfMrp: base ? totalCn / base : null,
    eossCnPctOfMrp: base ? eossCn / base : null,
    goodsSoldPct: s.dispatch.mrp ? disc.mrpValue / s.dispatch.mrp : null,
    discHitPct: disc.mrpValue ? 1 - disc.realization / disc.mrpValue : null,
    dispatchBilling: s.dispatch.wsp + s.dispatch.gst,
    months,
  };
}

// ---------- helpers for paste / display ----------

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function blankLine(prev?: Line): Line {
  return {
    id: uid(),
    date: prev?.date ?? new Date().toISOString().slice(0, 10),
    billNo: "",
    barcode: "",
    division: prev?.division ?? "",
    department: "",
    ageing: prev?.ageing ?? "",
    type: prev?.type ?? "DISC",
    disc: prev?.disc ?? 0.5,
    mrp: 0,
    qty: 1,
    wsp: null,
    gstB2B: null,
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Accepts dd-mm-yyyy, dd/mm/yy, yyyy-mm-dd, 1-Sep-2025, or an Excel serial number.
export function parseDate(v: string): string {
  const t = v.trim();
  if (!t) return "";
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + parseFloat(t) * 864e5);
    return d.toISOString().slice(0, 10);
  }
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/. ]([A-Za-z]{3,})[-/. ,]*(\d{2,4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

export function inr(n: number, dp = 2) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function pctStr(n: number | null, dp = 2) {
  return n === null || !isFinite(n) ? "—" : `${(n * 100).toFixed(dp)}%`;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function two(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim();
}
function three(n: number) {
  const h = Math.floor(n / 100);
  return [h ? `${ONES[h]} Hundred` : "", two(n % 100)].filter(Boolean).join(" ");
}

export function inWords(amount: number): string {
  const neg = amount < 0;
  let n = Math.round(Math.abs(amount) * 100);
  const paise = n % 100;
  n = Math.floor(n / 100);
  if (n === 0 && paise === 0) return "Rupees Zero Only";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${crore >= 100 ? three(crore) : two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  let s = `Rupees ${parts.join(" ") || "Zero"}`;
  if (paise) s += ` and ${two(paise)} Paise`;
  return `${neg ? "Minus " : ""}${s} Only`;
}
