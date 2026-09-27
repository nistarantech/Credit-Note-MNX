// The app's SQLite database (node:sqlite, built into Electron's Node — no
// native module). One file in the user-data folder; every table is keyed by
// brand and month so the data stays organised the way it is worked on:
// brand → month → sales / purchases → claim.
const { DatabaseSync } = require("node:sqlite");

const SCHEMA_VERSION = 2;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Your business details, GST rules, claim numbering, defaults. One JSON value per key.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- The brands you buy from, with the terms your credit notes are worked out on.
CREATE TABLE IF NOT EXISTS brands (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL DEFAULT '',
  name           TEXT NOT NULL,
  gst_no         TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  season         TEXT NOT NULL DEFAULT '',
  applicability  TEXT NOT NULL DEFAULT '',
  conditions     TEXT NOT NULL DEFAULT '',
  first_season   TEXT NOT NULL DEFAULT '',
  deal_name      TEXT NOT NULL DEFAULT '',
  fresh_margin   REAL NOT NULL,
  disc_margin    REAL NOT NULL,
  wsp_factor     REAL NOT NULL,
  cn_base_pct    REAL,                       -- NULL = use the global setting
  dispatch_qty   REAL NOT NULL DEFAULT 0,    -- received from the brand this season
  dispatch_mrp   REAL NOT NULL DEFAULT 0,
  dispatch_wsp   REAL NOT NULL DEFAULT 0,
  dispatch_gst   REAL NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1,
  memo           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);

-- Margin by discount level, per brand (e.g. EOSS up to 30% off -> 25%).
CREATE TABLE IF NOT EXISTS margin_slabs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id  TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  sale_type TEXT NOT NULL CHECK (sale_type IN ('DISC', 'FRESH')),
  up_to     REAL NOT NULL,
  margin    REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS margin_slabs_brand ON margin_slabs(brand_id);

-- Every Excel file imported, one row per brand + month + kind it contributed.
CREATE TABLE IF NOT EXISTS imports (
  id          TEXT PRIMARY KEY,
  brand_id    TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('sales', 'purchases')),
  month       TEXT NOT NULL,                 -- YYYY-MM
  file_name   TEXT NOT NULL,
  sheet       TEXT NOT NULL DEFAULT '',
  stored_path TEXT,                          -- copy of the original file in the data folder
  row_count   INTEGER NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS imports_brand_month ON imports(brand_id, month);

-- Claims you raise on a brand, and the credit note the brand sent back.
CREATE TABLE IF NOT EXISTS claims (
  id          TEXT PRIMARY KEY,
  number      TEXT NOT NULL UNIQUE,
  brand_id    TEXT NOT NULL,                 -- kept even if the brand is deleted
  month       TEXT,                          -- YYYY-MM for a month-end claim
  claim_date  TEXT NOT NULL,
  period_from TEXT NOT NULL,
  period_to   TEXT NOT NULL,
  remarks     TEXT NOT NULL DEFAULT '',
  total       REAL NOT NULL,                 -- credit note claimed
  status      TEXT NOT NULL CHECK (status IN ('raised', 'received')),
  cn_number   TEXT,                          -- the brand's credit note
  cn_date     TEXT,
  cn_amount   REAL,
  snapshot    TEXT NOT NULL,                 -- JSON: brand terms + sales as claimed
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS claims_brand_month ON claims(brand_id, month);

-- Your sales of each brand's goods. The inputs, plus the working at the brand's current terms.
CREATE TABLE IF NOT EXISTS sales (
  id            TEXT PRIMARY KEY,
  brand_id      TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  month         TEXT NOT NULL,               -- YYYY-MM of bill_date
  bill_date     TEXT NOT NULL,
  bill_no       TEXT NOT NULL DEFAULT '',
  barcode       TEXT NOT NULL DEFAULT '',
  division      TEXT NOT NULL DEFAULT '',
  department    TEXT NOT NULL DEFAULT '',
  ageing        TEXT NOT NULL DEFAULT '',
  sale_type     TEXT NOT NULL CHECK (sale_type IN ('DISC', 'FRESH')),
  disc          REAL NOT NULL,
  mrp           REAL NOT NULL,
  qty           REAL NOT NULL,
  wsp           REAL,                        -- per piece from invoice; NULL = MRP x WSP factor
  gst_b2b       REAL,                        -- override; NULL = slab
  margin_override   REAL,                    -- custom margin for this sale; NULL = the brand's terms
  gst_rate_override REAL,                    -- GST rate in the sale price; NULL = rate history
  purchase_date     TEXT,                    -- brand's invoice date (picks the B-B GST rate)
  import_id     TEXT REFERENCES imports(id) ON DELETE SET NULL,
  claim_id      TEXT REFERENCES claims(id) ON DELETE SET NULL,
  mrp_value     REAL NOT NULL,
  realization   REAL NOT NULL,
  gst_rate      REAL NOT NULL,
  gst_b2c       REAL NOT NULL,
  margin_pct    REAL NOT NULL,
  margin        REAL NOT NULL,
  net_payable   REAL NOT NULL,
  wsp_value     REAL NOT NULL,
  gst_b2b_value REAL NOT NULL,
  cn            REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS sales_brand_month ON sales(brand_id, month);
CREATE INDEX IF NOT EXISTS sales_claim ON sales(claim_id);
CREATE INDEX IF NOT EXISTS sales_import ON sales(import_id);

-- What the brand invoiced you (the DISPATCH sheet).
CREATE TABLE IF NOT EXISTS purchases (
  id           TEXT PRIMARY KEY,
  brand_id     TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  month        TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  invoice_no   TEXT NOT NULL DEFAULT '',
  barcode      TEXT NOT NULL DEFAULT '',
  division     TEXT NOT NULL DEFAULT '',
  department   TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT '',
  season       TEXT NOT NULL DEFAULT '',
  rate         REAL NOT NULL,                -- WSP per piece
  mrp          REAL NOT NULL,
  qty          REAL NOT NULL,
  gross        REAL NOT NULL,
  tax          REAL NOT NULL,
  net          REAL NOT NULL,
  import_id    TEXT REFERENCES imports(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS purchases_brand_month ON purchases(brand_id, month);
CREATE INDEX IF NOT EXISTS purchases_barcode ON purchases(brand_id, barcode);

-- One row per brand per month: what was sold, what it earns, what is claimed.
DROP VIEW IF EXISTS monthly_summary;
CREATE VIEW monthly_summary AS
SELECT
  b.name                                                AS brand,
  s.month                                               AS month,
  COUNT(*)                                              AS sale_lines,
  SUM(s.qty)                                            AS pieces,
  SUM(CASE WHEN s.sale_type = 'DISC'  THEN s.qty ELSE 0 END) AS eoss_pieces,
  SUM(CASE WHEN s.sale_type = 'FRESH' THEN s.qty ELSE 0 END) AS fresh_pieces,
  ROUND(SUM(s.mrp_value), 2)                            AS mrp_value,
  ROUND(SUM(s.realization), 2)                          AS sale_value,
  ROUND(SUM(s.margin), 2)                               AS your_margin,
  SUM(CASE WHEN s.margin_override IS NOT NULL THEN 1 ELSE 0 END) AS custom_margin_lines,
  ROUND(SUM(s.cn), 2)                                   AS cn_due,
  ROUND(SUM(CASE WHEN s.claim_id IS NULL THEN s.cn ELSE 0 END), 2) AS cn_unclaimed,
  ROUND(SUM(CASE WHEN s.claim_id IS NOT NULL THEN s.cn ELSE 0 END), 2) AS cn_claimed
FROM sales s
JOIN brands b ON b.id = s.brand_id
GROUP BY s.brand_id, s.month
ORDER BY s.month DESC, b.name;
`;

// ---- row <-> object mapping -------------------------------------------------

const brandRow = (b) => ({
  id: b.id, code: b.code, name: b.name, gst_no: b.gstNo, address: b.address, contact_person: b.contactPerson,
  phone: b.phone, season: b.season, applicability: b.applicability, conditions: b.conditions,
  first_season: b.firstSeason, deal_name: b.dealName, fresh_margin: b.freshMargin, disc_margin: b.discMargin,
  wsp_factor: b.wspFactor, cn_base_pct: b.cnBasePct, dispatch_qty: b.dispatch.qty, dispatch_mrp: b.dispatch.mrp,
  dispatch_wsp: b.dispatch.wsp, dispatch_gst: b.dispatch.gst, active: b.active ? 1 : 0, memo: b.memo, created_at: b.createdAt,
});
const brandObj = (r, slabs) => ({
  id: r.id, code: r.code, name: r.name, gstNo: r.gst_no, address: r.address, contactPerson: r.contact_person,
  phone: r.phone, season: r.season, applicability: r.applicability, conditions: r.conditions,
  firstSeason: r.first_season, dealName: r.deal_name, freshMargin: r.fresh_margin, discMargin: r.disc_margin,
  wspFactor: r.wsp_factor, cnBasePct: r.cn_base_pct,
  dispatch: { qty: r.dispatch_qty, mrp: r.dispatch_mrp, wsp: r.dispatch_wsp, gst: r.dispatch_gst },
  active: !!r.active, memo: r.memo, createdAt: r.created_at,
  marginSlabs: slabs.map((m) => ({ type: m.sale_type, upTo: m.up_to, margin: m.margin })),
});

const saleRow = (s) => ({
  id: s.id, brand_id: s.brandId, month: s.date.slice(0, 7), bill_date: s.date, bill_no: s.billNo, barcode: s.barcode,
  division: s.division, department: s.department, ageing: s.ageing, sale_type: s.type, disc: s.disc, mrp: s.mrp, qty: s.qty,
  wsp: s.wsp, gst_b2b: s.gstB2B, margin_override: s.marginOverride ?? null, gst_rate_override: s.gstRateOverride ?? null,
  purchase_date: s.purchaseDate ?? null, import_id: s.importId ?? null, claim_id: s.claimId,
  mrp_value: s.calc.mrpValue, realization: s.calc.realization, gst_rate: s.calc.gstRate, gst_b2c: s.calc.gstB2C,
  margin_pct: s.calc.marginPct, margin: s.calc.margin, net_payable: s.calc.netPayable, wsp_value: s.calc.wspValue,
  gst_b2b_value: s.calc.gstB2BValue, cn: s.calc.cn,
});
const saleObj = (r) => ({
  id: r.id, brandId: r.brand_id, date: r.bill_date, billNo: r.bill_no, barcode: r.barcode, division: r.division,
  department: r.department, ageing: r.ageing, type: r.sale_type, disc: r.disc, mrp: r.mrp, qty: r.qty, wsp: r.wsp,
  gstB2B: r.gst_b2b, marginOverride: r.margin_override, gstRateOverride: r.gst_rate_override,
  purchaseDate: r.purchase_date, importId: r.import_id, claimId: r.claim_id,
});

const purchaseRow = (p) => ({
  id: p.id, brand_id: p.brandId, month: p.date.slice(0, 7), invoice_date: p.date, invoice_no: p.invoiceNo, barcode: p.barcode,
  division: p.division, department: p.department, category: p.category, season: p.season, rate: p.rate, mrp: p.mrp,
  qty: p.qty, gross: p.gross, tax: p.tax, net: p.net, import_id: p.importId ?? null,
});
const purchaseObj = (r) => ({
  id: r.id, brandId: r.brand_id, date: r.invoice_date, invoiceNo: r.invoice_no, barcode: r.barcode, division: r.division,
  department: r.department, category: r.category, season: r.season, rate: r.rate, mrp: r.mrp, qty: r.qty, gross: r.gross,
  tax: r.tax, net: r.net, importId: r.import_id,
});

const importRow = (i) => ({
  id: i.id, brand_id: i.brandId, kind: i.kind, month: i.month, file_name: i.fileName, sheet: i.sheet,
  stored_path: i.storedPath ?? null, row_count: i.rowCount, imported_at: i.importedAt,
});
const importObj = (r) => ({
  id: r.id, brandId: r.brand_id, kind: r.kind, month: r.month, fileName: r.file_name, sheet: r.sheet,
  storedPath: r.stored_path, rowCount: r.row_count, importedAt: r.imported_at,
});

const claimRow = (c) => ({
  id: c.id, number: c.number, brand_id: c.brandId, month: c.month, claim_date: c.date, period_from: c.from, period_to: c.to,
  remarks: c.remarks, total: c.total, status: c.status, cn_number: c.received?.cnNumber ?? null,
  cn_date: c.received?.cnDate ?? null, cn_amount: c.received?.amount ?? null,
  snapshot: JSON.stringify({ brand: c.brand, settings: c.settings, lines: c.lines }), created_at: c.createdAt,
});
const claimObj = (r) => {
  const snap = JSON.parse(r.snapshot);
  return {
    id: r.id, number: r.number, brandId: r.brand_id, month: r.month, date: r.claim_date, from: r.period_from, to: r.period_to,
    remarks: r.remarks, total: r.total, status: r.status,
    received: r.cn_amount === null ? null : { cnNumber: r.cn_number ?? "", cnDate: r.cn_date ?? "", amount: r.cn_amount },
    brand: snap.brand, settings: snap.settings, lines: snap.lines, createdAt: r.created_at,
  };
};

const TABLES = {
  brands: brandRow,
  sales: saleRow,
  purchases: purchaseRow,
  imports: importRow,
  claims: claimRow,
};

function upsertSql(table, row) {
  const cols = Object.keys(row);
  const updates = cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  return `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => `:${c}`).join(", ")})
          ON CONFLICT(id) DO UPDATE SET ${updates}`;
}

// Columns added after a table first shipped: [table, column, definition].
const ADDED_COLUMNS = [
  ["sales", "margin_override", "REAL"],
  ["sales", "gst_rate_override", "REAL"],
  ["sales", "purchase_date", "TEXT"],
];

function migrate(db) {
  for (const [table, column, def] of ADDED_COLUMNS) {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}

function open(file) {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  migrate(db);
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
  const stmts = new Map();
  const prep = (sql) => {
    if (!stmts.has(sql)) stmts.set(sql, db.prepare(sql));
    return stmts.get(sql);
  };

  function load() {
    const slabs = db.prepare("SELECT * FROM margin_slabs ORDER BY sale_type, up_to").all();
    const settings = Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map((r) => [r.key, JSON.parse(r.value)]));
    return {
      settings,
      brands: db.prepare("SELECT * FROM brands ORDER BY name").all().map((r) => brandObj(r, slabs.filter((m) => m.brand_id === r.id))),
      imports: db.prepare("SELECT * FROM imports ORDER BY month DESC, imported_at DESC").all().map(importObj),
      claims: db.prepare("SELECT * FROM claims ORDER BY created_at DESC").all().map(claimObj),
      sales: db.prepare("SELECT * FROM sales ORDER BY bill_date, bill_no").all().map(saleObj),
      purchases: db.prepare("SELECT * FROM purchases ORDER BY invoice_date, invoice_no").all().map(purchaseObj),
    };
  }

  // ops: [{ table, upsert?: object[], delete?: string[] }] or { settings: {key: value} }, applied in order
  // in one transaction. Claims go before sales so a sale's claim_id always points at a row.
  function apply(ops) {
    db.exec("BEGIN");
    try {
      for (const op of ops) {
        if (op.settingsDelete) {
          for (const key of op.settingsDelete) prep("DELETE FROM settings WHERE key = ?").run(key);
          continue;
        }
        if (op.settings) {
          for (const [key, value] of Object.entries(op.settings)) {
            prep("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
          }
          continue;
        }
        const toRow = TABLES[op.table];
        if (!toRow) throw new Error(`unknown table ${op.table}`);
        for (const id of op.delete ?? []) prep(`DELETE FROM ${op.table} WHERE id = ?`).run(id);
        for (const obj of op.upsert ?? []) {
          const row = toRow(obj);
          prep(upsertSql(op.table, row)).run(row);
          if (op.table === "brands") {
            prep("DELETE FROM margin_slabs WHERE brand_id = ?").run(obj.id);
            for (const m of obj.marginSlabs ?? []) {
              prep("INSERT INTO margin_slabs (brand_id, sale_type, up_to, margin) VALUES (?, ?, ?, ?)").run(obj.id, m.type, m.upTo, m.margin);
            }
          }
        }
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }

  function backup(toFile) {
    db.prepare("VACUUM INTO ?").run(toFile);
  }

  return { load, apply, backup, close: () => db.close() };
}

module.exports = { open };
