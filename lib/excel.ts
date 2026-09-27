// Reading sales and purchase rows out of Excel sheets (or text pasted from
// Excel): find the header row, map the columns we know, and turn each row
// into a sale or a purchase line.
import { parseDate, uid, type Line, type Settings } from "./calc";
import type { Purchase } from "./store";

export type Cell = string | number | boolean | Date | null | undefined;
export type Kind = "sales" | "purchases";

type SaleField = "date" | "billNo" | "barcode" | "division" | "department" | "ageing" | "discM" | "discP" | "disc" | "type" | "mrp" | "qty" | "wsp" | "gstB2B" | "flatDisc" | "cashback";
type BuyField = "date" | "invoiceNo" | "barcode" | "division" | "department" | "category" | "season" | "rate" | "mrp" | "qty" | "gross" | "tax" | "net";

const key = (h: Cell) => String(h ?? "").toLowerCase().replace(/[^a-z0-9%()-]/g, "");

// Header text (normalised) → field. First match per field wins.
const SALE_HEADERS: [RegExp, SaleField][] = [
  [/^billdate|^date$|^saledate/, "date"],
  [/^billno|^bill$|^invoiceno/, "billNo"],
  [/barcode|article/, "barcode"],
  [/^division/, "division"],
  [/^department/, "department"],
  [/^ageing|^season/, "ageing"],
  [/^disc%\(m\)/, "discM"],
  [/^disc%\(p\)/, "discP"],
  [/^disc%?$|^discount%?$/, "disc"],
  [/^slab$|^type$|^saletype$/, "type"],
  [/^mrp$/, "mrp"],
  [/^qty$|^quantity$/, "qty"],
  [/^wsp$/, "wsp"],
  [/^gst\(b-b\)$/, "gstB2B"],
  // ₹ amounts. Not "Disc (P)" / "Disc (M)" — those are the % discount worked out in rupees.
  [/^flatdisc|^flatdiscount|^discamt$|^discountamount$|^discount\(rs|^extradisc/, "flatDisc"],
  [/^cashback/, "cashback"],
];

const BUY_HEADERS: [RegExp, BuyField][] = [
  [/^invoicedate$/, "date"],
  [/^invoiceno$/, "invoiceNo"],
  [/^barcode$/, "barcode"],
  [/^division$/, "division"],
  [/^department$/, "department"],
  [/^category3$/, "category"],
  [/^category6$/, "season"],
  [/^invoicerate$/, "rate"],
  [/^rsp$|^mrp$/, "mrp"],
  [/^invoiceqty$/, "qty"],
  [/^grossamount$/, "gross"],
  [/^tax$/, "tax"],
  [/^netamount$/, "net"],
];

// Fields where a later column wins. The EOSS sheet has two Slab columns:
// J goes with Disc % (P), K with Disc % (M) — and the credit note working
// (SUMMARY!E11…) uses K.
const LAST_WINS = new Set<string>(["type"]);

function mapHeader<F extends string>(row: Cell[], table: [RegExp, F][]) {
  const map = new Map<F, number>();
  row.forEach((h, i) => {
    const k = key(h);
    if (!k) return;
    const hit = table.find(([re]) => re.test(k));
    if (hit && (!map.has(hit[1]) || LAST_WINS.has(hit[1]))) map.set(hit[1], i);
  });
  return map;
}

const num = (v: Cell): number => {
  if (typeof v === "number") return v;
  if (v === null || v === undefined || typeof v === "boolean" || v instanceof Date) return NaN;
  const t = v.replace(/[₹,\s]/g, "");
  if (!t) return NaN;
  return t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t);
};
const pct = (v: Cell) => {
  const n = num(v);
  if (isNaN(n)) return NaN;
  return (typeof v === "string" && v.includes("%")) || Math.abs(n) <= 1 ? n : n / 100;
};
const str = (v: Cell) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
const date = (v: Cell): string => {
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  return typeof v === "string" ? parseDate(v) : "";
};

export interface SheetFound {
  sheet: string;
  kind: Kind;
  headerRow: number; // 1-based, as Excel shows it
  sales: Line[];
  purchases: Omit<Purchase, "brandId" | "importId">[];
  skipped: number; // rows under the header that were not sale/purchase lines (totals, notes)
}

/** Finds the header row (within the first 25 rows) and what kind of sheet this is. */
export function readSheet(sheet: string, rows: Cell[][]): SheetFound | null {
  for (let h = 0; h < Math.min(rows.length, 25); h++) {
    const buy = mapHeader(rows[h], BUY_HEADERS);
    if (buy.has("rate") && buy.has("qty") && buy.has("date")) return purchasesFrom(sheet, rows, h, buy);
    const sale = mapHeader(rows[h], SALE_HEADERS);
    if (sale.has("mrp") && sale.has("qty") && sale.has("date")) return salesFrom(sheet, rows, h, sale);
  }
  return null;
}

function salesFrom(sheet: string, rows: Cell[][], h: number, map: Map<SaleField, number>): SheetFound {
  const get = (r: Cell[], f: SaleField) => (map.has(f) ? r[map.get(f)!] : undefined);
  const sales: Line[] = [];
  let skipped = 0;
  for (const r of rows.slice(h + 1)) {
    const mrp = num(get(r, "mrp"));
    const qty = num(get(r, "qty"));
    const d = date(get(r, "date"));
    if (!(mrp > 0) || isNaN(qty) || qty === 0 || !d) {
      if (r.some((c) => c !== null && c !== undefined && c !== "")) skipped++;
      continue;
    }
    const discRaw = [get(r, "discM"), get(r, "discP"), get(r, "disc")].map(pct).find((x) => !isNaN(x));
    const typeCell = str(get(r, "type"));
    const disc = discRaw ?? 0;
    // no Slab column: a real markdown is EOSS, a small one (e.g. 6.25%) is a fresh-sale scheme
    const type: Line["type"] = /fresh/i.test(typeCell) ? "FRESH" : /disc|eoss/i.test(typeCell) ? "DISC" : disc > 0.2 ? "DISC" : "FRESH";

    // WSP and GST (B-B) in the sheet are line totals from the brand's invoice;
    // keep them exactly (per piece for WSP). Without them the brand's WSP
    // factor and the GST slab are used.
    const wspTotal = num(get(r, "wsp"));
    const wsp = isNaN(wspTotal) ? null : wspTotal / qty;
    const gstTotal = num(get(r, "gstB2B"));
    const gstB2B = isNaN(gstTotal) ? null : gstTotal;

    const flat = num(get(r, "flatDisc"));
    const cash = num(get(r, "cashback"));
    sales.push({
      id: uid(), date: d, billNo: str(get(r, "billNo")), barcode: str(get(r, "barcode")),
      division: str(get(r, "division")), department: str(get(r, "department")), ageing: str(get(r, "ageing")),
      type, disc, mrp, qty, wsp, gstB2B,
      flatDisc: flat > 0 ? flat : null,
      cashback: cash > 0 ? cash : null,
    });
  }
  return { sheet, kind: "sales", headerRow: h + 1, sales, purchases: [], skipped };
}

function purchasesFrom(sheet: string, rows: Cell[][], h: number, map: Map<BuyField, number>): SheetFound {
  const get = (r: Cell[], f: BuyField) => (map.has(f) ? r[map.get(f)!] : undefined);
  const purchases: SheetFound["purchases"] = [];
  let skipped = 0;
  for (const r of rows.slice(h + 1)) {
    const rate = num(get(r, "rate"));
    const qty = num(get(r, "qty"));
    const d = date(get(r, "date"));
    if (!(rate > 0) || isNaN(qty) || !d) {
      if (r.some((c) => c !== null && c !== undefined && c !== "")) skipped++;
      continue;
    }
    const gross = num(get(r, "gross"));
    const tax = num(get(r, "tax"));
    const net = num(get(r, "net"));
    const g = isNaN(gross) ? rate * qty : gross;
    const t = isNaN(tax) ? 0 : tax;
    purchases.push({
      id: uid(), date: d, invoiceNo: str(get(r, "invoiceNo")), barcode: str(get(r, "barcode")),
      division: str(get(r, "division")), department: str(get(r, "department")), category: str(get(r, "category")),
      season: str(get(r, "season")), rate, mrp: num(get(r, "mrp")) || 0, qty, gross: g, tax: t, net: isNaN(net) ? g + t : net,
    });
  }
  return { sheet, kind: "purchases", headerRow: h + 1, sales: [], purchases, skipped };
}

/** Text copied from Excel: tab-separated rows. */
export function readPaste(text: string): SheetFound | null {
  const rows = text.replace(/\r/g, "").split("\n").filter((r) => r.trim()).map((r) => r.split("\t"));
  return readSheet("Pasted rows", rows);
}

/**
 * Links sales to the brand's invoices by barcode: the invoice date becomes the
 * sale's purchase date (it decides the GST rate on the brand's bill), and a
 * sale without an invoice rate takes the invoice's when it differs from
 * MRP × WSP factor. The earliest invoice for a barcode is used.
 */
export function linkPurchases(sales: Line[], purchases: { barcode: string; rate: number; date: string }[], s: Settings): Line[] {
  const first = new Map<string, { rate: number; date: string }>();
  for (const p of purchases) {
    if (!p.barcode) continue;
    const seen = first.get(p.barcode);
    if (!seen || p.date < seen.date) first.set(p.barcode, { rate: p.rate, date: p.date });
  }
  return sales.map((l) => {
    const inv = first.get(l.barcode);
    if (!inv) return l;
    const wsp = l.wsp ?? (Math.abs(inv.rate - l.mrp * s.wspFactor) > 0.01 ? inv.rate : null);
    return { ...l, wsp, purchaseDate: l.purchaseDate ?? inv.date };
  });
}

export const monthsOf = (dates: string[]) => [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
