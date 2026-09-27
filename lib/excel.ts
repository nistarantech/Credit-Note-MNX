// Reading sales and purchase rows out of Excel sheets (or text pasted from
// Excel): find the header row, map the columns we know, and turn each row
// into a sale or a purchase line.
import { parseDate, uid, type Line, type Settings } from "./calc";
import type { Purchase } from "./store";

export type Cell = string | number | boolean | Date | null | undefined;
export type Kind = "sales" | "purchases";

type SaleField = "date" | "billNo" | "barcode" | "division" | "department" | "ageing" | "discM" | "discP" | "disc" | "type" | "mrp" | "qty" | "wsp" | "gstB2B" | "flatDisc" | "cashback" | "saleAmt" | "saleRate";
type BuyField = "date" | "invoiceNo" | "barcode" | "division" | "department" | "category" | "season" | "rate" | "mrp" | "qty" | "gross" | "tax" | "net";

const key = (h: Cell) => String(h ?? "").toLowerCase().replace(/[^a-z0-9%()-]/g, "");

// Header text (normalised) → field. First match per field wins.
const SALE_HEADERS: [RegExp, SaleField][] = [
  [/^billdate|^date$|^saledate|^voucherdate/, "date"],
  [/^billno|^bill$|^invoiceno|^voucherno|^voucherwithprefix|^voucher$|^vchnumber|^vchno/, "billNo"],
  // older POS exports keep the barcode in "Field 2"
  [/barcode|article|^field2$/, "barcode"],
  [/^division/, "division"],
  [/^department|^itemname$|^productname$|^group$|^product$/, "department"],
  [/^ageing|^season/, "ageing"],
  [/^disc%\(m\)/, "discM"],
  [/^disc%\(p\)/, "discP"],
  [/^disc%?$|^dis$|^discount%?$/, "disc"],
  [/^slab$|^type$|^saletype$/, "type"],
  [/^mrp$/, "mrp"],
  [/^qty$|^quantity$|^salesqty$|^saleqty$|^soldqty$/, "qty"],
  [/^wsp$/, "wsp"],
  [/^gst\(b-b\)$/, "gstB2B"],
  // ₹ amounts. Not "Disc (P)" / "Disc (M)" — those are the % discount worked out in rupees.
  [/^flatdisc|^flatdiscount|^discamt$|^discountamount$|^discount\(rs|^extradisc|^totaldisc/, "flatDisc"],
  [/^cashback/, "cashback"],
  // what the customer paid for the line, in POS sale reports (Sale amt / Net Amt / amt)
  [/^saleamt|^saleamount|^salesamt|^salesamount|^saleval|^netamt$|^netamount$|^amt$|^amount$/, "saleAmt"],
  // paid per piece, when there is no line amount ("Sale Rate"; not "New Sale Rate", which is a price)
  [/^salerate$|^netrate$/, "saleRate"],
];

const BUY_HEADERS: [RegExp, BuyField][] = [
  [/^invoicedate$/, "date"],
  [/^invoiceno$/, "invoiceNo"],
  [/^barcode$/, "barcode"],
  [/^division$/, "division"],
  [/^department$/, "department"],
  [/^category3$|^category$/, "category"],
  [/^category6$|^season$/, "season"],
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

function salesFrom(sheet: string, rows: Cell[][], h: number, first: Map<SaleField, number>): SheetFound {
  let map = first;
  const get = (r: Cell[], f: SaleField) => (map.has(f) ? r[map.get(f)!] : undefined);
  const sales: Line[] = [];
  let skipped = 0;
  for (const r of rows.slice(h + 1)) {
    // Another table pasted further down the sheet, with its own header row: read on with its columns.
    const again = mapHeader(r, SALE_HEADERS);
    if (again.has("mrp") && again.has("qty") && again.has("date")) {
      map = again;
      continue;
    }
    const qty = num(get(r, "qty"));
    // POS reports put a return as −1 qty at −MRP: keep the MRP per piece positive.
    const mrpIn = num(get(r, "mrp"));
    const mrp = mrpIn < 0 && qty < 0 ? mrpIn / qty : mrpIn;
    const d = date(get(r, "date"));
    if (!(mrp > 0) || isNaN(qty) || qty === 0 || !d) {
      if (r.some((c) => c !== null && c !== undefined && c !== "")) skipped++;
      continue;
    }
    // When the amount the customer paid is there (POS reports: Net Amt / Sale Amt), the discount
    // is what was knocked off the MRP — their "Disc" column is sometimes %, sometimes ₹.
    const rate = num(get(r, "saleRate"));
    const paid = !isNaN(num(get(r, "saleAmt"))) ? num(get(r, "saleAmt")) : rate * Math.abs(qty);
    const fromPaid = !isNaN(paid) ? Math.min(1, 1 - Math.abs(paid) / (mrp * Math.abs(qty))) : undefined; // below 0 when sold above MRP
    const asPct = (v: Cell) => {
      const p = pct(v);
      return p > 1 ? num(v) / (mrp * Math.abs(qty)) : p; // "Disc" of 1,599 on a ₹3,999 piece is rupees, not 1,599%
    };
    const discRaw = fromPaid !== undefined ? undefined : [get(r, "discM"), get(r, "discP"), get(r, "disc")].map(asPct).find((x) => !isNaN(x));
    const typeCell = str(get(r, "type"));
    const disc = +(discRaw ?? fromPaid ?? 0).toFixed(6);
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
      flatDisc: flat > 0 && fromPaid === undefined ? flat : null, // already inside the % worked out from the amount paid
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
