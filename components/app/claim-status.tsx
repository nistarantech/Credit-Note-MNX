import { inr } from "@/lib/calc";
import type { Recon } from "@/lib/recon";
import { CLAIM_STATUS_LABEL, type Claim } from "@/lib/store";
import { Badge } from "@/components/ui/badge";

const VARIANT = { claimed: "warning", cn_received: "default", settled: "success", disputed: "destructive" } as const;

/** Claimed · CN received · Settled · Disputed. */
export function ClaimStatus({ c }: { c: Pick<Claim, "status"> }) {
  return <Badge variant={VARIANT[c.status]}>{CLAIM_STATUS_LABEL[c.status]}</Badge>;
}

/** What the check against the supplier's CN found, in one badge. */
export function ReconBadge({ r }: { r: Recon }) {
  if (r.status === "no_cn") return <span className="text-xs text-foreground-lighter">No CN yet</span>;
  if (r.status === "matched") return <Badge variant="success">Matched</Badge>;
  if (r.status === "excess") return <Badge variant="default">Excess ₹ {inr(r.excess, 0)}</Badge>;
  return <Badge variant="destructive">Short ₹ {inr(r.short, 0)}</Badge>;
}
