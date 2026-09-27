import { inr } from "@/lib/calc";
import type { Claim } from "@/lib/store";
import { Badge } from "@/components/ui/badge";

/** Awaiting CN → Received, or Short ₹x when the brand credited less than claimed. */
export function ClaimStatus({ c }: { c: Claim }) {
  if (c.status === "raised") return <Badge variant="warning">Awaiting CN</Badge>;
  const short = c.total - (c.received?.amount ?? 0);
  if (Math.abs(short) < 1) return <Badge variant="success">Received</Badge>;
  return <Badge variant="destructive">{short > 0 ? `Short ₹ ${inr(short, 0)}` : `Over ₹ ${inr(-short, 0)}`}</Badge>;
}
