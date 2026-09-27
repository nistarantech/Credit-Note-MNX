// Reads NIKHIL.xlsx the way the import dialog does and checks it against the sheet's own totals.
import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";

registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch {
      return next(`${spec}.ts`, ctx);
    }
  },
});

const FILE = process.env.XLSX ?? `${process.env.HOME}/Downloads/NIKHIL.xlsx`;
if (!existsSync(FILE)) {
  console.log(`skipped: ${FILE} not found`);
  process.exit(0);
}
const { default: readXlsx } = await import("read-excel-file/node");
const { readSheet } = await import("./excel.ts");
const { DEFAULT_SETTINGS, summarize } = await import("./calc.ts");

const sheets = (await readXlsx(readFileSync(FILE))) as { sheet: string; data: unknown[][] }[];
let ok = true;
for (const { sheet, data } of sheets) {
  const found = readSheet(sheet, data as never);
  if (!found) {
    console.log(`${sheet.padEnd(12)} —`);
    continue;
  }
  const byMonth = new Map<string, number>();
  for (const x of [...found.sales, ...found.purchases]) byMonth.set(x.date.slice(0, 7), (byMonth.get(x.date.slice(0, 7)) ?? 0) + 1);
  console.log(`${sheet.padEnd(12)} ${found.kind.padEnd(9)} header row ${found.headerRow}, ${found.sales.length + found.purchases.length} rows, ${found.skipped} skipped`, Object.fromEntries(byMonth));
  if (found.kind === "sales") {
    const s = summarize(found.sales, DEFAULT_SETTINGS);
    console.log(`  EOSS CN ${s.eossCn.toFixed(2)} (sheet 325665.07)`);
    ok &&= found.sales.length === 1058 && Math.abs(s.eossCn - 325665.07) < 0.05;
  } else {
    const q = found.purchases.reduce((a, p) => a + p.qty, 0);
    const g = found.purchases.reduce((a, p) => a + p.gross, 0);
    console.log(`  qty ${q}, gross ${g.toFixed(2)}`);
  }
}
console.log(ok ? "OK" : "MISMATCH");
process.exit(ok ? 0 : 1);
