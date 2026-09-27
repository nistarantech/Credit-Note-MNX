"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, CalendarCheck, Calculator, FileSpreadsheet, FileText } from "lucide-react";
import { inr } from "@/lib/calc";
import { useStore } from "@/lib/store";
import { brandStats } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClaimStatus } from "@/components/app/claim-status";
import { fmtDate } from "@/components/app/fields";
import { Metric } from "@/components/app/metric";
import { Page } from "@/components/app/page";

const STEPS = [
  { icon: Building2, title: "Add your brands", text: "Each brand you buy from, with the terms agreed — your fresh and EOSS margins, discount slabs, WSP.", href: "/brands/?new=1", cta: "New brand" },
  { icon: FileSpreadsheet, title: "Enter your sales", text: "Your sales of each brand's goods — typed in, or pasted straight from your Excel sheet.", href: "/sales/", cta: "Open sales" },
  { icon: CalendarCheck, title: "Claim at month-end", text: "See the credit note due from every brand for the month and raise the claims in one go.", href: "/month-end/", cta: "Month-end" },
];

export default function Overview() {
  const { data, selectBrand } = useStore();
  const router = useRouter();
  const perBrand = data.brands.map((b) => ({ b, s: brandStats(data, b) }));
  const toClaim = perBrand.reduce((a, x) => a + x.s.pending.totalCn, 0);
  const awaiting = data.claims.filter((c) => c.status === "raised");
  const received = data.claims.reduce((a, c) => a + (c.received?.amount ?? 0), 0);

  return (
    <Page
      title="Overview"
      description="Credit notes to claim from your brands, and what they still owe you."
      actions={<Button variant="default" icon={<Calculator size={14} strokeWidth={1.5} />} asChild><Link href="/calculator/">Quick calculator</Link></Button>}
    >
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Metric label="Brands" value={String(data.brands.length)} />
        <Metric label="Not yet claimed" value={`₹ ${inr(toClaim)}`} tooltip="Credit notes your unclaimed sales are worth" strong />
        <Metric label="Awaiting from brands" value={`₹ ${inr(awaiting.reduce((a, c) => a + c.total, 0))}`} tooltip={`${awaiting.length} claims without a credit note yet`} />
        <Metric label="Credit notes received" value={`₹ ${inr(received)}`} />
      </div>

      {data.brands.length === 0 ? (
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
              <CardTitle>To claim, by brand</CardTitle>
              <CardDescription>Your sales not yet in a claim.</CardDescription>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Unclaimed sales</TableHead>
                  <TableHead className="text-right">CN to claim</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {perBrand.map(({ b, s }) => (
                  <TableRow key={b.id} className="cursor-pointer" onClick={() => { selectBrand(b.id); router.push("/sales/"); }}>
                    <TableCell className="text-foreground">{b.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.open.length}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">₹ {inr(s.pending.totalCn)}</TableCell>
                    <TableCell><ArrowRight size={14} strokeWidth={1.5} className="text-foreground-lighter" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <CardContent className="flex justify-end">
              <Button variant="default" icon={<CalendarCheck size={14} strokeWidth={1.5} />} asChild><Link href="/month-end/">Month-end</Link></Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent claims</CardTitle>
              <CardDescription>And whether the brand has sent its credit note.</CardDescription>
            </CardHeader>
            {data.claims.length === 0 ? (
              <CardContent className="py-10 text-center text-sm text-foreground-lighter">No claims raised yet.</CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Claimed</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.claims.slice(0, 8).map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/claims/?view=${c.id}`)}>
                      <TableCell>
                        <div className="font-mono text-xs text-foreground">{c.number}</div>
                        <div className="text-xs text-foreground-lighter">{fmtDate(c.date)}</div>
                      </TableCell>
                      <TableCell className="truncate">{c.brand.name}</TableCell>
                      <TableCell className="text-right tabular-nums">₹ {inr(c.total)}</TableCell>
                      <TableCell><ClaimStatus c={c} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <CardContent className="flex justify-end">
              <Button variant="default" icon={<FileText size={14} strokeWidth={1.5} />} asChild><Link href="/claims/">All claims</Link></Button>
            </CardContent>
          </Card>
        </div>
      )}
    </Page>
  );
}
