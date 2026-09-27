"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_SETTINGS, uid, withGstHistory, type Line, type MarginSlab, type Settings, type TermChange } from "./calc";
import { desktopDb, diff, fromSnapshot, isEmpty, settingsFixups } from "./persist";

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
  createdAt: string;
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

/**
 * A credit note claim you raised on a brand — a frozen copy of the brand's
 * terms and the sales it covers — and what the brand actually credited.
 */
export interface Claim {
  id: string;
  number: string; // your claim reference
  date: string;
  month: string | null; // "2025-09" for a month-end claim
  from: string;
  to: string;
  brandId: string;
  brand: Brand;
  settings: Settings;
  lines: Line[];
  total: number;
  remarks: string;
  createdAt: string;
  status: "raised" | "received";
  received: { cnNumber: string; cnDate: string; amount: number } | null; // the brand's credit note
}

/** What raiseClaim needs; number, status and dates are filled in by the store. */
export type ClaimDraft = Omit<Claim, "id" | "number" | "createdAt" | "status" | "received">;

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
}

export interface Data {
  globals: Globals;
  brands: Brand[];
  sales: Sale[];
  purchases: Purchase[];
  imports: ImportRecord[];
  claims: Claim[];
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
};

const EMPTY: Data = { globals: DEFAULT_GLOBALS, brands: [], sales: [], purchases: [], imports: [], claims: [], currentBrandId: null };
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
    createdAt: new Date().toISOString(),
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
  return {
    ...EMPTY,
    ...d,
    globals,
    brands: (d.brands ?? []).map((p) => newBrand(globals, p)),
    sales: d.sales ?? [],
    purchases: d.purchases ?? [],
    imports: d.imports ?? [],
    claims: (d.claims ?? []).map((n) => ({
      ...n,
      month: n.month ?? null,
      status: n.status ?? "raised",
      received: n.received ?? null,
      brand: newBrand(globals, n.brand),
      settings: withGstHistory(n.settings),
    })),
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
          sales: d.sales.filter((s) => s.brandId !== id),
          purchases: d.purchases.filter((x) => x.brandId !== id),
          imports: d.imports.filter((x) => x.brandId !== id),
          currentBrandId: d.currentBrandId === id ? (d.brands.find((p) => p.id !== id)?.id ?? null) : d.currentBrandId,
        })),
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
      /** Purchase rates found for sales, each with where it came from. Sales already in a claim are left alone. */
      setSaleRates: (rates: { id: string; wsp: number | null; wspSource: string | null }[]) =>
        update((d) => {
          const byId = new Map(rates.map((r) => [r.id, r]));
          return {
            ...d,
            sales: d.sales.map((s) => {
              const r = byId.get(s.id);
              return r && !s.claimId ? { ...s, wsp: r.wsp, wspSource: r.wspSource } : s;
            }),
          };
        }),
      addSales: (list: Sale[]) => update((d) => ({ ...d, sales: [...d.sales, ...list] })),
      deleteSales: (ids: string[]) => update((d) => ({ ...d, sales: d.sales.filter((s) => !ids.includes(s.id) || s.claimId) })),
      raiseClaim: (n: ClaimDraft, saleIds: string[]) => {
        const id = uid();
        const ids = new Set(saleIds);
        update((d) => {
          const number = `${d.globals.claimPrefix}${String(d.globals.nextClaimNo).padStart(4, "0")}`;
          return {
            ...d,
            claims: [{ ...n, id, number, createdAt: new Date().toISOString(), status: "raised", received: null }, ...d.claims],
            sales: d.sales.map((s) => (ids.has(s.id) ? { ...s, claimId: id } : s)),
            globals: { ...d.globals, nextClaimNo: d.globals.nextClaimNo + 1 },
          };
        });
        return id;
      },
      deleteClaim: (id: string) =>
        update((d) => ({
          ...d,
          claims: d.claims.filter((n) => n.id !== id),
          sales: d.sales.map((s) => (s.claimId === id ? { ...s, claimId: null } : s)),
        })),
      /** Record the credit note the brand sent against a claim (null = not received yet). */
      markReceived: (id: string, received: Claim["received"]) =>
        update((d) => ({
          ...d,
          claims: d.claims.map((c) => (c.id === id ? { ...c, received, status: received ? "received" : "raised" } : c)),
        })),
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
