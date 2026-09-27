// Scheme rules, reconciliation and settlement. Run: npm test
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type { Claim, CnRule, Purchase, Sku, SupplierCn } from "./store.tsx";

// the app imports without extensions
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch {
      return next(`${spec}.ts`, ctx);
    }
  },
});
const { DEFAULT_SETTINGS } = await import("./calc.ts");
const { readCnSheet } = await import("./excel.ts");
const { applyGst, expectedFromRules, reconcile, settlementOf } = await import("./recon.ts");

const close = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`);

// GST on a CN
close(applyGst(100, 0.05, "on_top").gross, 105, "on top");
close(applyGst(105, 0.05, "included").basic, 100, "included");
close(applyGst(100, 0.05, "none").gst, 0, "none");

const rule = (p: Partial<CnRule>): CnRule => ({
  id: "r", brandId: "b", code: "R", name: "R", appliesOn: "purchases", from: "2026-09-01", to: "2026-09-30", base: "wsp", rate: 0.2,
  gstTreatment: "none", gstRate: null, match: { barcodes: [], category: "", division: "", department: "" }, minQty: null, maxQty: null,
  priority: 10, stacking: false, active: true, remarks: "", createdAt: "", ...p,
});
const buy = (p: Partial<Purchase>): Purchase => ({
  id: "p1", brandId: "b", date: "2026-09-10", invoiceNo: "INV1", barcode: "BB001", division: "", department: "", category: "SHIRT", season: "",
  rate: 3499, mrp: 4999, qty: 1, gross: 3499, tax: 174.95, net: 3673.95, importId: null, ...p,
});
const sku: Sku = {
  id: "k", brandId: "b", sku: "BB001", barcode: "BB001", name: "", division: "", department: "", category: "SHIRT", subCategory: "", size: "", colour: "",
  hsn: "", season: "", cnEligible: true, active: true, createdAt: "",
  prices: [{ from: "2026-01-01", mrp: 4999, wsp: 3499, purchaseRate: 2200, gstRate: 0.05, source: "" }],
};
const run = (rules: CnRule[], purchases: Purchase[], skus = [sku]) =>
  expectedFromRules({ rules, purchases, sales: [], skus, settings: DEFAULT_SETTINGS, from: "2026-09-01", to: "2026-09-30" });

// The report's example: 20% on WSP ₹3,499 = ₹699.80; on purchase rate ₹2,200 = ₹440
close(run([rule({})], [buy({})]).lines[0].basic, 699.8, "20% of WSP");
close(run([rule({ base: "purchase_rate" })], [buy({})]).lines[0].basic, 440, "20% of purchase rate");
close(run([rule({ base: "qty", rate: 300 })], [buy({ qty: 3 })]).lines[0].basic, 900, "₹300 per piece");
close(run([rule({ gstTreatment: "on_top" })], [buy({})]).lines[0].gross, 699.8 * 1.05, "GST on top, line rate");
// dates, filters, eligibility, min / max
assert.equal(run([rule({ from: "2026-10-01", to: null })], [buy({})]).lines.length, 0, "rule not yet in force");
assert.equal(run([rule({ match: { barcodes: [], category: "TROUSER", division: "", department: "" } })], [buy({})]).lines.length, 0, "category filter");
assert.equal(run([rule({})], [buy({})], [{ ...sku, cnEligible: false }]).lines.length, 0, "SKU not CN-eligible");
assert.equal(run([rule({ active: false })], [buy({})]).lines.length, 0, "inactive rule");
assert.equal(run([rule({ minQty: 5 })], [buy({ qty: 3 })]).lines.length, 0, "below minimum qty");
close(run([rule({ base: "qty", rate: 100, maxQty: 4 })], [buy({ qty: 3 }), buy({ id: "p2", qty: 3 })]).lines.reduce((a, l) => a + l.basic, 0), 400, "max qty cap");
// priority: first non-stacking rule wins, stacking adds
const two = run([rule({ id: "a", priority: 1, rate: 0.1 }), rule({ id: "b", priority: 2, rate: 0.2 }), rule({ id: "c", priority: 3, base: "qty", rate: 50, stacking: true })], [buy({})]);
assert.deepEqual(two.lines.map((l) => l.ruleId).sort(), ["a", "c"], "priority + stacking");

// Reconciliation
const expected = run([rule({ gstTreatment: "on_top" })], [buy({}), buy({ id: "p2", barcode: "BB002", invoiceNo: "INV2" })], [sku, { ...sku, id: "k2", sku: "BB002", barcode: "BB002" }]).lines;
const cn = (lines: SupplierCn["lines"]): SupplierCn => ({
  id: "cn", number: "CN1", brandId: "b", claimId: "c", date: "2026-10-05", from: null, to: null, basic: 0, gst: 0,
  gross: lines.reduce((a, l) => a + l.gross, 0), disputed: false, fileName: "", storedPath: null, remarks: "", lines, createdAt: "",
});
const line = (barcode: string, basic: number, gst: number) => ({ id: barcode, invoiceNo: "", barcode, qty: 1, basic, gstRate: 0.05, gst, gross: basic + gst, remarks: "" });
let r = reconcile(expected, [cn([line("BB001", 699.8, 34.99), line("BB002", 699.8, 34.99)])]);
assert.equal(r.status, "matched", "all lines match");
r = reconcile(expected, [cn([line("BB001", 600, 30)])]);
assert.deepEqual([r.counts.short, r.counts.missing], [1, 1], "short + missing");
close(r.short, expected.reduce((a, l) => a + l.gross, 0) - 630, "shortfall total");
r = reconcile(expected, [cn([line("BB001", 699.8, 50), line("BB002", 699.8, 34.99), line("ZZ9", 10, 0)])]);
assert.ok(r.rows.find((x) => x.key === "BB001")!.notes.some((n) => n.startsWith("GST differs")), "GST difference noted");
assert.equal(r.rows.find((x) => x.key === "ZZ9")!.status, "excess", "line not in the claim is excess");
r = reconcile(expected, [{ ...cn([]), gross: 1469.58 }]);
assert.equal(r.by, "total", "header-only CN is checked as a total");
assert.equal(r.status, "matched", "total within tolerance");

// Settlement
const claim = { total: 1000, approvedAmount: null } as Claim;
const st = settlementOf(claim, [{ ...cn([]), gross: 900 }], [
  { id: "1", claimId: "c", date: "", kind: "adjusted", amount: 900, reference: "", remarks: "", createdAt: "" },
  { id: "2", claimId: "c", date: "", kind: "write_off", amount: 100, reference: "", remarks: "", createdAt: "" },
]);
assert.equal(st.status, "settled", "adjusted + written off = settled");
assert.equal(settlementOf(claim, [{ ...cn([]), gross: 900 }], []).toRecover, 100, "still to recover");

// Reading a supplier CN sheet
const sheet = readCnSheet("CN", [
  ["Credit Note", "", "", "", "", ""],
  ["CN No", "CN Date", "Invoice No", "Barcode", "Qty", "Taxable Value", "CGST", "SGST", "Total"],
  ["CN/77", "05-10-2026", "INV1", "BB001", 1, 699.8, 17.5, 17.49, 734.79],
  ["", "", "", "Total", "", 699.8, "", "", 734.79],
])!;
assert.equal(sheet.number, "CN/77");
assert.equal(sheet.date, "2026-10-05");
assert.equal(sheet.lines.length, 1, "total row left out");
close(sheet.lines[0].gst, 34.99, "CGST + SGST");

console.log("recon: ok");
