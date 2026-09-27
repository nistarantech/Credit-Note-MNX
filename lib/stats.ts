import { summarize } from "./calc";
import { claimExpected, reconcile, settlementOf } from "./recon";
import { calcSettings, type Claim, type Data, type Brand } from "./store";

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

/** Everything about where a claim stands: the supplier's CNs, the line-by-line check, and settlement. */
export function claimPosition(d: Data, c: Claim) {
  const cns = d.supplierCns.filter((x) => x.claimId === c.id);
  const entries = d.settlements.filter((x) => x.claimId === c.id);
  return {
    cns,
    entries,
    recon: reconcile(claimExpected(c), cns, d.globals.tolerance),
    settle: settlementOf(c, cns, entries),
  };
}
