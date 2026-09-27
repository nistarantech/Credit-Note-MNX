// The app's SQLite database (node:sqlite, built into Electron's Node — no
// native module). One file in the user-data folder; every table is keyed by
// brand and month so the data stays organised the way it is worked on:
// brand → month → sales / purchases → claim.
const { DatabaseSync } = require("node:sqlite");

const SCHEMA_VERSION = 4;

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
  supplier_id    TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
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

-- New terms agreed with a brand from a date on (the brands row holds the original terms).
CREATE TABLE IF NOT EXISTS brand_term_changes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id     TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  from_date    TEXT NOT NULL,              -- applies to sales billed on/after this date
  fresh_margin REAL NOT NULL,
  disc_margin  REAL NOT NULL,
  wsp_factor   REAL NOT NULL,
  margin_slabs TEXT NOT NULL DEFAULT '[]'  -- JSON: [{type, upTo, margin}]
);
CREATE INDEX IF NOT EXISTS brand_term_changes_brand ON brand_term_changes(brand_id, from_date);

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

-- Claims you raise on a brand. What the brand credited is in supplier_cns.
CREATE TABLE IF NOT EXISTS claims (
  id              TEXT PRIMARY KEY,
  number          TEXT NOT NULL UNIQUE,
  brand_id        TEXT NOT NULL,             -- kept even if the brand is deleted
  kind            TEXT NOT NULL DEFAULT 'sales' CHECK (kind IN ('sales', 'scheme')),
  month           TEXT,                      -- YYYY-MM for a month-end claim
  claim_date      TEXT NOT NULL,
  period_from     TEXT NOT NULL,
  period_to       TEXT NOT NULL,
  remarks         TEXT NOT NULL DEFAULT '',
  total           REAL NOT NULL,             -- credit note claimed (gross)
  approved_amount REAL,                      -- what the supplier agreed to; NULL = the claim total
  status          TEXT NOT NULL CHECK (status IN ('claimed', 'cn_received', 'settled', 'disputed')),
  snapshot        TEXT NOT NULL,             -- JSON: brand terms + sales / scheme lines as claimed
  created_at      TEXT NOT NULL
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
  flat_disc     REAL,                        -- ₹ off the whole line on the bill
  cashback      REAL,                        -- ₹ cashback to the customer on the whole line
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

-- The companies / distributors that bill you and issue the credit notes.
CREATE TABLE IF NOT EXISTS suppliers (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL DEFAULT '',
  name            TEXT NOT NULL,
  gst_no          TEXT NOT NULL DEFAULT '',
  contact_person  TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  cn_cycle        TEXT NOT NULL DEFAULT 'monthly',  -- monthly / quarterly / season / other
  gst_treatment   TEXT NOT NULL DEFAULT 'included' CHECK (gst_treatment IN ('on_top', 'included', 'none')),
  settlement_mode TEXT NOT NULL DEFAULT 'adjustment' CHECK (settlement_mode IN ('adjustment', 'refund', 'credit_note')),
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL
);

-- One row per product (SKU / barcode) of a brand. Prices live in sku_prices.
CREATE TABLE IF NOT EXISTS skus (
  id           TEXT PRIMARY KEY,
  brand_id     TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  sku          TEXT NOT NULL,
  barcode      TEXT NOT NULL DEFAULT '',
  name         TEXT NOT NULL DEFAULT '',
  division     TEXT NOT NULL DEFAULT '',
  department   TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT '',
  sub_category TEXT NOT NULL DEFAULT '',
  size         TEXT NOT NULL DEFAULT '',
  colour       TEXT NOT NULL DEFAULT '',
  hsn          TEXT NOT NULL DEFAULT '',
  season       TEXT NOT NULL DEFAULT '',
  cn_eligible  INTEGER NOT NULL DEFAULT 1,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  UNIQUE (brand_id, sku)
);
CREATE INDEX IF NOT EXISTS skus_barcode ON skus(brand_id, barcode);

-- Price history of a SKU: MRP, WSP, purchase rate and GST from a date on. Old claims keep the price they used.
CREATE TABLE IF NOT EXISTS sku_prices (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id        TEXT NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  from_date     TEXT NOT NULL,
  mrp           REAL NOT NULL,
  wsp           REAL,
  purchase_rate REAL,
  gst_rate      REAL,
  source        TEXT NOT NULL DEFAULT ''     -- invoice / rate circular / typed in
);
CREATE INDEX IF NOT EXISTS sku_prices_sku ON sku_prices(sku_id, from_date);

-- Scheme / CN rules: what a brand pays a credit note on, at what rate, on which base, for which dates.
CREATE TABLE IF NOT EXISTS cn_rules (
  id            TEXT PRIMARY KEY,
  brand_id      TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  code          TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL,
  applies_on    TEXT NOT NULL CHECK (applies_on IN ('purchases', 'sales')),
  from_date     TEXT NOT NULL,
  to_date       TEXT,                        -- NULL = open-ended
  base          TEXT NOT NULL CHECK (base IN ('wsp', 'purchase_rate', 'mrp', 'taxable', 'sale_value', 'qty', 'fixed_line')),
  rate          REAL NOT NULL,               -- 0.2 = 20% for value bases; rupees for qty / fixed_line
  gst_treatment TEXT NOT NULL CHECK (gst_treatment IN ('on_top', 'included', 'none')),
  gst_rate      REAL,                        -- NULL = the line's own GST rate
  match         TEXT NOT NULL DEFAULT '{}',  -- JSON: {barcodes[], category, division, department}
  min_qty       REAL,
  max_qty       REAL,
  priority      INTEGER NOT NULL DEFAULT 10,
  stacking      INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  remarks       TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cn_rules_brand ON cn_rules(brand_id, from_date);

-- Credit notes the supplier actually issued, header + lines.
CREATE TABLE IF NOT EXISTS supplier_cns (
  id          TEXT PRIMARY KEY,
  number      TEXT NOT NULL DEFAULT '',
  brand_id    TEXT NOT NULL,                 -- kept even if the brand is deleted
  claim_id    TEXT REFERENCES claims(id) ON DELETE SET NULL,
  cn_date     TEXT NOT NULL,
  period_from TEXT,
  period_to   TEXT,
  basic       REAL NOT NULL,
  gst         REAL NOT NULL,
  gross       REAL NOT NULL,
  disputed    INTEGER NOT NULL DEFAULT 0,
  file_name   TEXT NOT NULL DEFAULT '',
  stored_path TEXT,
  remarks     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS supplier_cns_claim ON supplier_cns(claim_id);
CREATE INDEX IF NOT EXISTS supplier_cns_brand ON supplier_cns(brand_id, cn_date);

CREATE TABLE IF NOT EXISTS supplier_cn_lines (
  id         TEXT PRIMARY KEY,
  cn_id      TEXT NOT NULL REFERENCES supplier_cns(id) ON DELETE CASCADE,
  line_no    INTEGER NOT NULL,
  invoice_no TEXT NOT NULL DEFAULT '',
  barcode    TEXT NOT NULL DEFAULT '',       -- SKU or barcode
  qty        REAL,
  basic      REAL NOT NULL,
  gst_rate   REAL,
  gst        REAL NOT NULL,
  gross      REAL NOT NULL,
  remarks    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS supplier_cn_lines_cn ON supplier_cn_lines(cn_id);

-- How a claim was closed: CN adjusted against payables, refunded, or shortfall written off.
CREATE TABLE IF NOT EXISTS settlements (
  id           TEXT PRIMARY KEY,
  claim_id     TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  entry_date   TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('adjusted', 'refund', 'write_off')),
  amount       REAL NOT NULL,
  reference_no TEXT NOT NULL DEFAULT '',
  remarks      TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS settlements_claim ON settlements(claim_id);

-- Every commercially sensitive change: rules, prices, claim status, supplier CNs, settlements.
CREATE TABLE IF NOT EXISTS audit_log (
  id        TEXT PRIMARY KEY,
  at        TEXT NOT NULL,
  module    TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action    TEXT NOT NULL,
  detail    TEXT NOT NULL DEFAULT '',
  before    TEXT,                            -- JSON
  after     TEXT,                            -- JSON
  reason    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log(at);

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
  ROUND(SUM(COALESCE(s.flat_disc, 0)), 2)               AS flat_discount,
  ROUND(SUM(COALESCE(s.cashback, 0)), 2)                AS cashback,
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
  dispatch_wsp: b.dispatch.wsp, dispatch_gst: b.dispatch.gst, active: b.active ? 1 : 0, memo: b.memo, supplier_id: b.supplierId ?? null,
  created_at: b.createdAt,
});
const brandObj = (r, slabs, changes) => ({
  id: r.id, code: r.code, name: r.name, gstNo: r.gst_no, address: r.address, contactPerson: r.contact_person,
  phone: r.phone, season: r.season, applicability: r.applicability, conditions: r.conditions,
  firstSeason: r.first_season, dealName: r.deal_name, freshMargin: r.fresh_margin, discMargin: r.disc_margin,
  wspFactor: r.wsp_factor, cnBasePct: r.cn_base_pct,
  dispatch: { qty: r.dispatch_qty, mrp: r.dispatch_mrp, wsp: r.dispatch_wsp, gst: r.dispatch_gst },
  active: !!r.active, memo: r.memo, supplierId: r.supplier_id ?? null, createdAt: r.created_at,
  marginSlabs: slabs.map((m) => ({ type: m.sale_type, upTo: m.up_to, margin: m.margin })),
  termChanges: changes.map((c) => ({
    from: c.from_date, freshMargin: c.fresh_margin, discMargin: c.disc_margin, wspFactor: c.wsp_factor,
    marginSlabs: JSON.parse(c.margin_slabs),
  })),
});

const saleRow = (s) => ({
  id: s.id, brand_id: s.brandId, month: s.date.slice(0, 7), bill_date: s.date, bill_no: s.billNo, barcode: s.barcode,
  division: s.division, department: s.department, ageing: s.ageing, sale_type: s.type, disc: s.disc, mrp: s.mrp, qty: s.qty,
  wsp: s.wsp, gst_b2b: s.gstB2B, flat_disc: s.flatDisc ?? null, cashback: s.cashback ?? null, margin_override: s.marginOverride ?? null, gst_rate_override: s.gstRateOverride ?? null,
  purchase_date: s.purchaseDate ?? null, import_id: s.importId ?? null, claim_id: s.claimId,
  mrp_value: s.calc.mrpValue, realization: s.calc.realization, gst_rate: s.calc.gstRate, gst_b2c: s.calc.gstB2C,
  margin_pct: s.calc.marginPct, margin: s.calc.margin, net_payable: s.calc.netPayable, wsp_value: s.calc.wspValue,
  gst_b2b_value: s.calc.gstB2BValue, cn: s.calc.cn,
});
const saleObj = (r) => ({
  id: r.id, brandId: r.brand_id, date: r.bill_date, billNo: r.bill_no, barcode: r.barcode, division: r.division,
  department: r.department, ageing: r.ageing, type: r.sale_type, disc: r.disc, mrp: r.mrp, qty: r.qty, wsp: r.wsp,
  gstB2B: r.gst_b2b, flatDisc: r.flat_disc, cashback: r.cashback, marginOverride: r.margin_override, gstRateOverride: r.gst_rate_override,
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
  id: c.id, number: c.number, brand_id: c.brandId, kind: c.kind ?? "sales", month: c.month, claim_date: c.date, period_from: c.from,
  period_to: c.to, remarks: c.remarks, total: c.total, approved_amount: c.approvedAmount ?? null, status: c.status,
  snapshot: JSON.stringify({ brand: c.brand, settings: c.settings, lines: c.lines, schemeLines: c.schemeLines ?? [] }), created_at: c.createdAt,
});
const claimObj = (r) => {
  const snap = JSON.parse(r.snapshot);
  return {
    id: r.id, number: r.number, brandId: r.brand_id, kind: r.kind, month: r.month, date: r.claim_date, from: r.period_from, to: r.period_to,
    remarks: r.remarks, total: r.total, approvedAmount: r.approved_amount, status: r.status,
    brand: snap.brand, settings: snap.settings, lines: snap.lines ?? [], schemeLines: snap.schemeLines ?? [], createdAt: r.created_at,
  };
};

const supplierRow = (x) => ({
  id: x.id, code: x.code, name: x.name, gst_no: x.gstNo, contact_person: x.contactPerson, phone: x.phone, email: x.email,
  address: x.address, cn_cycle: x.cnCycle, gst_treatment: x.gstTreatment, settlement_mode: x.settlementMode, active: x.active ? 1 : 0,
  created_at: x.createdAt,
});
const supplierObj = (r) => ({
  id: r.id, code: r.code, name: r.name, gstNo: r.gst_no, contactPerson: r.contact_person, phone: r.phone, email: r.email,
  address: r.address, cnCycle: r.cn_cycle, gstTreatment: r.gst_treatment, settlementMode: r.settlement_mode, active: !!r.active,
  createdAt: r.created_at,
});

const skuRow = (x) => ({
  id: x.id, brand_id: x.brandId, sku: x.sku, barcode: x.barcode, name: x.name, division: x.division, department: x.department,
  category: x.category, sub_category: x.subCategory, size: x.size, colour: x.colour, hsn: x.hsn, season: x.season,
  cn_eligible: x.cnEligible ? 1 : 0, active: x.active ? 1 : 0, created_at: x.createdAt,
});
const skuObj = (r, prices) => ({
  id: r.id, brandId: r.brand_id, sku: r.sku, barcode: r.barcode, name: r.name, division: r.division, department: r.department,
  category: r.category, subCategory: r.sub_category, size: r.size, colour: r.colour, hsn: r.hsn, season: r.season,
  cnEligible: !!r.cn_eligible, active: !!r.active, createdAt: r.created_at,
  prices: prices.map((p) => ({ from: p.from_date, mrp: p.mrp, wsp: p.wsp, purchaseRate: p.purchase_rate, gstRate: p.gst_rate, source: p.source })),
});

const ruleRow = (x) => ({
  id: x.id, brand_id: x.brandId, code: x.code, name: x.name, applies_on: x.appliesOn, from_date: x.from, to_date: x.to ?? null,
  base: x.base, rate: x.rate, gst_treatment: x.gstTreatment, gst_rate: x.gstRate ?? null, match: JSON.stringify(x.match ?? {}),
  min_qty: x.minQty ?? null, max_qty: x.maxQty ?? null, priority: x.priority, stacking: x.stacking ? 1 : 0, active: x.active ? 1 : 0,
  remarks: x.remarks, created_at: x.createdAt,
});
const ruleObj = (r) => ({
  id: r.id, brandId: r.brand_id, code: r.code, name: r.name, appliesOn: r.applies_on, from: r.from_date, to: r.to_date,
  base: r.base, rate: r.rate, gstTreatment: r.gst_treatment, gstRate: r.gst_rate, match: JSON.parse(r.match),
  minQty: r.min_qty, maxQty: r.max_qty, priority: r.priority, stacking: !!r.stacking, active: !!r.active, remarks: r.remarks,
  createdAt: r.created_at,
});

const supplierCnRow = (x) => ({
  id: x.id, number: x.number, brand_id: x.brandId, claim_id: x.claimId ?? null, cn_date: x.date, period_from: x.from ?? null,
  period_to: x.to ?? null, basic: x.basic, gst: x.gst, gross: x.gross, disputed: x.disputed ? 1 : 0, file_name: x.fileName,
  stored_path: x.storedPath ?? null, remarks: x.remarks, created_at: x.createdAt,
});
const supplierCnObj = (r, lines) => ({
  id: r.id, number: r.number, brandId: r.brand_id, claimId: r.claim_id, date: r.cn_date, from: r.period_from, to: r.period_to,
  basic: r.basic, gst: r.gst, gross: r.gross, disputed: !!r.disputed, fileName: r.file_name, storedPath: r.stored_path, remarks: r.remarks,
  createdAt: r.created_at,
  lines: lines.map((l) => ({
    id: l.id, invoiceNo: l.invoice_no, barcode: l.barcode, qty: l.qty, basic: l.basic, gstRate: l.gst_rate, gst: l.gst, gross: l.gross,
    remarks: l.remarks,
  })),
});

const settlementRow = (x) => ({
  id: x.id, claim_id: x.claimId, entry_date: x.date, kind: x.kind, amount: x.amount, reference_no: x.reference, remarks: x.remarks,
  created_at: x.createdAt,
});
const settlementObj = (r) => ({
  id: r.id, claimId: r.claim_id, date: r.entry_date, kind: r.kind, amount: r.amount, reference: r.reference_no, remarks: r.remarks,
  createdAt: r.created_at,
});

const auditRow = (x) => ({
  id: x.id, at: x.at, module: x.module, record_id: x.recordId, action: x.action, detail: x.detail,
  before: x.before === undefined ? null : JSON.stringify(x.before), after: x.after === undefined ? null : JSON.stringify(x.after),
  reason: x.reason ?? "",
});
const auditObj = (r) => ({
  id: r.id, at: r.at, module: r.module, recordId: r.record_id, action: r.action, detail: r.detail,
  before: r.before === null ? null : JSON.parse(r.before), after: r.after === null ? null : JSON.parse(r.after), reason: r.reason,
});

const TABLES = {
  suppliers: supplierRow,
  brands: brandRow,
  skus: skuRow,
  cn_rules: ruleRow,
  sales: saleRow,
  purchases: purchaseRow,
  imports: importRow,
  claims: claimRow,
  supplier_cns: supplierCnRow,
  settlements: settlementRow,
  audit_log: auditRow,
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
  ["sales", "flat_disc", "REAL"],
  ["sales", "cashback", "REAL"],
  ["brands", "supplier_id", "TEXT REFERENCES suppliers(id) ON DELETE SET NULL"],
];

const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

/**
 * Version 3 → 4: claims had only raised/received and kept the brand's credit
 * note in its own columns. The table is rebuilt with the full status list, and
 * each recorded credit note moves into supplier_cns, linked to its claim.
 */
function rebuildClaims(db) {
  if (!columns(db, "claims").includes("cn_amount")) return;
  const create = SCHEMA.slice(SCHEMA.indexOf("CREATE TABLE IF NOT EXISTS claims ("), SCHEMA.indexOf("CREATE INDEX IF NOT EXISTS claims_brand_month"))
    .replace("CREATE TABLE IF NOT EXISTS claims (", "CREATE TABLE claims_v4 (");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(create);
    db.exec(`INSERT INTO claims_v4 (id, number, brand_id, kind, month, claim_date, period_from, period_to, remarks, total, approved_amount, status, snapshot, created_at)
      SELECT id, number, brand_id, 'sales', month, claim_date, period_from, period_to, remarks, total, NULL,
             CASE status WHEN 'received' THEN 'cn_received' ELSE 'claimed' END, snapshot, created_at FROM claims`);
    db.exec(`INSERT OR IGNORE INTO supplier_cns (id, number, brand_id, claim_id, cn_date, period_from, period_to, basic, gst, gross, disputed, remarks, created_at)
      SELECT 'cn-' || id, COALESCE(cn_number, ''), brand_id, id, COALESCE(NULLIF(cn_date, ''), claim_date), period_from, period_to,
             cn_amount, 0, cn_amount, 0, 'Recorded against the claim before v4', created_at
      FROM claims WHERE cn_amount IS NOT NULL`);
    db.exec("DROP TABLE claims");
    db.exec("ALTER TABLE claims_v4 RENAME TO claims");
    db.exec("CREATE INDEX IF NOT EXISTS claims_brand_month ON claims(brand_id, month)");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function migrate(db) {
  for (const [table, column, def] of ADDED_COLUMNS) {
    if (!columns(db, table).includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
  rebuildClaims(db);
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
    const changes = db.prepare("SELECT * FROM brand_term_changes ORDER BY from_date").all();
    const settings = Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map((r) => [r.key, JSON.parse(r.value)]));
    const skuPrices = db.prepare("SELECT * FROM sku_prices ORDER BY from_date").all();
    const cnLines = db.prepare("SELECT * FROM supplier_cn_lines ORDER BY line_no").all();
    const group = (rows, key) => {
      const m = new Map();
      for (const r of rows) m.set(r[key], [...(m.get(r[key]) ?? []), r]);
      return m;
    };
    const pricesBySku = group(skuPrices, "sku_id");
    const linesByCn = group(cnLines, "cn_id");
    return {
      settings,
      suppliers: db.prepare("SELECT * FROM suppliers ORDER BY name").all().map(supplierObj),
      skus: db.prepare("SELECT * FROM skus ORDER BY sku").all().map((r) => skuObj(r, pricesBySku.get(r.id) ?? [])),
      rules: db.prepare("SELECT * FROM cn_rules ORDER BY priority, from_date").all().map(ruleObj),
      supplierCns: db.prepare("SELECT * FROM supplier_cns ORDER BY cn_date DESC").all().map((r) => supplierCnObj(r, linesByCn.get(r.id) ?? [])),
      settlements: db.prepare("SELECT * FROM settlements ORDER BY entry_date").all().map(settlementObj),
      audit: db.prepare("SELECT * FROM audit_log ORDER BY at DESC LIMIT 2000").all().map(auditObj),
      brands: db.prepare("SELECT * FROM brands ORDER BY name").all().map((r) => brandObj(r, slabs.filter((m) => m.brand_id === r.id), changes.filter((c) => c.brand_id === r.id))),
      imports: db.prepare("SELECT * FROM imports ORDER BY month DESC, imported_at DESC").all().map(importObj),
      claims: db.prepare("SELECT * FROM claims ORDER BY created_at DESC").all().map(claimObj),
      sales: db.prepare("SELECT * FROM sales ORDER BY bill_date, bill_no").all().map(saleObj),
      purchases: db.prepare("SELECT * FROM purchases ORDER BY invoice_date, invoice_no").all().map(purchaseObj),
    };
  }

  // ops: [{ table, upsert?: object[], delete?: string[] }] or { settings: {key: value} }, applied in order
  // in one transaction. Parents are saved before children (claims before sales, supplier CNs
  // and settlements) so every reference points at a row.
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
          if (op.table === "skus") {
            prep("DELETE FROM sku_prices WHERE sku_id = ?").run(obj.id);
            for (const p of obj.prices ?? []) {
              prep("INSERT INTO sku_prices (sku_id, from_date, mrp, wsp, purchase_rate, gst_rate, source) VALUES (?, ?, ?, ?, ?, ?, ?)")
                .run(obj.id, p.from, p.mrp, p.wsp ?? null, p.purchaseRate ?? null, p.gstRate ?? null, p.source ?? "");
            }
          }
          if (op.table === "supplier_cns") {
            prep("DELETE FROM supplier_cn_lines WHERE cn_id = ?").run(obj.id);
            (obj.lines ?? []).forEach((l, i) => {
              prep("INSERT INTO supplier_cn_lines (id, cn_id, line_no, invoice_no, barcode, qty, basic, gst_rate, gst, gross, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .run(`${obj.id}:${i + 1}`, obj.id, i + 1, l.invoiceNo ?? "", l.barcode ?? "", l.qty ?? null, l.basic, l.gstRate ?? null, l.gst, l.gross, l.remarks ?? "");
            });
          }
          if (op.table === "brands") {
            prep("DELETE FROM margin_slabs WHERE brand_id = ?").run(obj.id);
            for (const m of obj.marginSlabs ?? []) {
              prep("INSERT INTO margin_slabs (brand_id, sale_type, up_to, margin) VALUES (?, ?, ?, ?)").run(obj.id, m.type, m.upTo, m.margin);
            }
            prep("DELETE FROM brand_term_changes WHERE brand_id = ?").run(obj.id);
            for (const c of obj.termChanges ?? []) {
              prep("INSERT INTO brand_term_changes (brand_id, from_date, fresh_margin, disc_margin, wsp_factor, margin_slabs) VALUES (?, ?, ?, ?, ?, ?)")
                .run(obj.id, c.from, c.freshMargin, c.discMargin, c.wspFactor, JSON.stringify(c.marginSlabs ?? []));
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
