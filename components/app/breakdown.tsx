"use client";

import { inr, type Row } from "@/lib/calc";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Figure } from "./fields";

const pc = (n: number) => `${+(n * 100).toFixed(2)}%`;

/** Step-by-step working of one sale, ending in the credit note amount. */
export function Breakdown({ row, className }: { row: Row; className?: string }) {
  const notOfTax = row.realization - row.gstB2C;
  const invoice = row.wspValue + row.gstB2BValue;
  const owes = row.cn >= 0;
  const nil = Math.abs(row.cn) < 1; // rounding noise on fresh sales
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <CardTitle>Working</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="heading-meta text-foreground-lighter mb-1">Sale to customer</p>
        <dl className="divide-y">
          <Figure label={`MRP value (${inr(row.mrp, 0)} × ${row.qty})`} value={inr(row.mrpValue)} />
          <Figure label={`Less discount ${pc(row.disc)}`} value={`− ${inr(row.discAmt)}`} muted />
          <Figure label="Sale value" value={inr(row.realization)} emphasis />
          <Figure label={`Less GST included in sale (${pc(row.gstRate)} slab)`} value={`− ${inr(row.gstB2C)}`} muted />
          <Figure label="Sale value before GST" value={inr(notOfTax)} emphasis />
          <Figure label={`Less dealer margin ${pc(row.marginPct)}`} value={`− ${inr(row.margin)}`} muted />
          <Figure label="Company's share" value={inr(notOfTax - row.margin)} emphasis />
          <Figure label="Add GST on company bill" value={`+ ${inr(row.gstB2BValue)}`} muted />
          <Figure label="Party should pay company" value={inr(row.netPayable)} emphasis />
        </dl>
      </CardContent>
      <CardContent>
        <p className="heading-meta text-foreground-lighter mb-1">Company invoice (purchase)</p>
        <dl className="divide-y">
          <Figure label={`WSP (${inr(row.wspValue / (row.qty || 1))} / pc)`} value={inr(row.wspValue)} />
          <Figure label="GST on WSP" value={`+ ${inr(row.gstB2BValue)}`} muted />
          <Figure label="Party paid company" value={inr(invoice)} emphasis />
        </dl>
      </CardContent>
      <CardContent className="bg-surface-75">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-foreground-light">Credit note amount</span>
            <span className="text-xs text-foreground-lighter">Party paid − party should pay</span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={cn("text-2xl tabular-nums", nil ? "text-foreground" : owes ? "text-brand-600" : "text-destructive")}>₹ {inr(Math.abs(row.cn))}</span>
            {nil ? <Badge>Nil</Badge> : <Badge variant={owes ? "success" : "destructive"}>{owes ? "Company credits party" : "Party owes company"}</Badge>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
