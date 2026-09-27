"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Calculator, FileSpreadsheet, FileText } from "lucide-react";
import { inr } from "@/lib/calc";
import { useStore } from "@/lib/store";
import { partyStats } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/components/app/fields";
import { Metric } from "@/components/app/metric";
import { Page } from "@/components/app/page";

const STEPS = [
  { icon: Building2, title: "Add a party", text: "The retailer, their GSTIN and the deal — EOSS and fresh margins.", href: "/parties/?new=1", cta: "New party" },
  { icon: FileSpreadsheet, title: "Enter their sales", text: "Type each sale in, or paste the rows straight from your Excel sheet.", href: "/sales/", cta: "Open sales" },
  { icon: FileText, title: "Issue the credit note", text: "Pick the period; the note works out billing, margin, GST and the amount.", href: "/credit-notes/", cta: "Credit notes" },
];

export default function Overview() {
  const { data, selectParty } = useStore();
  const router = useRouter();
  const perParty = data.parties.map((p) => ({ p, s: partyStats(data, p) }));
  const due = perParty.reduce((a, x) => a + x.s.pending.totalCn, 0);
  const openPcs = perParty.reduce((a, x) => a + x.s.pending.all.qty, 0);
  const issued = data.notes.reduce((a, n) => a + n.total, 0);

  return (
    <Page
      title="Overview"
      description="Credit notes due and issued across all parties."
      actions={<Button variant="default" icon={<Calculator size={14} strokeWidth={1.5} />} asChild><Link href="/calculator/">Quick calculator</Link></Button>}
    >
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Metric label="Parties" value={String(data.parties.length)} />
        <Metric label="Open sales" value={`${inr(openPcs, 0)} pcs`} tooltip="Sales not yet settled in a credit note" />
        <Metric label="Credit due" value={`₹ ${inr(due)}`} tooltip="What open sales would credit if settled today" strong />
        <Metric label="Credit notes issued" value={`₹ ${inr(issued)}`} tooltip={`${data.notes.length} notes`} />
      </div>

      {data.parties.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text, href, cta }, i) => (
            <Card key={title}>
              <CardContent className="flex h-full flex-col gap-3 py-6">
                <div className="flex items-center gap-2 text-foreground-light">
                  <Icon size={16} strokeWidth={1.5} />
                  <span className="heading-meta">Step {i + 1}</span>
                </div>
                <p className="text-base text-foreground">{title}</p>
                <p className="flex-1 text-sm text-foreground-light">{text}</p>
                <Button variant={i === 0 ? "primary" : "default"} className="w-fit" asChild><Link href={href}>{cta}</Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Credit due by party</CardTitle>
              <CardDescription>Open sales waiting for a credit note.</CardDescription>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Party</TableHead>
                  <TableHead className="text-right">Open sales</TableHead>
                  <TableHead className="text-right">Credit due</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {perParty.map(({ p, s }) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => { selectParty(p.id); router.push("/sales/"); }}>
                    <TableCell className="text-foreground">{p.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.open.length}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">₹ {inr(s.pending.totalCn)}</TableCell>
                    <TableCell><ArrowRight size={14} strokeWidth={1.5} className="text-foreground-lighter" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent credit notes</CardTitle>
              <CardDescription>The last notes issued.</CardDescription>
            </CardHeader>
            {data.notes.length === 0 ? (
              <CardContent className="py-10 text-center text-sm text-foreground-lighter">No credit notes issued yet.</CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.notes.slice(0, 8).map((n) => (
                    <TableRow key={n.id} className="cursor-pointer" onClick={() => router.push("/credit-notes/")}>
                      <TableCell className="font-mono text-xs text-foreground">{n.number}</TableCell>
                      <TableCell className="truncate">{n.party.name}</TableCell>
                      <TableCell className="text-foreground-light whitespace-nowrap">{fmtDate(n.date)}</TableCell>
                      <TableCell className="text-right tabular-nums">₹ {inr(n.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </Page>
  );
}
