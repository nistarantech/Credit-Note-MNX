// Sale reports straight from the billing software, in the layouts the store's brands send. Run: npm test
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch {
      return next(`${spec}.ts`, ctx);
    }
  },
});
const { readSheet } = await import("./excel.ts");
const d = new Date("2026-01-05T00:00:00Z");
const one = (header: unknown[], row: unknown[]) => readSheet("S", [header, row] as never)!.sales[0];
const close = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-3, `${msg}: ${a} vs ${b}`);

// Net Amt wins over a "Disc" column that is really rupees
let l = one(["Voucher No", "Voucher Date", "Company Barcode", "Sales Qty", "MRP", "Disc", "Net Amt"], ["NX-1", d, "89", 1, 3999, 1600, 2399]);
close(l.disc, 0.4, "disc from Net Amt");
assert.equal(l.type, "DISC");
// SalesAmt (no space) and a return at −MRP
l = one(["Voucher No", "Voucher Date", "Company Barcode", "Qty", "MRP", "Total Disc", "SalesAmt"], ["NX-2", d, "89", -1, -3299, -1649.5, -1649.5]);
assert.equal(l.mrp, 3299);
assert.equal(l.qty, -1);
close(l.disc, 0.5, "return at half price");
// Sale Rate per piece, no line amount; "Disc" in rupees
l = one(["Voucher No", "Voucher Date", "Company Barcode", "Qty", "MRP", "Disc", "Sale Rate"], ["NX-3", d, "89", 2, 3999, 1599.6, 2399.4]);
close(l.disc, 0.4, "from Sale Rate");
// only a rupee "Disc": read as rupees, not 1,600%
l = one(["Bill Date", "Barcode", "Qty", "MRP", "Disc"], [d, "89", 1, 3999, 1599.6]);
close(l.disc, 0.4, "rupee Disc");
// sold above the MRP column
l = one(["Voucher Date", "Company Barcode", "Sales Qty", "MRP", "Net Amt"], [d, "89", 1, 2999, 3159]);
assert.ok(l.disc < 0, "above MRP keeps the real amount");
// older export: Vch Number, barcode in "Field 2", and a second table further down
const two = readSheet("S", [
  ["Date", "Vch Number", "Group", "Qty", "MRP", "Total Disc", "Amount", "Field 2"],
  [d, "Nx/24/1", "Mens Shirts", 1, 2699, 0, 2699, "8905951533114"],
  ["Voucher No", "Voucher Date", "Item Name", "Company Barcode", "Qty", "MRP", "Total Disc", "Sale amt"],
  ["NX-11", d, "MENS FULL SHIRT", "8909432034497", 1, 3499, null, 3499],
] as never)!;
assert.equal(two.sales.length, 2, "both tables read");
assert.deepEqual(two.sales.map((x) => [x.billNo, x.barcode, x.department]), [["Nx/24/1", "8905951533114", "Mens Shirts"], ["NX-11", "8909432034497", "MENS FULL SHIRT"]]);

console.log("pos reports: ok");

// Purchase rates
const { readRateSheet, matchRates } = await import("./rates.ts");
const register = readRateSheet([
  ["MNX FAMILY STORE"],
  ["Party Name", "Bill No.", "Bill Date", "Item Name", "Qty", "Purc Rate", "Sales Rate", "Tax", "Season"],
  ["ARVIND", "1844483280", d, "KIDS HALF T-SHIRT", 1, 1251.7, 1999, "GST 12 %", "AW-25"],
  ["ARVIND", "1849551611", d, "MENS HALF T-SHIRT", 1, 2031.75, 3499, "GST 5 %", "AW-25"],
] as never, "Purchase.xlsx");
assert.equal(register.length, 2);
const stockAtCost = readRateSheet([["Company Barcode", "Item", "MRP", "CL. Qty", "CL. Amt"], ["890A", "MENS JEANS", 3999, 2, 5141.92]] as never, "Stock.xlsx");
close(stockAtCost[0].rate, 2570.96, "stock value ÷ qty at cost");
const stockAtMrp = readRateSheet([["Company Barcode", "Item", "MRP", "CL. Qty", "CL. Amt"], ["890A", "MENS JEANS", 3999, 2, 7998], ["890B", "MENS JEANS", 2999, 1, 2999]] as never, "Stock.xlsx");
assert.equal(stockAtMrp.length, 0, "stock valued at MRP is not a purchase rate");
const m = matchRates(
  [
    { id: "a", barcode: "890A", department: "MENS JEANS", mrp: 3999, ageing: "AW-24" },
    { id: "b", barcode: "999", department: "Kids Half T-Shirt", mrp: 1999, ageing: "AW-25" },
    { id: "c", barcode: "998", department: "MENS HALF T-SHIRT", mrp: 1299, ageing: "SS-26" },
  ],
  [...stockAtCost, ...register],
);
assert.deepEqual(m.map((x) => [x.how, x.wsp]), [["barcode", 2570.96], ["item+mrp+season", 1251.7], ["none", null]]);
assert.ok(m[1].wspSource!.includes("bill 1844483280"), "source kept");
console.log("purchase rates: ok");
