// Purchase rates (WSP) from the brand's invoices, purchase registers and stock
// reports, matched to your sales. A sale's credit note rests on three figures —
// MRP, what the customer paid, and what you paid the brand — so every sale
// should carry the rate it was actually bought at, and say where it came from.
import type { Cell } from "./excel";
import type { Line } from "./calc";

export interface RateEntry {
  barcode: string;
  item: string;
  mrp: number | null;
  season: string;
  rate: number; // per piece, before GST
  source: string; // e.g. "Purchase US POLO AW-25.xlsx · bill 1844483280"
}

const key = (h: Cell) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const num = (v: Cell) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[₹,\s]/g, "")));
const str = (v: Cell) => (v === null || v === undefined ? "" : String(v).trim());
export const normItem = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");

type Field = "barcode" | "item" | "mrp" | "season" | "rate" | "bill" | "qty" | "stockQty" | "stockAmt";
const HEADERS: [RegExp, Field][] = [
  [/^(company)?barcode$|^ean$/, "barcode"],
  [/^itemname$|^item$|^product(name)?$/, "item"],
  // the brand's MRP: "Sales Rate" in purchase registers and stock lists
  [/^mrp$|^rsp$|^salesrate$/, "mrp"],
  [/^season$/, "season"],
  [/^purrate$|^purcrate$|^purchaserate$|^invoicerate$|^wsp$|^purcostrate$|^costrate$|^landingcost$/, "rate"],
  [/^billno$|^invoiceno$/, "bill"],
  [/^qty$|^invoiceqty$/, "qty"],
  [/^clqty$/, "stockQty"],
  [/^clamt$/, "stockAmt"],
];

/**
 * Rates in one sheet: a purchase rate column (Pur. Rate, Purc Rate, Invoice
 * Rate, WSP…) with a barcode or an item + MRP. Stock reports without a rate
 * column give closing value ÷ closing qty — unless that value is at MRP.
 */
export function readRateSheet(rows: Cell[][], source: string): RateEntry[] {
  for (let h = 0; h < Math.min(rows.length, 25); h++) {
    const map = new Map<Field, number>();
    rows[h].forEach((c, i) => {
      const hit = HEADERS.find(([re]) => re.test(key(c)));
      if (hit && !map.has(hit[1])) map.set(hit[1], i);
    });
    const byValue = !map.has("rate") && map.has("stockQty") && map.has("stockAmt");
    if (!(map.has("rate") || byValue) || !(map.has("barcode") || (map.has("item") && map.has("mrp")))) continue;
    const get = (r: Cell[], f: Field) => (map.has(f) ? r[map.get(f)!] : undefined);
    if (byValue) {
      // a stock report valued at MRP (closing value = MRP × qty) says nothing about purchase rates
      const valued = rows.slice(h + 1).filter((r) => num(get(r, "stockQty")) > 0 && num(get(r, "mrp")) > 0);
      const atMrp = valued.filter((r) => num(get(r, "stockAmt")) / num(get(r, "stockQty")) >= num(get(r, "mrp")) * 0.98);
      if (atMrp.length * 2 > valued.length) return [];
    }
    const out: RateEntry[] = [];
    for (const r of rows.slice(h + 1)) {
      const rate = byValue ? num(get(r, "stockAmt")) / num(get(r, "stockQty")) : num(get(r, "rate"));
      const mrp = num(get(r, "mrp"));
      if (!(rate > 0) || !isFinite(rate)) continue;
      if (mrp > 0 && rate >= mrp * 0.98) continue; // valued at MRP, not a purchase rate
      const bill = str(get(r, "bill"));
      out.push({
        barcode: str(get(r, "barcode")),
        item: str(get(r, "item")),
        mrp: mrp > 0 ? mrp : null,
        season: str(get(r, "season")).toUpperCase(),
        rate,
        source: bill ? `${source} · bill ${bill}` : source,
      });
    }
    return out;
  }
  return [];
}

export type RateHow = "barcode" | "item+mrp+season" | "item+mrp" | "mrp" | "design" | "none";
export const HOW_LABEL: Record<RateHow, string> = {
  barcode: "Same barcode",
  "item+mrp+season": "Same item, MRP & season",
  "item+mrp": "Same item & MRP",
  mrp: "Same MRP",
  design: "Same design",
  none: "No rate found",
};

export interface RateMatch {
  id: string;
  how: RateHow;
  wsp: number | null;
  wspSource: string | null;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * The purchase rate of each sale, most specific match first: the same
 * barcode, then the same item at the same MRP (and season), then the same
 * MRP, then another size of the same design. `designOf` gives a barcode's
 * design number when known.
 */
export function matchRates(sales: Pick<Line, "id" | "barcode" | "department" | "mrp" | "ageing">[], rates: RateEntry[], designOf?: (barcode: string) => string | undefined): RateMatch[] {
  const byBarcode = new Map<string, RateEntry>();
  const groups = new Map<string, RateEntry[]>();
  const add = (k: string, e: RateEntry) => groups.set(k, [...(groups.get(k) ?? []), e]);
  for (const e of rates) {
    if (e.barcode && !byBarcode.has(e.barcode)) byBarcode.set(e.barcode, e);
    if (e.mrp) {
      const item = normItem(e.item);
      if (item) {
        add(`ims|${item}|${e.mrp}|${e.season}`, e);
        add(`im|${item}|${e.mrp}`, e);
      }
      add(`m|${e.mrp}`, e);
    }
  }
  const byDesign = new Map<string, number[]>();
  if (designOf) {
    for (const e of rates) {
      const d = e.barcode && designOf(e.barcode);
      if (d && e.mrp) byDesign.set(d, [...(byDesign.get(d) ?? []), e.rate / e.mrp]);
    }
  }
  const near = (k: string) => {
    if (groups.has(k)) return groups.get(k);
    // the same MRP to within ₹1: bills round a revised MRP (3,475.73 → 3,475)
    const [kind, ...rest] = k.split("|");
    const mrpAt = kind === "m" ? 0 : 1;
    const want = +rest[mrpAt];
    for (const [gk, g] of groups) {
      const [gkind, ...grest] = gk.split("|");
      if (gkind !== kind || Math.abs(+grest[mrpAt] - want) > 1) continue;
      if (grest.every((v, i) => i === mrpAt || v === rest[i])) return g;
    }
    return undefined;
  };
  const fromGroup = (k: string) => {
    const g = near(k);
    if (!g?.length) return null;
    const rate = median(g.map((e) => e.rate));
    // one MRP bought at clearly different rates (different styles): not specific enough
    if (Math.max(...g.map((e) => e.rate)) > Math.min(...g.map((e) => e.rate)) * 1.02 && k.startsWith("m|")) return null;
    return { rate, source: g.find((e) => Math.abs(e.rate - rate) < 0.01)!.source };
  };
  return sales.map((s) => {
    const exact = s.barcode ? byBarcode.get(s.barcode) : undefined;
    if (exact) {
      // what was paid for this very piece — a later MRP revision doesn't change it
      return { id: s.id, how: "barcode", wsp: +exact.rate.toFixed(2), wspSource: `${HOW_LABEL.barcode} · ${exact.source}` };
    }
    const item = normItem(s.department);
    const steps: [RateHow, string][] = [
      ["item+mrp+season", `ims|${item}|${s.mrp}|${s.ageing.toUpperCase()}`],
      ["item+mrp", `im|${item}|${s.mrp}`],
      ["mrp", `m|${s.mrp}`],
    ];
    for (const [how, k] of steps) {
      if (how !== "mrp" && !item) continue;
      const hit = fromGroup(k);
      if (hit) return { id: s.id, how, wsp: +hit.rate.toFixed(2), wspSource: `${HOW_LABEL[how]} · ${hit.source}` };
    }
    const d = designOf?.(s.barcode);
    const shares = d ? byDesign.get(d) : undefined;
    if (d && shares?.length) {
      const share = median(shares);
      return { id: s.id, how: "design", wsp: +(share * s.mrp).toFixed(2), wspSource: `${HOW_LABEL.design} ${d} · ${(share * 100).toFixed(1)}% of MRP` };
    }
    return { id: s.id, how: "none", wsp: null, wspSource: null };
  });
}

/** Barcode → design number, from any sheet with a barcode and a Design / DesignNo column. */
export function readDesigns(rows: Cell[][], into: Map<string, string>) {
  let bc = -1;
  let dn = -1;
  for (const r of rows) {
    const heads = r.map(key);
    const b = heads.findIndex((c) => /^(company)?barcode$/.test(c));
    const d = heads.findIndex((c) => /^design(no)?$/.test(c));
    if (b >= 0 && d >= 0) {
      bc = b;
      dn = d;
      continue;
    }
    if (bc >= 0 && r[bc] && r[dn]) into.set(str(r[bc]), str(r[dn]));
  }
  return into;
}
