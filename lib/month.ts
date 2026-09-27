import { summarize, type Summary } from "./calc";
import { calcSettings, type Brand, type Claim, type ClaimDraft, type Data, type Sale } from "./store";

/** "2025-09-14" → "2025-09" */
export const monthOf = (date: string) => date.slice(0, 7);

export function monthLabel(key: string, style: "long" | "short" = "long") {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: style, year: "numeric" });
}

/** First and last day of a month, as yyyy-mm-dd. */
export function monthRange(key: string): [string, string] {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return [`${key}-01`, `${key}-${String(last).padStart(2, "0")}`];
}

export function shiftMonth(key: string, by: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const thisMonth = () => new Date().toISOString().slice(0, 7);

/** Every month that has a sale, newest first. */
export function salesMonths(sales: Sale[]) {
  return [...new Set(sales.map((s) => monthOf(s.date)).filter(Boolean))].sort().reverse();
}

export interface BrandMonth {
  brand: Brand;
  sales: Sale[]; // all of the brand's sales dated in the month
  open: Sale[]; // those not yet in a claim
  claims: Claim[]; // claims covering any of this month's sales
  pending: Summary; // the credit note the unclaimed sales are worth
  total: Summary; // the month as a whole, claimed or not
}

/** The month-end position of every brand: what is claimed, what is still to claim. */
export function monthEnd(d: Data, month: string): BrandMonth[] {
  return d.brands.map((brand) => {
    const s = calcSettings(d.globals, brand);
    const sales = d.sales.filter((x) => x.brandId === brand.id && monthOf(x.date) === month);
    const open = sales.filter((x) => !x.claimId);
    const claimIds = new Set(sales.map((x) => x.claimId).filter(Boolean));
    return {
      brand,
      sales,
      open,
      claims: d.claims.filter((n) => claimIds.has(n.id)),
      pending: summarize(open, s),
      total: summarize(sales, s),
    };
  });
}

/** What raiseClaim needs to claim `sales` from `brand` in one claim. */
export function claimPayload(
  d: Data,
  brand: Brand,
  sales: Sale[],
  opts: { date: string; from: string; to: string; month: string | null; remarks: string },
): ClaimDraft {
  const settings = calcSettings(d.globals, brand);
  return {
    ...opts,
    brandId: brand.id,
    brand,
    settings,
    lines: sales.map(({ brandId: _p, claimId: _n, ...l }) => l),
    total: summarize(sales, settings).totalCn,
  };
}
