// The claim report as an Excel workbook: the same working as the printed claim
// (sheet "Claim") and every sale in it (sheet "Sales"), for sending on.
import { calcRow, inWords, summarize, type Line, type Settings } from "./calc";
import type { Brand, Business, Claim } from "./store";

type Cell = { value?: string | number | Date | null; type?: typeof Number | typeof String | typeof Date; format?: string; fontWeight?: "bold"; columnSpan?: number; backgroundColor?: string; align?: "left" | "center" | "right" } | null;

const MONEY = "#,##0.00";
const PCT = "0.00%";
const DATE = "dd-mmm-yyyy";

const text = (value: string, extra: Partial<NonNullable<Cell>> = {}): Cell => ({ value, type: String, ...extra });
const money = (value: number, extra: Partial<NonNullable<Cell>> = {}): Cell => ({ value: Math.round(value * 100) / 100, type: Number, format: MONEY, ...extra });
const num = (value: number): Cell => ({ value, type: Number });
const pct = (value: number | null): Cell => (value === null || !isFinite(value) ? text("—") : { value, type: Number, format: PCT });
const day = (d: string): Cell => (d ? { value: new Date(`${d}T00:00:00Z`), type: Date, format: DATE } : text("—"));
const bold = (value: string): Cell => text(value, { fontWeight: "bold" });
const heading = (value: string): Cell => text(value, { fontWeight: "bold", backgroundColor: "#E8EEF4", columnSpan: 2 });

export interface ClaimExcelInput {
  business: Business;
  number: string;
  date: string;
  from: string;
  to: string;
  remarks: string;
  brand: Brand;
  settings: Settings;
  lines: Line[];
  received?: Claim["received"];
}

export function claimSheets({ business, number, date, from, to, remarks, brand, settings, lines, received }: ClaimExcelInput) {
  const s = summarize(lines, settings);
  // same as the printed claim: EOSS working, or fresh working for a claim of fresh sales only
  const freshOnly = !s.disc.qty && !!s.fresh.qty;
  const kind = freshOnly ? "Fresh" : "EOSS";
  const w = freshOnly ? s.fresh : s.disc;
  const b = { qty: w.qty, mrpValue: w.mrpValue, wsp: w.wspValue, gst: w.gstB2BValue, total: w.wspValue + w.gstB2BValue };
  const notW = w.realization - w.gstB2C;
  const companyW = notW - w.cashbackAmt - w.margin;
  const m = { rv: w.realization, taxB2C: -w.gstB2C, not: notW, cashback: -w.cashbackAmt, dealer: -w.margin, company: companyW, gst: w.gstB2BValue, netReceivable: companyW + w.gstB2BValue };
  const rows: Cell[][] = [];
  const pair = (label: string, value: Cell) => rows.push([text(label), value]);
  const gap = () => rows.push([]);
  const pc = (x: number) => `${Math.round(x * 100)}%`;

  rows.push([text(business.name || "Your business name", { fontWeight: "bold", columnSpan: 2 }), null]);
  if (business.address) rows.push([text(business.address.replace(/\n/g, ", "), { columnSpan: 2 }), null]);
  const contact = [business.gstNo && `GSTIN ${business.gstNo}`, business.phone, business.email].filter(Boolean).join(" · ");
  if (contact) rows.push([text(contact, { columnSpan: 2 }), null]);
  gap();
  rows.push([text("Credit Note Claim", { fontWeight: "bold", columnSpan: 2 }), null]);
  pair("EOSS credit note sharing working", text(brand.season));
  pair("Claim no.", text(number));
  pair("Date", day(date));
  pair("Period from", day(from));
  pair("Period to", day(to));
  gap();

  rows.push([heading("To"), null]);
  pair("Brand", bold(brand.name));
  if (brand.address) pair("Address", text(brand.address.replace(/\n/g, ", ")));
  if (brand.gstNo) pair("GSTIN", text(brand.gstNo));
  pair("Deal", text(brand.dealName || `${pc(settings.freshMargin)}/${pc(settings.discMargin)}`));
  pair("Our margin (Fresh / EOSS)", text(`${pc(settings.freshMargin)} / ${pc(settings.discMargin)}`));
  if (settings.termChanges?.length) {
    pair("Terms changed", text(settings.termChanges.map((c) => `from ${c.from}: ${pc(c.freshMargin)} / ${pc(c.discMargin)}`).join("; ")));
  }
  if (settings.marginSlabs.length) {
    pair("Margin by discount", text(settings.marginSlabs.map((x) => `${x.type === "DISC" ? "EOSS" : "Fresh"} ≤${pc(x.upTo)}: ${pc(x.margin)}`).join(", ")));
  }
  pair("Applicability", text(brand.applicability || "—"));
  pair("Conditions", text(brand.conditions || "—"));
  pair("First season", text(brand.firstSeason || "—"));
  gap();

  rows.push([heading("Sales in this claim"), null]);
  for (const [label, t, cn] of [["EOSS (discounted)", s.disc, s.eossCn], ["Fresh (full price)", s.fresh, s.freshCn], ["Total", s.all, s.totalCn]] as const) {
    const b = label === "Total" ? "bold" : undefined;
    rows.push([text(label, b ? { fontWeight: b } : {}), text(`${t.qty} pcs`, b ? { fontWeight: b } : {})]);
    pair("   MRP value", money(t.mrpValue));
    pair("   Sale value", money(t.realization, b ? { fontWeight: b } : {}));
    pair("   WSP", money(t.wspValue));
    pair("   Our margin", money(t.margin));
    pair("   Credit", money(cn, b ? { fontWeight: b } : {}));
  }
  gap();

  rows.push([heading(`Billing working — ${kind} sales${b.qty !== s.all.qty ? ` only (${b.qty} of ${s.all.qty} pcs)` : ""}`), null]);
  pair("Pieces sold", num(b.qty));
  pair("MRP value", money(b.mrpValue));
  pair("WSP", money(b.wsp));
  pair("Add: GST", money(b.gst));
  rows.push([bold("Billed to us by the brand"), money(b.total, { fontWeight: "bold" })]);
  gap();

  rows.push([heading(`Margin working — ${kind} sales${b.qty !== s.all.qty ? " only" : ""}`), null]);
  pair("Sale value (R.V.)", money(m.rv));
  if (w.flatDiscAmt) pair("(after flat discounts of)", money(w.flatDiscAmt));
  pair("Less: GST in sale", money(m.taxB2C));
  pair("Net of tax", money(m.not));
  if (m.cashback) pair("Less: cashback to customers", money(m.cashback));
  pair("Less: our margin", money(m.dealer));
  pair("Brand's share", money(m.company));
  pair("Add: GST", money(m.gst));
  rows.push([bold("Payable to brand"), money(m.netReceivable, { fontWeight: "bold" })]);
  gap();

  if (freshOnly) pair("Credit on fresh sales (billed − payable)", money(s.freshCn));
  else {
    pair("Credit on EOSS sales (billed − payable)", money(s.eossCn));
    if (s.fresh.qty) pair("Credit on fresh sales (sale by sale)", money(s.freshCn));
  }
  rows.push([text("Credit note claimed", { fontWeight: "bold", backgroundColor: "#FFF4CC" }), money(s.totalCn, { fontWeight: "bold", backgroundColor: "#FFF4CC" })]);
  pair("In words", text(inWords(s.totalCn)));
  if (s.cnPctOfMrp !== null) pair(`CN % of MRP received × ${pc(settings.cnBasePct)}`, pct(s.cnPctOfMrp));
  gap();

  rows.push([heading("Received from brand this season"), null]);
  pair("Pieces", num(settings.dispatch.qty));
  pair("MRP value", money(settings.dispatch.mrp));
  pair("Billing value (WSP + GST)", money(s.dispatchBilling));
  pair("Goods sold in EOSS", pct(s.goodsSoldPct));
  pair("EOSS discount hit", pct(s.discHitPct));
  gap();

  rows.push([heading(`Month-wise — ${kind}`), null]);
  const byMonth = new Map<string, { qty: number; cn: number }>();
  for (const l of lines) {
    const r = calcRow(l, settings);
    if ((r.type === "FRESH") !== freshOnly) continue;
    const t = byMonth.get(r.date.slice(0, 7)) ?? { qty: 0, cn: 0 };
    byMonth.set(r.date.slice(0, 7), { qty: t.qty + r.qty, cn: t.cn + r.cn });
  }
  if (!byMonth.size) pair(`No ${kind} sales`, text("—"));
  for (const [month, t] of [...byMonth].sort(([a], [x]) => a.localeCompare(x))) pair(`${month} · ${t.qty} pcs`, money(t.cn));

  if (received) {
    gap();
    rows.push([heading("Brand's credit note"), null]);
    pair("CN number", text(received.cnNumber || "—"));
    pair("CN date", day(received.cnDate));
    pair("Amount credited", money(received.amount));
    pair("Short (+) / over (−) credited", money(s.totalCn - received.amount));
  }
  if (remarks) {
    gap();
    rows.push([heading("Remarks"), null]);
    rows.push([text(remarks.replace(/\n/g, " "), { columnSpan: 2 }), null]);
  }

  // Annexure: every sale with its working.
  const calc = [...lines].sort((a, x) => a.date.localeCompare(x.date)).map((l) => calcRow(l, settings));
  const head = [
    "Date", "Bill", "Barcode", "Division", "Department", "Type", "Disc %", "MRP", "Qty", "MRP value", "Sale value",
    "GST rate", "GST in sale", "Margin %", "Margin", "Net payable", "WSP / pc", "WSP value", "WSP source", "GST (B-B)", "Credit",
  ].map((h) => text(h, { fontWeight: "bold", backgroundColor: "#E8EEF4" }));
  const sales: Cell[][] = [head];
  for (const r of calc) {
    sales.push([
      day(r.date), text(r.billNo), text(r.barcode), text(r.division), text(r.department), text(r.type === "DISC" ? "EOSS" : "Fresh"),
      pct(r.disc), money(r.mrp), num(r.qty), money(r.mrpValue), money(r.realization), pct(r.gstRate), money(r.gstB2C),
      pct(r.marginPct), money(r.margin), money(r.netPayable), money(r.qty ? r.wspValue / r.qty : 0), money(r.wspValue),
      text(r.wspEstimated ? `Estimated: MRP × ${settings.wspFactor}` : r.wspSource || "Entered with the sale"), money(r.gstB2BValue), money(r.cn),
    ]);
  }
  const t = s.all;
  const tb = (v: number) => money(v, { fontWeight: "bold" });
  sales.push([
    bold("Total"), null, null, null, null, null, null, null, num(t.qty), tb(t.mrpValue), tb(t.realization), null, tb(t.gstB2C),
    null, tb(t.margin), tb(t.netPayable), null, tb(t.wspValue), null, tb(t.gstB2BValue), tb(t.cn),
  ]);

  return [
    { data: rows, sheet: "Claim", columns: [{ width: 42 }, { width: 28 }] },
    {
      data: sales,
      sheet: "Sales",
      stickyRowsCount: 1,
      columns: [12, 10, 16, 12, 16, 8, 8, 10, 6, 12, 12, 9, 12, 9, 12, 12, 10, 12, 40, 11, 12].map((width) => ({ width })),
    },
  ];
}

/** Saves the claim as .xlsx: through the desktop app's save dialog, or as a browser download. */
export async function saveClaimExcel(input: ClaimExcelInput): Promise<string | null> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob: Blob = await (writeXlsxFile as any)(claimSheets(input), { fontFamily: "Calibri", fontSize: 11 }).toBlob();
  const fileName = `${input.number.replace(/[\\/]/g, "-")} ${input.brand.name}.xlsx`;
  const desktop = typeof window !== "undefined" ? window.desktop : undefined;
  if (desktop?.saveFile) return desktop.saveFile(fileName, await blob.arrayBuffer());
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
  return fileName;
}
