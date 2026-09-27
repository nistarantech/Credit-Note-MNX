// Parity check against NIKHIL.xlsx (fixture.json = every sale row of AW'25EOSS + SUMMARY totals).
import { readFileSync } from "node:fs";
import { calcRow, summarize, DEFAULT_SETTINGS, type Line } from "./calc.ts";

const fx = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
let bad = 0;
const lines: Line[] = fx.rows.map((r: any) => ({
  id: String(r.row), date: r.date, billNo: "", barcode: "", division: "", department: "", ageing: "",
  type: r.type, disc: r.disc, mrp: r.mrp, qty: r.qty,
  wsp: r.W / r.qty, gstB2B: r.X,
}));
const cols = { N: "mrpValue", Q: "realization", R: "gstB2C", T: "margin", U: "netPayable" } as const;
lines.forEach((l, i) => {
  const r = fx.rows[i], out = calcRow(l, DEFAULT_SETTINGS);
  for (const [c, k] of Object.entries(cols)) {
    if (Math.abs(out[k] - r[c]) > 0.01) { bad++; if (bad < 10) console.log(`row ${r.row} ${c}: excel ${r[c]} app ${out[k]}`); }
  }
});
const s = summarize(lines, DEFAULT_SETTINGS), x = fx.summary;
const cmp: [string, number, number][] = [
  ["E17 billing", x.E17, s.billing.total], ["H17 net receivable", x.H17, s.marginWorking.netReceivable],
  ["B25 EOSS CN", x.B25, s.eossCn], ["B26 fresh CN", x.B26, s.freshCn], ["B27 total CN", x.B27, s.totalCn],
];
for (const [n, e, a] of cmp) console.log(`${n.padEnd(20)} excel ${e.toFixed(2).padStart(12)}  app ${a.toFixed(2).padStart(12)}  diff ${(a - e).toFixed(2)}`);
console.log(`${fx.rows.length} rows, ${bad} cell mismatches`);

// GST rate history and per-sale overrides
const base: Line = { id: "t", date: "2026-01-10", billNo: "", barcode: "", division: "", department: "", ageing: "", type: "DISC", disc: 0.5, mrp: 2999, qty: 1, wsp: null, gstB2B: null };
const checks: [string, number, number][] = [
  // WSP 1874.38 > ₹1,000 and bought before 22 Sep 2025 → 12% on the brand's bill
  ["B-B GST, bought Jul 2025", calcRow({ ...base, purchaseDate: "2025-07-21" }, DEFAULT_SETTINGS).gstB2BRate, 0.12],
  // same piece bought after GST 2.0 → 5% (≤ ₹2,500)
  ["B-B GST, bought Oct 2025", calcRow({ ...base, purchaseDate: "2025-10-05" }, DEFAULT_SETTINGS).gstB2BRate, 0.05],
  // no invoice date → the sale date decides
  ["B-B GST, no invoice date", calcRow(base, DEFAULT_SETTINGS).gstB2BRate, 0.05],
  // sold in Aug 2025 at ₹1,499.50 → 12% in the sale price; fixed to 5% for this sale
  ["B-C GST, Aug 2025", calcRow({ ...base, date: "2025-08-10" }, DEFAULT_SETTINGS).gstRate, 0.12],
  ["B-C GST, fixed 5%", calcRow({ ...base, date: "2025-08-10", gstRateOverride: 0.05 }, DEFAULT_SETTINGS).gstRate, 0.05],
  ["margin, brand terms", calcRow(base, DEFAULT_SETTINGS).marginPct, 0.2],
  ["margin, custom 25%", calcRow({ ...base, marginOverride: 0.25 }, DEFAULT_SETTINGS).marginPct, 0.25],
];
for (const [name, got, want] of checks) {
  const ok = Math.abs(got - want) < 1e-9;
  if (!ok) bad++;
  console.log(`${ok ? "ok " : "BAD"} ${name}: ${got}`);
}
process.exit(bad ? 1 : 0);
