"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS, uid, type Line, type MarginSlab, type Settings } from "./calc";

/**
 * A retailer the company settles credit notes with. Every party carries its
 * own terms — margins, margin slabs, WSP factor, CN base — so two parties'
 * identical sales can give different credit notes.
 */
export interface Party {
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
  dealName: string; // e.g. "30/20/10", printed on the note
  freshMargin: number;
  discMargin: number;
  marginSlabs: MarginSlab[];
  wspFactor: number;
  cnBasePct: number | null; // null = use the global setting
  dispatch: Settings["dispatch"];
  active: boolean;
  notes: string;
  createdAt: string;
}

export interface Sale extends Line {
  partyId: string;
  noteId: string | null; // set once the sale is settled in an issued credit note
}

/** An issued credit note — a frozen copy of the party, rules and sales it was made from. */
export interface CreditNote {
  id: string;
  number: string;
  date: string;
  month: string | null; // "2025-09" when issued as a month-end note
  from: string;
  to: string;
  partyId: string;
  party: Party;
  settings: Settings;
  lines: Line[];
  total: number;
  remarks: string;
  createdAt: string;
}

/** Rules shared by every party. */
export interface Globals {
  b2cSlabs: Settings["b2cSlabs"];
  roundGstFactor: boolean;
  b2b: Settings["b2b"];
  cnBasePct: number;
  notePrefix: string;
  nextNoteNo: number;
  company: string;
  defaults: { freshMargin: number; discMargin: number; wspFactor: number };
}

export interface Data {
  globals: Globals;
  parties: Party[];
  sales: Sale[];
  notes: CreditNote[];
  currentPartyId: string | null;
}

export const DEFAULT_GLOBALS: Globals = {
  b2cSlabs: DEFAULT_SETTINGS.b2cSlabs,
  roundGstFactor: DEFAULT_SETTINGS.roundGstFactor,
  b2b: DEFAULT_SETTINGS.b2b,
  cnBasePct: DEFAULT_SETTINGS.cnBasePct,
  notePrefix: "CN/25-26/",
  nextNoteNo: 1,
  company: "",
  defaults: {
    freshMargin: DEFAULT_SETTINGS.freshMargin,
    discMargin: DEFAULT_SETTINGS.discMargin,
    wspFactor: DEFAULT_SETTINGS.wspFactor,
  },
};

const EMPTY: Data = { globals: DEFAULT_GLOBALS, parties: [], sales: [], notes: [], currentPartyId: null };
const KEY = "credit-note-app:data:v2";

export function newParty(g: Globals, patch: Partial<Party> = {}): Party {
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
    cnBasePct: null,
    dispatch: { qty: 0, mrp: 0, wsp: 0, gst: 0 },
    active: true,
    notes: "",
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

/** The formula inputs for one party: global GST rules + that party's deal. */
export function calcSettings(g: Globals, p: Party | undefined): Settings {
  return {
    freshMargin: p?.freshMargin ?? g.defaults.freshMargin,
    discMargin: p?.discMargin ?? g.defaults.discMargin,
    marginSlabs: p?.marginSlabs ?? [],
    wspFactor: p?.wspFactor ?? g.defaults.wspFactor,
    b2cSlabs: g.b2cSlabs,
    roundGstFactor: g.roundGstFactor,
    b2b: g.b2b,
    cnBasePct: p?.cnBasePct ?? g.cnBasePct,
    dispatch: p?.dispatch ?? { qty: 0, mrp: 0, wsp: 0, gst: 0 },
  };
}

/** Fill in fields added since the data was saved (older versions, restored backups). */
function normalize(d: Partial<Data>): Data {
  const globals = { ...DEFAULT_GLOBALS, ...d.globals, defaults: { ...DEFAULT_GLOBALS.defaults, ...d.globals?.defaults } };
  return {
    ...EMPTY,
    ...d,
    globals,
    parties: (d.parties ?? []).map((p) => newParty(globals, p)),
    sales: d.sales ?? [],
    notes: (d.notes ?? []).map((n) => ({ ...n, month: n.month ?? null, party: newParty(globals, n.party) })),
  };
}

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return normalize(JSON.parse(raw) as Partial<Data>);
  } catch {
    return EMPTY;
  }
}

type Store = ReturnType<typeof useStoreState>;
const Ctx = createContext<Store | null>(null);

function useStoreState() {
  const [data, setData] = useState<Data>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setData(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {}
  }, [data, ready]);

  const update = useCallback((f: (d: Data) => Data) => setData(f), []);

  const actions = useMemo(
    () => ({
      setGlobals: (patch: Partial<Globals>) => update((d) => ({ ...d, globals: { ...d.globals, ...patch } })),
      selectParty: (id: string | null) => update((d) => ({ ...d, currentPartyId: id })),
      saveParty: (p: Party) =>
        update((d) => {
          const exists = d.parties.some((x) => x.id === p.id);
          return {
            ...d,
            parties: exists ? d.parties.map((x) => (x.id === p.id ? p : x)) : [...d.parties, p],
            currentPartyId: d.currentPartyId ?? p.id,
          };
        }),
      deleteParty: (id: string) =>
        update((d) => ({
          ...d,
          parties: d.parties.filter((p) => p.id !== id),
          sales: d.sales.filter((s) => s.partyId !== id),
          currentPartyId: d.currentPartyId === id ? (d.parties.find((p) => p.id !== id)?.id ?? null) : d.currentPartyId,
        })),
      saveSale: (s: Sale) =>
        update((d) => ({
          ...d,
          sales: d.sales.some((x) => x.id === s.id) ? d.sales.map((x) => (x.id === s.id ? s : x)) : [...d.sales, s],
        })),
      addSales: (list: Sale[]) => update((d) => ({ ...d, sales: [...d.sales, ...list] })),
      deleteSales: (ids: string[]) => update((d) => ({ ...d, sales: d.sales.filter((s) => !ids.includes(s.id) || s.noteId) })),
      issueNote: (n: Omit<CreditNote, "id" | "number" | "createdAt">, saleIds: string[]) => {
        const id = uid();
        const ids = new Set(saleIds);
        update((d) => {
          const number = `${d.globals.notePrefix}${String(d.globals.nextNoteNo).padStart(4, "0")}`;
          return {
            ...d,
            notes: [{ ...n, id, number, createdAt: new Date().toISOString() }, ...d.notes],
            sales: d.sales.map((s) => (ids.has(s.id) ? { ...s, noteId: id } : s)),
            globals: { ...d.globals, nextNoteNo: d.globals.nextNoteNo + 1 },
          };
        });
        return id;
      },
      cancelNote: (id: string) =>
        update((d) => ({
          ...d,
          notes: d.notes.filter((n) => n.id !== id),
          sales: d.sales.map((s) => (s.noteId === id ? { ...s, noteId: null } : s)),
        })),
      replaceAll: (next: Partial<Data>) => update(() => normalize(next)),
    }),
    [update],
  );

  const party = data.parties.find((p) => p.id === data.currentPartyId);
  return { data, ready, party, ...actions };
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
