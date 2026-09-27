import { summarize } from "./calc";
import { calcSettings, type Data, type Brand } from "./store";

/** Sales not yet in a claim, and the credit note they are worth. */
export function brandStats(d: Data, p: Brand) {
  const sales = d.sales.filter((s) => s.brandId === p.id);
  const open = sales.filter((s) => !s.claimId);
  const pending = summarize(open, calcSettings(d.globals, p));
  const claims = d.claims.filter((n) => n.brandId === p.id);
  return {
    sales,
    open,
    pending,
    claims,
    issued: claims.reduce((a, n) => a + n.total, 0),
  };
}
