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
process.exit(bad ? 1 : 0);
