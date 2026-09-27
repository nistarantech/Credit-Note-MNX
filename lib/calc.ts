// Credit-note engine. Mirrors the AW'25EOSS + SUMMARY sheets of NIKHIL.xlsx
// column for column (letters in comments are the Excel columns).

export type SaleType = "DISC" | "FRESH";

export interface GstSlab {
  from: string; // yyyy-mm-dd, slab applies to bills on/after this date
  threshold: number; // per-piece value (excl. GST) above which the high rate applies
  low: number;
  high: number;
}

/**
 * A party-specific margin for sales of one type up to a discount level, e.g.
 * "EOSS sales discounted up to 30% → 20% margin, up to 50% → 10%". The first
 * slab (lowest upTo) the sale's discount fits into wins; a sale matching no
 * slab gets the base margin for its type.
 */
export interface MarginSlab {
  type: SaleType;
  upTo: number; // discount, 0.3 = 30%
  margin: number;
}

// Everything the formulas need: the global GST rules plus the party's deal.
export interface Settings {
  freshMargin: number; // dealer margin on FRESH sales (30%)
  discMargin: number; // dealer margin on DISC (EOSS) sales (20%)
  marginSlabs: MarginSlab[]; // optional per-discount margins, override the two above
  wspFactor: number; // WSP = MRP x factor when not given (0.625 = MRP / 1.6)
  b2cSlabs: GstSlab[]; // GST inside the retail sale price (B-C)
  roundGstFactor: boolean; // sheet uses 0.1071 / 0.0476 / 0.1525 (4 decimals)
  b2b: { threshold: number; low: number; high: number }; // GST on company bill (B-B)
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
}

export interface Row extends Line {
  mrpValue: number; // N
  discAmt: number; // O / P
  realization: number; // Q
  gstRate: number; // B-C rate picked from slab
  gstFactor: number; // S
  gstB2C: number; // R
  marginPct: number;
  margin: number; // T
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
  b2cSlabs: [
    { from: "2000-01-01", threshold: 1000, low: 0.05, high: 0.12 },
    { from: "2025-09-22", threshold: 2500, low: 0.05, high: 0.18 },
  ],
  roundGstFactor: true,
  b2b: { threshold: 1000, low: 0.05, high: 0.12 },
  cnBasePct: 0.9,
  dispatch: { qty: 0, mrp: 0, wsp: 0, gst: 0 },
};

export function slabFor(date: string, slabs: GstSlab[]): GstSlab {
  const sorted = [...slabs].sort((a, b) => a.from.localeCompare(b.from));
  let pick = sorted[0];
  for (const s of sorted) if (!date || s.from <= date) pick = s;
  return pick;
}

export function marginFor(type: SaleType, disc: number, s: Settings): number {
  const slab = s.marginSlabs
    .filter((m) => m.type === type)
    .sort((a, b) => a.upTo - b.upTo)
    .find((m) => disc <= m.upTo + 1e-9);
  return slab ? slab.margin : type === "FRESH" ? s.freshMargin : s.discMargin;
}

export function calcRow(l: Line, s: Settings): Row {
  const mrpValue = l.mrp * l.qty;
  const discAmt = mrpValue * l.disc;
  const realization = mrpValue - discAmt;

  // B-C GST is inclusive in the sale price. Slab is chosen on the per-piece
  // value before GST (realization / (1 + low rate)).
  const slab = slabFor(l.date, s.b2cSlabs);
  const perPiece = l.qty ? realization / l.qty : 0;
  const gstRate = perPiece / (1 + slab.low) > slab.threshold ? slab.high : slab.low;
  const rawFactor = gstRate / (1 + gstRate);
  const gstFactor = s.roundGstFactor ? Math.round(rawFactor * 1e4) / 1e4 : rawFactor;
  const gstB2C = realization * gstFactor;

  const marginPct = marginFor(l.type, l.disc, s);
  const margin = (realization - gstB2C) * marginPct;

  const wspUnit = l.wsp ?? l.mrp * s.wspFactor;
  const wspValue = wspUnit * l.qty;
  const b2bRate = wspUnit > s.b2b.threshold ? s.b2b.high : s.b2b.low;
  const gstB2BValue = l.gstB2B ?? wspValue * b2bRate;

  const netPayable = realization - gstB2C - margin + gstB2BValue;
  const cn = wspValue + gstB2BValue - netPayable;

  return {
    ...l,
    mrpValue,
    discAmt,
    realization,
    gstRate,
    gstFactor,
    gstB2C,
    marginPct,
    margin,
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
  realization: number;
  gstB2C: number;
  margin: number;
  netPayable: number;
  wspValue: number;
  gstB2BValue: number;
  cn: number;
}

export function sum(rows: Row[]): Totals {
  const t: Totals = { qty: 0, mrpValue: 0, discAmt: 0, realization: 0, gstB2C: 0, margin: 0, netPayable: 0, wspValue: 0, gstB2BValue: 0, cn: 0 };
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
  marginWorking: { rv: number; taxB2C: number; not: number; dealer: number; company: number; gst: number; netReceivable: number };
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
  const company = not - disc.margin;
  const marginWorking = {
    rv: disc.realization,
    taxB2C: -disc.gstB2C,
    not,
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

const num = (v: string) => {
  const t = v.replace(/[₹,\s]/g, "");
  if (t === "" || t === "-") return NaN;
  if (t.endsWith("%")) return parseFloat(t) / 100;
  return parseFloat(t);
};
const pct = (v: string) => {
  const n = num(v);
  if (isNaN(n)) return 0;
  return v.includes("%") || n <= 1 ? n : n / 100;
};

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

type Field = "date" | "billNo" | "barcode" | "division" | "department" | "ageing" | "disc" | "type" | "mrp" | "qty" | "wsp" | "gstB2B";

// Column order of the AW'25EOSS sheet (A..M), used when no header row is pasted.
const SHEET_ORDER: (Field | null)[] = [null, "date", "billNo", "barcode", "division", "department", "ageing", null, "disc", null, "type", "mrp", "qty"];

function headerField(h: string): Field | null {
  const k = h.toLowerCase().replace(/[^a-z0-9%()-]/g, "");
  if (k.includes("date")) return "date";
  if (k.startsWith("billno") || k === "bill" || k.startsWith("invoiceno")) return "billNo";
  if (k.includes("barcode") || k.includes("article")) return "barcode";
  if (k.startsWith("division")) return "division";
  if (k.startsWith("department")) return "department";
  if (k.startsWith("ageing") || k.startsWith("season")) return "ageing";
  if (k.startsWith("disc%(m)") || k === "disc%" || k === "disc" || k === "discount%") return "disc";
  if (k === "slab" || k === "type") return "type";
  if (k === "mrp" || k === "rsp") return "mrp";
  if (k === "qty" || k === "quantity") return "qty";
  if (k === "wsp" || k === "invoicerate") return "wsp";
  if (k === "gst(b-b)") return "gstB2B";
  return null;
}

export function parsePaste(text: string, s: Settings): Line[] {
  const rows = text.replace(/\r/g, "").split("\n").filter((r) => r.trim()).map((r) => r.split("\t"));
  if (!rows.length) return [];
  let map: (Field | null)[] = SHEET_ORDER;
  const first = rows[0].map(headerField);
  if (first.filter(Boolean).length >= 2) {
    // keep the first match of each field (sheet has "Slab" and "WSP" twice)
    const seen = new Set<Field>();
    map = first.map((f) => (f && !seen.has(f) ? (seen.add(f), f) : null));
    rows.shift();
  }
  const out: Line[] = [];
  for (const cells of rows) {
    const l = blankLine();
    l.wsp = null;
    let wspTotal: number | null = null;
    map.forEach((f, i) => {
      const v = (cells[i] ?? "").trim();
      if (!f) return;
      switch (f) {
        case "date": l.date = parseDate(v) || l.date; break;
        case "disc": l.disc = pct(v); break;
        case "type": l.type = /fresh/i.test(v) ? "FRESH" : "DISC"; break;
        case "mrp": l.mrp = num(v) || 0; break;
        case "qty": { const q = num(v); l.qty = isNaN(q) ? 1 : q; break; }
        case "wsp": { const w = num(v); wspTotal = isNaN(w) ? null : w; break; }
        case "gstB2B": { const g = num(v); l.gstB2B = isNaN(g) ? null : g; break; }
        default: l[f] = v;
      }
    });
    if (!l.mrp) continue;
    // WSP pasted from the sheet is a line total; store per piece. Drop it if it
    // is just the default factor so later setting changes still apply.
    if (wspTotal !== null && l.qty) {
      const unit = wspTotal / l.qty;
      if (Math.abs(unit - l.mrp * s.wspFactor) > 0.01) l.wsp = unit;
    }
    if (l.gstB2B !== null && l.wsp === null) {
      const auto = l.mrp * s.wspFactor * l.qty * (l.mrp * s.wspFactor > s.b2b.threshold ? s.b2b.high : s.b2b.low);
      if (Math.abs(auto - l.gstB2B) < 0.02) l.gstB2B = null;
    }
    out.push(l);
  }
  return out;
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
