"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_SETTINGS, uid, withGstHistory, type Line, type MarginSlab, type Settings, type TermChange } from "./calc";
import { desktopDb, diff, fromSnapshot, isEmpty, settingsFixups } from "./persist";
import { DEFAULT_TOLERANCE, settlementOf, type ExpectedLine, type Tolerance } from "./recon";

/**
 * A brand (supplier) you buy from and claim credit notes from. Every brand has
 * its own terms — your margin on fresh and EOSS sales, margin slabs by
 * discount, WSP factor, CN base — so the same sale can earn a different
 * credit note from two brands.
 */
export interface Brand {
  id: string;
  code: string;
  name: string;
  gstNo: string;
  address: string;
  contactPerson: string;
  phone: string;
  season: string;
  applicability: string;
  conditions: string;
  firstSeason: string;
  dealName: string; // e.g. "30/20/10", printed on the claim
  freshMargin: number;
  discMargin: number;
  marginSlabs: MarginSlab[];
  wspFactor: number;
  termChanges: TermChange[]; // later terms from a date (the fields above are the original terms)
  cnBasePct: number | null; // null = use the global setting
  dispatch: Settings["dispatch"];
  active: boolean;
  memo: string;
  supplierId: string | null; // the company / distributor that bills this brand
  createdAt: string;
}

/** How GST sits on a supplier's credit note. */
export type GstTreatment = "on_top" | "included" | "none";

/** The company or distributor that bills you and issues the credit notes. */
export interface Supplier {
  id: string;
  code: string;
  name: string;
  gstNo: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  cnCycle: "monthly" | "quarterly" | "season" | "other";
  gstTreatment: GstTreatment;
  settlementMode: "adjustment" | "refund" | "credit_note";
  active: boolean;
  createdAt: string;
}

/** A SKU's prices from a date on. MRP, WSP and purchase rate are kept apart — never interchangeable. */
export interface SkuPrice {
  from: string;
  mrp: number;
  wsp: number | null;
  purchaseRate: number | null;
  gstRate: number | null;
  source: string;
}

export interface Sku {
  id: string;
  brandId: string;
  sku: string;
  barcode: string;
  name: string;
  division: string;
  department: string;
  category: string;
  subCategory: string;
  size: string;
  colour: string;
  hsn: string;
  season: string;
  cnEligible: boolean;
  active: boolean;
  prices: SkuPrice[];
  createdAt: string;
}

/** What a scheme's credit note is worked out on. */
export type CnBase = "wsp" | "purchase_rate" | "mrp" | "taxable" | "sale_value" | "qty" | "fixed_line";

/** A scheme / CN rule agreed with a brand, for a date range. */
export interface CnRule {
  id: string;
  brandId: string;
  code: string;
  name: string;
  appliesOn: "purchases" | "sales";
  from: string;
  to: string | null;
  base: CnBase;
  rate: number; // 0.2 = 20% on value bases; ₹ for qty / fixed_line
  gstTreatment: GstTreatment;
  gstRate: number | null; // null = the line's own GST rate
  match: { barcodes: string[]; category: string; division: string; department: string };
  minQty: number | null;
  maxQty: number | null;
  priority: number; // lower runs first
  stacking: boolean; // also applies on top of another rule
  active: boolean; // only active rules are used
  remarks: string;
  createdAt: string;
}

export interface SupplierCnLine {
  id: string;
  invoiceNo: string;
  barcode: string; // SKU or barcode
  qty: number | null;
  basic: number;
  gstRate: number | null;
  gst: number;
  gross: number;
  remarks: string;
}

/** A credit note the supplier actually issued. */
export interface SupplierCn {
  id: string;
  number: string;
  brandId: string;
  claimId: string | null;
  date: string;
  from: string | null;
  to: string | null;
  basic: number;
  gst: number;
  gross: number;
  disputed: boolean; // under dispute: not counted as received
  fileName: string;
  storedPath: string | null;
  remarks: string;
  lines: SupplierCnLine[];
  createdAt: string;
}

/** A step in closing a claim: CN adjusted against payables, refunded, or a shortfall written off. */
export interface SettlementEntry {
  id: string;
  claimId: string;
  date: string;
  kind: "adjusted" | "refund" | "write_off";
  amount: number;
  reference: string;
  remarks: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  module: "brands" | "skus" | "rules" | "claims" | "supplier_cns" | "settlements" | "settings" | "suppliers";
  recordId: string;
  action: string;
  detail: string;
  before: unknown;
  after: unknown;
  reason: string;
}

export interface Sale extends Line {
  brandId: string;
  claimId: string | null; // set once the sale is included in a claim
  importId?: string | null; // the Excel import it came from; absent when typed in
}

/** A line of the brand's invoice to you (the DISPATCH sheet). */
export interface Purchase {
  id: string;
  brandId: string;
  date: string;
  invoiceNo: string;
  barcode: string;
  division: string;
  department: string;
  category: string;
  season: string;
  rate: number; // WSP per piece
  mrp: number;
  qty: number;
  gross: number;
  tax: number;
  net: number;
  importId: string | null;
}

/** One brand-month of one imported Excel file. */
export interface ImportRecord {
  id: string;
  brandId: string;
  kind: "sales" | "purchases";
  month: string;
  fileName: string;
  sheet: string;
  storedPath: string | null;
  rowCount: number;
  importedAt: string;
}

/** Where a claim is: claimed → CN received → settled, or disputed. The first three move on their own. */
export type ClaimStatus = "claimed" | "cn_received" | "settled" | "disputed";

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  claimed: "Claimed",
  cn_received: "CN received",
  settled: "Settled",
  disputed: "Disputed",
};

/**
 * A credit note claim you raised on a brand — a frozen copy of the brand's
 * terms and the sales (or scheme lines) it covers. What the brand credited is
 * in its supplier CNs; how it was closed, in its settlement entries.
 */
export interface Claim {
  id: string;
  number: string; // your claim reference
  kind: "sales" | "scheme"; // margin support on your sales, or a scheme rule's CN
  date: string;
  month: string | null; // "2025-09" for a month-end claim
  from: string;
  to: string;
  brandId: string;
  brand: Brand;
  settings: Settings;
  lines: Line[]; // sales claims
  schemeLines: ExpectedLine[]; // scheme claims
  total: number;
  approvedAmount: number | null; // what the supplier agreed to; null = the claim total
  remarks: string;
  createdAt: string;
  status: ClaimStatus;
}

/** What raiseClaim needs; number, status and dates are filled in by the store. */
export type ClaimDraft = Omit<Claim, "id" | "number" | "createdAt" | "status" | "approvedAmount">;

/** You — the retailer claiming the credit notes; printed at the top of each claim. */
export interface Business {
  name: string;
  gstNo: string;
  address: string;
  phone: string;
  email: string;
}

/** Rules shared by every brand. */
export interface Globals {
  b2cSlabs: Settings["b2cSlabs"];
  roundGstFactor: boolean;
  b2bSlabs: Settings["b2bSlabs"]; // GST on the brand's bill, by invoice date
  cnBasePct: number;
  claimPrefix: string;
  nextClaimNo: number;
  business: Business;
  defaults: { freshMargin: number; discMargin: number; wspFactor: number };
  tolerance: Tolerance; // reconciliation: ₹ per line, ₹ GST per line, pieces
}

export interface Data {
  globals: Globals;
  suppliers: Supplier[];
  brands: Brand[];
  skus: Sku[];
  rules: CnRule[];
  sales: Sale[];
  purchases: Purchase[];
  imports: ImportRecord[];
  claims: Claim[];
  supplierCns: SupplierCn[];
  settlements: SettlementEntry[];
  audit: AuditEntry[];
  currentBrandId: string | null;
}

export const DEFAULT_GLOBALS: Globals = {
  b2cSlabs: DEFAULT_SETTINGS.b2cSlabs,
  roundGstFactor: DEFAULT_SETTINGS.roundGstFactor,
  b2bSlabs: DEFAULT_SETTINGS.b2bSlabs,
  cnBasePct: DEFAULT_SETTINGS.cnBasePct,
  claimPrefix: "CLM/25-26/",
  nextClaimNo: 1,
  business: { name: "", gstNo: "", address: "", phone: "", email: "" },
  defaults: {
    freshMargin: DEFAULT_SETTINGS.freshMargin,
    discMargin: DEFAULT_SETTINGS.discMargin,
    wspFactor: DEFAULT_SETTINGS.wspFactor,
  },
  tolerance: DEFAULT_TOLERANCE,
};

const EMPTY: Data = {
  globals: DEFAULT_GLOBALS, suppliers: [], brands: [], skus: [], rules: [], sales: [], purchases: [], imports: [], claims: [],
  supplierCns: [], settlements: [], audit: [], currentBrandId: null,
};
const KEY = "credit-note-app:data:v3";
const OLD_KEY = "credit-note-app:data:v2"; // parties / notes, before brands and claims

export function newBrand(g: Globals, patch: Partial<Brand> = {}): Brand {
  return {
    id: uid(),
    code: "",
    name: "",
    gstNo: "",
    address: "",
    contactPerson: "",
    phone: "",
    season: "AW'25",
    applicability: "AW'25 onwards",
    conditions: "",
    firstSeason: "",
    dealName: "",
    ...g.defaults,
    marginSlabs: [],
    termChanges: [],
    cnBasePct: null,
    dispatch: { qty: 0, mrp: 0, wsp: 0, gst: 0 },
    active: true,
    memo: "",
    supplierId: null,
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

export function newSupplier(patch: Partial<Supplier> = {}): Supplier {
  return {
    id: uid(), code: "", name: "", gstNo: "", contactPerson: "", phone: "", email: "", address: "",
    cnCycle: "monthly", gstTreatment: "included", settlementMode: "adjustment", active: true, createdAt: new Date().toISOString(),
    ...patch,
  };
}

export function newSku(brandId: string, patch: Partial<Sku> = {}): Sku {
  return {
    id: uid(), brandId, sku: "", barcode: "", name: "", division: "", department: "", category: "", subCategory: "", size: "",
    colour: "", hsn: "", season: "", cnEligible: true, active: true, prices: [], createdAt: new Date().toISOString(),
    ...patch,
  };
}

export function newRule(brandId: string, patch: Partial<CnRule> = {}): CnRule {
  return {
    id: uid(), brandId, code: "", name: "", appliesOn: "purchases", from: new Date().toISOString().slice(0, 10), to: null,
    base: "wsp", rate: 0.1, gstTreatment: "included", gstRate: null, match: { barcodes: [], category: "", division: "", department: "" },
    minQty: null, maxQty: null, priority: 10, stacking: false, active: true, remarks: "", createdAt: new Date().toISOString(),
    ...patch,
  };
}

/** The formula inputs for one brand: global GST rules + that brand's deal. */
export function calcSettings(g: Globals, p: Brand | undefined): Settings {
  return {
    freshMargin: p?.freshMargin ?? g.defaults.freshMargin,
    discMargin: p?.discMargin ?? g.defaults.discMargin,
    marginSlabs: p?.marginSlabs ?? [],
    wspFactor: p?.wspFactor ?? g.defaults.wspFactor,
    termChanges: p?.termChanges ?? [],
    b2cSlabs: g.b2cSlabs,
    roundGstFactor: g.roundGstFactor,
    b2bSlabs: g.b2bSlabs,
    cnBasePct: p?.cnBasePct ?? g.cnBasePct,
    dispatch: p?.dispatch ?? { qty: 0, mrp: 0, wsp: 0, gst: 0 },
  };
}

/** Fill in fields added since the data was saved (older versions, restored backups). */
function normalize(d: Partial<Data>): Data {
  const globals: Globals = withGstHistory({
    ...DEFAULT_GLOBALS,
    ...d.globals,
    b2bSlabs: d.globals?.b2bSlabs ?? [], // an older single `b2b` rule becomes history below
    defaults: { ...DEFAULT_GLOBALS.defaults, ...d.globals?.defaults },
    business: { ...DEFAULT_GLOBALS.business, ...d.globals?.business },
  });
  // Claims saved before v4 had only raised / received, with the brand's CN kept on the claim.
  type OldClaim = Omit<Claim, "status"> & { status?: string; received?: { cnNumber: string; cnDate: string; amount: number } | null };
  const oldStatus: Record<string, ClaimStatus> = { raised: "claimed", received: "cn_received" };
  const supplierCns = [...(d.supplierCns ?? [])];
  const claims = ((d.claims ?? []) as OldClaim[]).map(({ received, ...n }): Claim => {
    if (received && !supplierCns.some((c) => c.claimId === n.id)) {
      supplierCns.push({
        id: `cn-${n.id}`, number: received.cnNumber, brandId: n.brandId, claimId: n.id, date: received.cnDate || n.date, from: n.from, to: n.to,
        basic: received.amount, gst: 0, gross: received.amount, disputed: false, fileName: "", storedPath: null,
        remarks: "Recorded against the claim before v4", lines: [], createdAt: n.createdAt,
      });
    }
    return {
      ...n,
      kind: n.kind ?? "sales",
      month: n.month ?? null,
      status: (oldStatus[n.status ?? "raised"] ?? n.status) as ClaimStatus,
      approvedAmount: n.approvedAmount ?? null,
      lines: n.lines ?? [],
      schemeLines: n.schemeLines ?? [],
      brand: newBrand(globals, n.brand),
      settings: withGstHistory(n.settings),
    };
  });
  return {
    ...EMPTY,
    ...d,
    globals: { ...globals, tolerance: { ...DEFAULT_TOLERANCE, ...d.globals?.tolerance } },
    suppliers: (d.suppliers ?? []).map((x) => newSupplier(x)),
    brands: (d.brands ?? []).map((p) => newBrand(globals, p)),
    skus: (d.skus ?? []).map((x) => newSku(x.brandId, x)),
    rules: (d.rules ?? []).map((x) => newRule(x.brandId, x)),
    sales: d.sales ?? [],
    purchases: d.purchases ?? [],
    imports: d.imports ?? [],
    claims,
    supplierCns,
    settlements: d.settlements ?? [],
    audit: d.audit ?? [],
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Data saved before the brand/claim rework called brands "parties" and claims "notes". */
function fromV2(o: any): Partial<Data> {
  return {
    globals: { ...o.globals, claimPrefix: o.globals?.notePrefix, nextClaimNo: o.globals?.nextNoteNo, business: { name: o.globals?.company ?? "" } },
    brands: o.parties ?? [],
    sales: (o.sales ?? []).map(({ partyId, noteId, ...s }: any) => ({ ...s, brandId: partyId, claimId: noteId })),
    claims: (o.notes ?? []).map(({ partyId, party, ...n }: any) => ({ ...n, brandId: partyId, brand: party })),
    currentBrandId: o.currentPartyId ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Data kept in this browser (the web preview, or the desktop app before it had a database). */
function loadLocal(): Data | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw) as Partial<Data>);
    const old = localStorage.getItem(OLD_KEY);
    return old ? normalize(fromV2(JSON.parse(old))) : null;
  } catch {
    return null;
  }
}

/**
 * Where the data lives: the SQLite database in the desktop app, localStorage
 * in a plain browser. Returns the loaded data and what is already saved (so
 * the first diff writes only what is not — e.g. localStorage data moving into
 * a fresh database).
 */
async function loadAll(): Promise<{ data: Data; saved: Data }> {
  const db = desktopDb();
  if (!db) {
    const data = loadLocal() ?? EMPTY;
    return { data, saved: data };
  }
  const snapshot = await db.load();
  const fromDb = fromSnapshot(snapshot);
  if (isEmpty(fromDb)) {
    const local = loadLocal();
    if (local && !isEmpty(local)) return { data: local, saved: normalize(fromDb) };
  }
  const data = normalize(fromDb);
  const fixups = settingsFixups(snapshot.settings, data.globals);
  if (fixups.length) await db.apply(fixups);
  return { data, saved: data };
}

/** A brand's season purchases, when invoices have been imported, replace the typed-in figures. */
function withDispatch(d: Data): Data {
  const totals = new Map<string, Brand["dispatch"]>();
  for (const p of d.purchases) {
    const t = totals.get(p.brandId) ?? { qty: 0, mrp: 0, wsp: 0, gst: 0 };
    totals.set(p.brandId, { qty: t.qty + p.qty, mrp: t.mrp + p.mrp * p.qty, wsp: t.wsp + p.gross, gst: t.gst + p.tax });
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    ...d,
    brands: d.brands.map((b) => {
      const t = totals.get(b.id);
      if (!t) return b;
      const next = { qty: t.qty, mrp: round(t.mrp), wsp: round(t.wsp), gst: round(t.gst) };
      const same = (Object.keys(next) as (keyof typeof next)[]).every((k) => next[k] === b.dispatch[k]);
      return same ? b : { ...b, dispatch: next };
    }),
  };
}

/** Adds an audit entry for a commercially sensitive change. */
function audited(d: Data, e: Omit<AuditEntry, "id" | "at" | "reason"> & { reason?: string }): Data {
  const at = new Date().toISOString();
  const last = d.audit[0];
  // Typing into a field changes it on every keystroke: fold those into one entry.
  if (last && last.module === e.module && last.recordId === e.recordId && last.action === e.action && Date.parse(at) - Date.parse(last.at) < 60_000) {
    return { ...d, audit: [{ ...last, ...e, before: last.before, at, reason: e.reason || last.reason }, ...d.audit.slice(1)] };
  }
  return { ...d, audit: [{ ...e, id: uid(), at, reason: e.reason ?? "" }, ...d.audit] };
}

/**
 * Moves a claim along on its own: CN received once a supplier CN is linked,
 * Settled once nothing is pending, back again if those are removed. A
 * disputed claim is left alone until the user clears it.
 */
function syncClaim(d: Data, claimId: string | null): Data {
  if (!claimId) return d;
  const c = d.claims.find((x) => x.id === claimId);
  if (!c || c.status === "disputed") return d;
  const cns = d.supplierCns.filter((x) => x.claimId === claimId);
  const st = settlementOf(c, cns, d.settlements.filter((x) => x.claimId === claimId));
  const next: ClaimStatus = st.status === "settled" && (cns.length || st.writtenOff) ? "settled" : cns.length ? "cn_received" : "claimed";
  if (next === c.status) return d;
  return audited(
    { ...d, claims: d.claims.map((x) => (x.id === claimId ? { ...x, status: next } : x)) },
    { module: "claims", recordId: claimId, action: "status", detail: `${c.number}: ${CLAIM_STATUS_LABEL[c.status]} → ${CLAIM_STATUS_LABEL[next]} (automatic)`, before: c.status, after: next },
  );
}

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [...list, x]);

type Store = ReturnType<typeof useStoreState>;
const Ctx = createContext<Store | null>(null);

function useStoreState() {
  const [data, setData] = useState<Data>(EMPTY);
  const [ready, setReady] = useState(false);

  const saved = useRef<Data>(EMPTY);

  useEffect(() => {
    loadAll().then(({ data, saved: s }) => {
      saved.current = s;
      setData(data);
      setReady(true);
    });
  }, []);

  // Save every change: as row-level writes to SQLite, or the whole thing to localStorage.
  useEffect(() => {
    if (!ready) return;
    const db = desktopDb();
    if (!db) {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {}
      return;
    }
    const ops = diff(saved.current, data);
    saved.current = data;
    if (ops.length) {
      db.apply(ops).catch((e: Error) => toast.error("Couldn't save to the database", { description: e.message }));
    }
  }, [data, ready]);

  const update = useCallback((f: (d: Data) => Data) => setData(f), []);

  const actions = useMemo(
    () => ({
      setGlobals: (patch: Partial<Globals>) => update((d) => ({ ...d, globals: { ...d.globals, ...patch } })),
      selectBrand: (id: string | null) => update((d) => ({ ...d, currentBrandId: id })),
      saveBrand: (p: Brand) =>
        update((d) => {
          const exists = d.brands.some((x) => x.id === p.id);
          return {
            ...d,
            brands: exists ? d.brands.map((x) => (x.id === p.id ? p : x)) : [...d.brands, p],
            currentBrandId: d.currentBrandId ?? p.id,
          };
        }),
      deleteBrand: (id: string) =>
        update((d) => ({
          ...d,
          brands: d.brands.filter((p) => p.id !== id),
          skus: d.skus.filter((x) => x.brandId !== id),
          rules: d.rules.filter((x) => x.brandId !== id),
          sales: d.sales.filter((s) => s.brandId !== id),
          purchases: d.purchases.filter((x) => x.brandId !== id),
          imports: d.imports.filter((x) => x.brandId !== id),
          currentBrandId: d.currentBrandId === id ? (d.brands.find((p) => p.id !== id)?.id ?? null) : d.currentBrandId,
        })),
      saveSupplier: (x: Supplier) => update((d) => ({ ...d, suppliers: upsert(d.suppliers, x) })),
      deleteSupplier: (id: string) =>
        update((d) => ({
          ...d,
          suppliers: d.suppliers.filter((x) => x.id !== id),
          brands: d.brands.map((b) => (b.supplierId === id ? { ...b, supplierId: null } : b)),
        })),
      /** Save a SKU; a change to its prices is written to the audit log. */
      saveSku: (x: Sku, reason = "") =>
        update((d) => {
          const before = d.skus.find((y) => y.id === x.id);
          const next = { ...d, skus: upsert(d.skus, x) };
          if (before && JSON.stringify(before.prices) === JSON.stringify(x.prices)) return next;
          return audited(next, { module: "skus", recordId: x.id, action: before ? "prices" : "create", detail: `SKU ${x.sku}`, before: before?.prices ?? null, after: x.prices, reason });
        }),
      /** Add or refresh many SKUs at once (building the master from invoices). */
      addSkus: (list: Sku[]) =>
        update((d) => {
          const byId = new Map(list.map((x) => [x.id, x]));
          return { ...d, skus: [...d.skus.map((x) => byId.get(x.id) ?? x), ...list.filter((x) => !d.skus.some((y) => y.id === x.id))] };
        }),
      deleteSkus: (ids: string[]) => update((d) => ({ ...d, skus: d.skus.filter((x) => !ids.includes(x.id)) })),
      saveRule: (r: CnRule, reason = "") =>
        update((d) => {
          const before = d.rules.find((y) => y.id === r.id);
          return audited(
            { ...d, rules: upsert(d.rules, r) },
            { module: "rules", recordId: r.id, action: before ? "update" : "create", detail: `Rule ${r.code || r.name}`, before: before ?? null, after: r, reason },
          );
        }),
      deleteRule: (id: string) =>
        update((d) => {
          const before = d.rules.find((y) => y.id === id);
          return audited({ ...d, rules: d.rules.filter((x) => x.id !== id) }, { module: "rules", recordId: id, action: "delete", detail: `Rule ${before?.code || before?.name}`, before, after: null });
        }),
      saveSale: (s: Sale) =>
        update((d) => ({
          ...d,
          sales: d.sales.some((x) => x.id === s.id) ? d.sales.map((x) => (x.id === s.id ? s : x)) : [...d.sales, s],
        })),
      /** Change many sales at once (e.g. a custom margin). Sales already in a claim are left alone. */
      updateSales: (ids: string[], patch: Partial<Sale>) =>
        update((d) => {
          const set = new Set(ids);
          return { ...d, sales: d.sales.map((s) => (set.has(s.id) && !s.claimId ? { ...s, ...patch } : s)) };
        }),
      addSales: (list: Sale[]) => update((d) => ({ ...d, sales: [...d.sales, ...list] })),
      deleteSales: (ids: string[]) => update((d) => ({ ...d, sales: d.sales.filter((s) => !ids.includes(s.id) || s.claimId) })),
      raiseClaim: (n: ClaimDraft, saleIds: string[]) => {
        const id = uid();
        const ids = new Set(saleIds);
        update((d) => {
          const number = `${d.globals.claimPrefix}${String(d.globals.nextClaimNo).padStart(4, "0")}`;
          return audited(
            {
              ...d,
              claims: [{ ...n, id, number, createdAt: new Date().toISOString(), status: "claimed", approvedAmount: null }, ...d.claims],
              sales: d.sales.map((s) => (ids.has(s.id) ? { ...s, claimId: id } : s)),
              globals: { ...d.globals, nextClaimNo: d.globals.nextClaimNo + 1 },
            },
            { module: "claims", recordId: id, action: "create", detail: `${number} raised on ${n.brand.name} for ₹ ${n.total.toFixed(2)}`, before: null, after: n.total },
          );
        });
        return id;
      },
      deleteClaim: (id: string) =>
        update((d) => {
          const c = d.claims.find((x) => x.id === id);
          return audited(
            {
              ...d,
              claims: d.claims.filter((n) => n.id !== id),
              sales: d.sales.map((s) => (s.claimId === id ? { ...s, claimId: null } : s)),
              supplierCns: d.supplierCns.map((x) => (x.claimId === id ? { ...x, claimId: null } : x)),
              settlements: d.settlements.filter((x) => x.claimId !== id),
            },
            { module: "claims", recordId: id, action: "delete", detail: `${c?.number} deleted`, before: c?.total ?? null, after: null },
          );
        }),
      /** Mark a claim disputed (with a reason, kept in the audit log), or clear it back to its normal status. */
      setDisputed: (id: string, disputed: boolean, reason = "") =>
        update((d) => {
          const c = d.claims.find((x) => x.id === id);
          if (!c || (c.status === "disputed") === disputed) return d;
          const next = audited(
            { ...d, claims: d.claims.map((x) => (x.id === id ? { ...x, status: disputed ? ("disputed" as const) : ("claimed" as const) } : x)) },
            { module: "claims", recordId: id, action: "status", detail: `${c.number}: ${disputed ? "disputed" : "dispute cleared"}`, before: c.status, after: disputed ? "disputed" : "claimed", reason },
          );
          return disputed ? next : syncClaim(next, id);
        }),
      setApproved: (id: string, amount: number | null, reason = "") =>
        update((d) => {
          const c = d.claims.find((x) => x.id === id);
          if (!c) return d;
          const next = audited(
            { ...d, claims: d.claims.map((x) => (x.id === id ? { ...x, approvedAmount: amount } : x)) },
            { module: "claims", recordId: id, action: "approved_amount", detail: `${c.number} approved amount set to ${amount === null ? "the claim total" : `₹ ${amount.toFixed(2)}`}`, before: c.approvedAmount, after: amount, reason },
          );
          return syncClaim(next, id);
        }),
      /** Save a credit note the supplier issued; the claims it moves to or from are updated. */
      saveSupplierCn: (x: SupplierCn, reason = "") =>
        update((d) => {
          const before = d.supplierCns.find((y) => y.id === x.id);
          let next = audited(
            { ...d, supplierCns: upsert(d.supplierCns, x) },
            {
              module: "supplier_cns", recordId: x.id, action: before ? "update" : "create", detail: `Supplier CN ${x.number || "(no number)"} ₹ ${x.gross.toFixed(2)}`,
              before: before ? { gross: before.gross, claimId: before.claimId, disputed: before.disputed } : null, after: { gross: x.gross, claimId: x.claimId, disputed: x.disputed }, reason,
            },
          );
          next = syncClaim(next, x.claimId);
          if (before?.claimId && before.claimId !== x.claimId) next = syncClaim(next, before.claimId);
          return next;
        }),
      deleteSupplierCn: (id: string) =>
        update((d) => {
          const before = d.supplierCns.find((y) => y.id === id);
          const next = audited(
            { ...d, supplierCns: d.supplierCns.filter((x) => x.id !== id) },
            { module: "supplier_cns", recordId: id, action: "delete", detail: `Supplier CN ${before?.number} deleted`, before: before?.gross ?? null, after: null },
          );
          return syncClaim(next, before?.claimId ?? null);
        }),
      addSettlement: (e: SettlementEntry) =>
        update((d) =>
          syncClaim(
            audited(
              { ...d, settlements: [...d.settlements, e] },
              { module: "settlements", recordId: e.id, action: e.kind, detail: `₹ ${e.amount.toFixed(2)} ${e.kind.replace("_", " ")} ${e.reference}`.trim(), before: null, after: e, reason: e.remarks },
            ),
            e.claimId,
          ),
        ),
      deleteSettlement: (id: string) =>
        update((d) => {
          const e = d.settlements.find((x) => x.id === id);
          if (!e) return d;
          return syncClaim(
            audited({ ...d, settlements: d.settlements.filter((x) => x.id !== id) }, { module: "settlements", recordId: id, action: "delete", detail: `₹ ${e.amount.toFixed(2)} ${e.kind} removed`, before: e, after: null }),
            e.claimId,
          );
        }),
      setTolerance: (t: Tolerance) => update((d) => ({ ...d, globals: { ...d.globals, tolerance: t } })),
      /**
       * Add one Excel file's rows. With `replace`, the brand's earlier imported
       * rows for the same months are dropped first (sales already in a claim are
       * kept), so re-importing a corrected month doesn't double it.
       */
      importBatch: (b: { imports: ImportRecord[]; sales: Sale[]; purchases: Purchase[]; replace: boolean }) =>
        update((d) => {
          const key = (brandId: string, month: string) => `${brandId}|${month}`;
          const salesMonths = new Set(b.imports.filter((i) => i.kind === "sales").map((i) => key(i.brandId, i.month)));
          const buyMonths = new Set(b.imports.filter((i) => i.kind === "purchases").map((i) => key(i.brandId, i.month)));
          const replacedImports = b.replace
            ? new Set(d.imports.filter((i) => (i.kind === "sales" ? salesMonths : buyMonths).has(key(i.brandId, i.month))).map((i) => i.id))
            : new Set<string>();
          const sales = [
            ...d.sales.filter((s) => !(s.importId && replacedImports.has(s.importId) && !s.claimId)),
            ...b.sales,
          ];
          const purchases = [...d.purchases.filter((p) => !(p.importId && replacedImports.has(p.importId))), ...b.purchases];
          return withDispatch({
            ...d,
            sales,
            purchases,
            imports: [...b.imports, ...d.imports.filter((i) => !replacedImports.has(i.id))],
          });
        }),
      /** Undo an import: its rows go (except sales already claimed, which stay as typed-in). */
      deleteImport: (id: string) =>
        update((d) =>
          withDispatch({
            ...d,
            imports: d.imports.filter((i) => i.id !== id),
            sales: d.sales.filter((s) => s.importId !== id || s.claimId).map((s) => (s.importId === id ? { ...s, importId: null } : s)),
            purchases: d.purchases.filter((p) => p.importId !== id),
          }),
        ),
      replaceAll: (next: Partial<Data>) => update(() => normalize(next)),
    }),
    [update],
  );

  const brand = data.brands.find((p) => p.id === data.currentBrandId);
  return { data, ready, brand, ...actions };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const store = useStoreState();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
