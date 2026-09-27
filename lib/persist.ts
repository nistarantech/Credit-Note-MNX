"use client";

import { calcRow } from "./calc";
import { calcSettings, type Brand, type Data, type Globals } from "./store";

/** A write to the SQLite database; see electron/db.cjs `apply`. */
type Op =
  | { settings: Record<string, unknown> }
  | { table: "brands" | "imports" | "claims" | "purchases" | "sales"; upsert?: unknown[]; delete?: string[] };

export interface DesktopDb {
  load: () => Promise<DbSnapshot>;
  apply: (ops: Op[]) => Promise<void>;
  info: () => Promise<{ dir: string; file: string }>;
  openFolder: () => Promise<string>;
  backup: () => Promise<string | null>;
}

export interface DbSnapshot {
  settings: Record<string, unknown>;
  brands: Data["brands"];
  imports: Data["imports"];
  claims: Data["claims"];
  sales: Data["sales"];
  purchases: Data["purchases"];
}

declare global {
  interface Window {
    desktop?: {
      platform: string;
      savePdf: (fileName: string) => Promise<string | null>;
      db?: DesktopDb;
      files?: {
        storeImport: (a: { brand: string; months: string[]; fileName: string; bytes: ArrayBuffer }) => Promise<Record<string, string>>;
        show: (file: string) => Promise<void>;
      };
    };
  }
}

export const desktopDb = () => (typeof window !== "undefined" ? window.desktop?.db : undefined);

/** The database's rows as the app's in-memory data (before normalising). */
export function fromSnapshot(s: DbSnapshot): Partial<Data> {
  const { currentBrandId, ...globals } = s.settings as Partial<Globals> & { currentBrandId?: string | null };
  return {
    globals: globals as Globals,
    brands: s.brands,
    imports: s.imports,
    claims: s.claims,
    sales: s.sales,
    purchases: s.purchases,
    currentBrandId: currentBrandId ?? null,
  };
}

export const isEmpty = (d: Partial<Data>) => !d.brands?.length && !d.sales?.length && !d.claims?.length;

function changed<T extends { id: string }>(prev: T[], next: T[]) {
  const before = new Map(prev.map((x) => [x.id, x]));
  const ids = new Set(next.map((x) => x.id));
  return {
    upsert: next.filter((x) => before.get(x.id) !== x), // new or replaced (updates are immutable)
    delete: [...before.keys()].filter((id) => !ids.has(id)),
  };
}

/**
 * The writes that turn `prev` into `next`. Entities are updated immutably, so
 * anything whose object identity changed is re-saved. Sales carry their
 * working (margin, CN…) as columns, so they are re-saved — recalculated — when
 * their brand's terms or the GST rules change.
 */
export function diff(prev: Data, next: Data): Op[] {
  const settings: Record<string, unknown> = {};
  for (const k of Object.keys(next.globals) as (keyof Globals)[]) {
    if (prev.globals[k] !== next.globals[k]) settings[k] = next.globals[k];
  }
  if (prev.currentBrandId !== next.currentBrandId) settings.currentBrandId = next.currentBrandId;

  const brands = changed(prev.brands, next.brands);
  const imports = changed(prev.imports, next.imports);
  const claims = changed(prev.claims, next.claims);
  const purchases = changed(prev.purchases, next.purchases);
  const sales = changed(prev.sales, next.sales);

  const g = prev.globals, n = next.globals;
  const rulesChanged = g.b2cSlabs !== n.b2cSlabs || g.roundGstFactor !== n.roundGstFactor || g.b2b !== n.b2b;
  const retermed = new Set(brands.upsert.map((b) => b.id));
  const saleIds = new Set(sales.upsert.map((s) => s.id));
  const salesToSave = rulesChanged
    ? next.sales
    : [...sales.upsert, ...next.sales.filter((s) => retermed.has(s.brandId) && !saleIds.has(s.id))];

  const brandById = new Map<string, Brand>(next.brands.map((b) => [b.id, b]));
  const withWorking = salesToSave
    .filter((s) => brandById.has(s.brandId))
    .map((s) => {
      const { id: _id, date: _d, ...calc } = calcRow(s, calcSettings(n, brandById.get(s.brandId)));
      return { ...s, calc };
    });

  const ops: Op[] = [];
  // children before parents when deleting, parents before children when saving
  if (sales.delete.length) ops.push({ table: "sales", delete: sales.delete });
  if (purchases.delete.length) ops.push({ table: "purchases", delete: purchases.delete });
  if (claims.delete.length) ops.push({ table: "claims", delete: claims.delete });
  if (imports.delete.length) ops.push({ table: "imports", delete: imports.delete });
  if (brands.delete.length) ops.push({ table: "brands", delete: brands.delete });
  if (Object.keys(settings).length) ops.push({ settings });
  if (brands.upsert.length) ops.push({ table: "brands", upsert: brands.upsert });
  if (imports.upsert.length) ops.push({ table: "imports", upsert: imports.upsert });
  if (claims.upsert.length) ops.push({ table: "claims", upsert: claims.upsert });
  if (purchases.upsert.length) ops.push({ table: "purchases", upsert: purchases.upsert });
  if (withWorking.length) ops.push({ table: "sales", upsert: withWorking });
  return ops;
}
