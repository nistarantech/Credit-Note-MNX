"use client";

import { calcRow } from "./calc";
import { calcSettings, type Brand, type Data, type Globals } from "./store";

/** A write to the SQLite database; see electron/db.cjs `apply`. */
type Op =
  | { settings: Record<string, unknown> }
  | { settingsDelete: string[] }
  | { table: Table; upsert?: unknown[]; delete?: string[] };

type Table = "suppliers" | "brands" | "skus" | "cn_rules" | "imports" | "claims" | "supplier_cns" | "settlements" | "purchases" | "sales" | "audit_log";

export interface DesktopDb {
  load: () => Promise<DbSnapshot>;
  apply: (ops: Op[]) => Promise<void>;
  info: () => Promise<{ dir: string; file: string }>;
  openFolder: () => Promise<string>;
  backup: () => Promise<string | null>;
}

export interface DbSnapshot {
  settings: Record<string, unknown>;
  suppliers: Data["suppliers"];
  skus: Data["skus"];
  rules: Data["rules"];
  supplierCns: Data["supplierCns"];
  settlements: Data["settlements"];
  audit: Data["audit"];
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
    suppliers: s.suppliers ?? [],
    skus: s.skus ?? [],
    rules: s.rules ?? [],
    supplierCns: s.supplierCns ?? [],
    settlements: s.settlements ?? [],
    audit: s.audit ?? [],
    brands: s.brands,
    imports: s.imports,
    claims: s.claims,
    sales: s.sales,
    purchases: s.purchases,
    currentBrandId: currentBrandId ?? null,
  };
}

export const isEmpty = (d: Partial<Data>) => !d.brands?.length && !d.sales?.length && !d.claims?.length && !d.suppliers?.length;

/**
 * Settings rows to bring the database's `settings` table in line with the
 * current shape: keys it lacks (added since) are written, keys no longer used
 * (e.g. the old single `b2b` GST rule) are removed.
 */
export function settingsFixups(raw: Record<string, unknown>, globals: Globals): Op[] {
  const known = new Set<string>([...Object.keys(globals), "currentBrandId"]);
  const missing = Object.fromEntries(Object.entries(globals).filter(([k]) => !(k in raw)));
  const stale = Object.keys(raw).filter((k) => !known.has(k));
  const ops: Op[] = [];
  if (Object.keys(missing).length) ops.push({ settings: missing });
  if (stale.length) ops.push({ settingsDelete: stale });
  return ops;
}

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
  const more = {
    suppliers: changed(prev.suppliers, next.suppliers),
    skus: changed(prev.skus, next.skus),
    cn_rules: changed(prev.rules, next.rules),
    supplier_cns: changed(prev.supplierCns, next.supplierCns),
    settlements: changed(prev.settlements, next.settlements),
    audit_log: changed(prev.audit, next.audit),
  };

  const g = prev.globals, n = next.globals;
  const rulesChanged = g.b2cSlabs !== n.b2cSlabs || g.roundGstFactor !== n.roundGstFactor || g.b2bSlabs !== n.b2bSlabs;
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
  const del = (table: Table, ids: string[]) => ids.length && ops.push({ table, delete: ids });
  const put = (table: Table, rows: unknown[]) => rows.length && ops.push({ table, upsert: rows });
  // children before parents when deleting, parents before children when saving
  del("settlements", more.settlements.delete);
  del("supplier_cns", more.supplier_cns.delete);
  del("sales", sales.delete);
  del("purchases", purchases.delete);
  del("claims", claims.delete);
  del("imports", imports.delete);
  del("cn_rules", more.cn_rules.delete);
  del("skus", more.skus.delete);
  del("brands", brands.delete);
  del("suppliers", more.suppliers.delete);
  if (Object.keys(settings).length) ops.push({ settings });
  put("suppliers", more.suppliers.upsert);
  put("brands", brands.upsert);
  put("skus", more.skus.upsert);
  put("cn_rules", more.cn_rules.upsert);
  put("imports", imports.upsert);
  put("claims", claims.upsert);
  put("supplier_cns", more.supplier_cns.upsert);
  put("settlements", more.settlements.upsert);
  put("purchases", purchases.upsert);
  put("sales", withWorking);
  put("audit_log", more.audit_log.upsert);
  return ops;
}
