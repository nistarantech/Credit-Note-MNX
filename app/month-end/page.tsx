"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, FileText } from "lucide-react";
import { inr, termsFor } from "@/lib/calc";
import { monthEnd, monthLabel, monthRange, claimPayload, salesMonths, thisMonth, type BrandMonth } from "@/lib/month";
import { calcSettings, useStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogBody, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";
import { FormField, today } from "@/components/app/fields";
import { Metric } from "@/components/app/metric";
import { MonthPicker } from "@/components/app/month-picker";
import { Page } from "@/components/app/page";

const MONTH_KEY = "cn:month-end:month";

/** A month's claim is dated its last day, or today while the month is still running. */
const noteDateFor = (month: string) => {
  const last = monthRange(month)[1];
  return last < today() ? last : today();
};

export default function MonthEndPage() {
  const store = useStore();
  const { data, raiseClaim, selectBrand } = store;
  const router = useRouter();
  const months = salesMonths(data.sales);
  const [month, setMonth] = useState(() => months[0] ?? thisMonth());
  const [issuing, setIssuing] = useState<BrandMonth[] | null>(null);
  const [date, setDate] = useState("");

  // remember the month between visits
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MONTH_KEY);
      if (saved) setMonth(saved);
    } catch {}
  }, []);
  const pick = (m: string) => {
    setMonth(m);
    try {
      localStorage.setItem(MONTH_KEY, m);
    } catch {}
  };

  const rows = monthEnd(data, month);
  const withSales = rows.filter((r) => r.sales.length);
  const idle = rows.filter((r) => !r.sales.length && r.brand.active);
  const pending = withSales.filter((r) => r.open.length);
  const sum = (f: (r: BrandMonth) => number) => withSales.reduce((a, r) => a + f(r), 0);
  const [from, to] = monthRange(month);

  const openIssue = (list: BrandMonth[]) => {
    setDate(noteDateFor(month));
    setIssuing(list);
  };

  const issue = () => {
    if (!issuing) return;
    for (const r of issuing) {
      raiseClaim(claimPayload(data, r.brand, r.open, { date, from, to, month, remarks: "" }), r.open.map((s) => s.id));
    }
    const total = issuing.reduce((a, r) => a + r.pending.totalCn, 0);
    toast.success(`${issuing.length} claim${issuing.length > 1 ? "s" : ""} raised for ${monthLabel(month)}`, { description: `Total ₹ ${inr(total)}` });
    setIssuing(null);
  };

  return (
    <Page
      title="Month-end"
      description="The credit note to claim from each brand for the month, worked out on that brand's own terms."
      size="large"
      actions={
        <>
          <MonthPicker value={month} onChange={pick} months={months} />
          <Button variant="primary" disabled={!pending.length} onClick={() => openIssue(pending)}>
            Claim all pending{pending.length ? ` (${pending.length})` : ""}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Metric label="Brands with sales" value={`${withSales.length} of ${rows.length}`} />
        <Metric label="Sale value" value={`₹ ${inr(sum((r) => r.total.all.realization))}`} />
        <Metric label="Your margin" value={`₹ ${inr(sum((r) => r.total.all.margin))}`} />
        <Metric
          label={`To claim · ${monthLabel(month, "short")}`}
          value={`₹ ${inr(sum((r) => r.total.totalCn))}`}
          tooltip={`₹ ${inr(sum((r) => r.pending.totalCn))} not yet claimed`}
          strong
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{monthLabel(month)}</CardTitle>
          <CardDescription>
            Sales dated {from.split("-").reverse().join("/")} – {to.split("-").reverse().join("/")}. Click a brand to see your sales of it for the month.
          </CardDescription>
        </CardHeader>
        {withSales.length === 0 ? (
          <div className="py-14">
            <EmptyStatePresentational icon={CalendarCheck} title={`No sales in ${monthLabel(month)}`} description="Enter or import your sales of each brand for this month first.">
              <Button variant="default" asChild><Link href="/sales/">Go to sales</Link></Button>
            </EmptyStatePresentational>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead className="text-right">EOSS pcs</TableHead>
                <TableHead className="text-right">Fresh pcs</TableHead>
                <TableHead className="text-right">Sale value</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">CN to claim</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {withSales.map((r) => (
                <TableRow
                  key={r.brand.id}
                  className="cursor-pointer"
                  onClick={() => {
                    selectBrand(r.brand.id);
                    router.push(`/sales/?month=${month}`);
                  }}
                >
                  <TableCell>
                    <div className="text-foreground">{r.brand.name}</div>
                    {r.brand.code ? <div className="font-mono text-xs text-foreground-lighter">{r.brand.code}</div> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-foreground-light">
                    {(() => {
                      // terms in force at the end of the month (a change mid-month shows as a note)
                      const t = termsFor(to, calcSettings(data.globals, r.brand));
                      const mid = r.brand.termChanges.some((c) => c.from > from && c.from <= to);
                      return (
                        <>
                          {Math.round(t.discMargin * 100)}% / {Math.round(t.freshMargin * 100)}%
                          {t.marginSlabs.length ? <span className="ml-1 text-xs text-foreground-lighter">+{t.marginSlabs.length} slabs</span> : null}
                          {mid ? <div className="text-xs text-warning-600">Terms changed this month</div> : null}
                        </>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.total.disc.qty, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.total.fresh.qty, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.total.all.realization)}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground-light">{inr(r.total.all.margin)}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">₹ {inr(r.total.totalCn)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.open.length === 0 ? (
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="success" className="w-fit">Claimed</Badge>
                        <span className="font-mono text-xs text-foreground-lighter">{r.claims.map((n) => n.number).join(", ")}</span>
                      </div>
                    ) : r.claims.length ? (
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="warning" className="w-fit">Part claimed</Badge>
                        <span className="text-xs text-foreground-lighter">{r.open.length} sales · ₹ {inr(r.pending.totalCn)}</span>
                      </div>
                    ) : (
                      <Badge variant="warning">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {r.open.length ? (
                      <Button variant="primary" size="tiny" onClick={() => openIssue([r])}>Claim</Button>
                    ) : (
                      <Button variant="default" size="tiny" icon={<FileText size={14} strokeWidth={1.5} />} asChild>
                        <Link href={`/claims/?view=${r.claims[0]?.id}`}>View</Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="text-foreground-light">{withSales.length} brands</TableCell>
                <TableCell className="text-right tabular-nums">{inr(sum((r) => r.total.disc.qty), 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(sum((r) => r.total.fresh.qty), 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(sum((r) => r.total.all.realization))}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(sum((r) => r.total.all.margin))}</TableCell>
                <TableCell className="text-right tabular-nums text-foreground">₹ {inr(sum((r) => r.total.totalCn))}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </Card>

      {idle.length ? (
        <p className="text-xs text-foreground-lighter">
          No sales entered this month for: {idle.map((r) => r.brand.name).join(", ")}.
        </p>
      ) : null}

      <AlertDialog open={!!issuing} onOpenChange={(o) => !o && setIssuing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Raise {issuing?.length === 1 ? `a claim on ${issuing[0].brand.name}` : `${issuing?.length} claims`} for {monthLabel(month)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each brand gets one claim for your unclaimed sales of its goods in the month, numbered from {data.globals.claimPrefix}
              {String(data.globals.nextClaimNo).padStart(4, "0")}. Those sales are then marked as claimed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogBody className="flex flex-col gap-4">
            <div className="flex flex-col divide-y rounded-md border">
              {issuing?.map((r) => (
                <div key={r.brand.id} className="flex justify-between gap-4 px-3 py-2 text-sm">
                  <span className="truncate text-foreground-light">{r.brand.name}</span>
                  <span className="tabular-nums text-foreground">₹ {inr(r.pending.totalCn)}</span>
                </div>
              ))}
            </div>
            <FormField label="Claim date" htmlFor="me-date">
              <Input id="me-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={issue}>
              Claim ₹ {inr(issuing?.reduce((a, r) => a + r.pending.totalCn, 0) ?? 0)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
