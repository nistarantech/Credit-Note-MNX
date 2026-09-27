import { registerHooks } from "node:module";
registerHooks({ resolve(spec, ctx, next) { try { return next(spec, ctx); } catch { return next(`${spec}.ts`, ctx); } } });
const { default: readXlsx } = await import("read-excel-file/node");
const { readRateSheet } = await import("./lib/rates.ts");
const { DatabaseSync } = await import("node:sqlite");
const R = "/Users/darshan/BRAND REPORT/";
const rates: any[] = [];
for (const f of ["/Users/darshan/Downloads/Purchase US POLOAW-25.xlsx", R + "SALE REPORT 2025-26/DEC-25/US POLO DEC-25/US POLO - Copy.xlsx", R + "SALE REPORT 2025-26/Nov-25/U S POLO STOCK REPORT NOV-25.xlsx", R + "SALE REPORT FY 2026-27/Aug-26/U S POLO STOCK REPORT AUG-26.xlsx"]) for (const s of await readXlsx(f)) rates.push(...readRateSheet(s.data, f.split("/").pop()!));
const byBc = new Map<string, any>(); for (const e of rates) if (e.barcode && !byBc.has(e.barcode)) byBc.set(e.barcode, e);
const db = new DatabaseSync(`${process.env.HOME}/Library/Application Support/Credit Note/data/cn-claims.db`, { readOnly: true });
const sales = db.prepare("select s.* from sales s join brands b on b.id=s.brand_id where b.name='U S Polo' and s.wsp_source like 'Same barcode%'").all() as any[];
const scaled = sales.filter((s) => { const e = byBc.get(s.barcode); return e?.mrp && Math.abs(e.mrp - s.mrp) > 1; });
console.log("barcode-matched:", sales.length, "| scaled because MRP differed:", scaled.length);
for (const s of scaled.slice(0, 6)) { const e = byBc.get(s.barcode); console.log(`  ${s.department} sale MRP ${s.mrp} vs list MRP ${e.mrp}: paid rate ${e.rate} → used ${s.wsp} (${((s.wsp / e.rate - 1) * 100).toFixed(1)}%)`); }
const extra = scaled.reduce((a, s) => a + (s.wsp - byBc.get(s.barcode).rate) * s.qty, 0);
console.log("WSP overstated by ₹" + extra.toFixed(2), "→ CN overstated by the same amount");
