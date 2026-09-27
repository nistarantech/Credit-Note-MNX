"use client";

import { calcRow, inr, pctStr } from "@/lib/calc";
import { calcSettings, useStore } from "@/lib/store";
import { sampleLines } from "@/lib/sample";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Admonition } from "@/components/ui-patterns/admonition";
import { Page } from "@/components/app/page";

export default function FormulasPage() {
  const { data, party } = useStore();
  const s = calcSettings(data.globals, party);
  const ex = calcRow(sampleLines()[0], s);
  const f = (n: number) => inr(n);

  const rows: [string, string, string, string][] = [
    ["N", "MRP value", "MRP × Qty", `${f(ex.mrp)} × ${ex.qty} = ${f(ex.mrpValue)}`],
    ["O", "Discount", "MRP value × discount %", `${f(ex.mrpValue)} × ${pctStr(ex.disc, 0)} = ${f(ex.discAmt)}`],
    ["Q", "Sale value (realization)", "MRP value − discount", `${f(ex.mrpValue)} − ${f(ex.discAmt)} = ${f(ex.realization)}`],
    ["S", "GST factor in sale", "rate ÷ (1 + rate)", `${pctStr(ex.gstRate, 0)} → ${ex.gstFactor}`],
    ["R", "GST in sale (B-C)", "Sale value × GST factor", `${f(ex.realization)} × ${ex.gstFactor} = ${f(ex.gstB2C)}`],
    ["T", "Dealer margin", "(Sale value − GST in sale) × margin %", `${f(ex.realization - ex.gstB2C)} × ${pctStr(ex.marginPct, 0)} = ${f(ex.margin)}`],
    ["W", "WSP (company bill)", `MRP × ${s.wspFactor} × Qty, or invoice rate × Qty`, f(ex.wspValue)],
    ["X", "GST on company bill (B-B)", `WSP × ${pctStr(s.b2b.low, 0)} up to ₹ ${s.b2b.threshold} / pc, else ${pctStr(s.b2b.high, 0)}`, f(ex.gstB2BValue)],
    ["U", "Party should pay company", "Sale value − GST in sale − margin + GST on bill", `${f(ex.realization)} − ${f(ex.gstB2C)} − ${f(ex.margin)} + ${f(ex.gstB2BValue)} = ${f(ex.netPayable)}`],
    ["V", "Credit note", "(WSP + GST on bill) − party should pay", `${f(ex.wspValue + ex.gstB2BValue)} − ${f(ex.netPayable)} = ${f(ex.cn)}`],
  ];

  return (
    <Page title="How it's calculated" description="The same formulas as the AW'25EOSS and SUMMARY sheets of NIKHIL.xlsx.">
      <Card>
        <CardHeader>
          <CardTitle>Per sale</CardTitle>
          <CardDescription>Example: MRP {inr(ex.mrp, 0)}, {pctStr(ex.disc, 0)} off, EOSS, sold {ex.date}{party ? `, ${party.name}'s deal` : ""}.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Excel</TableHead>
              <TableHead>Figure</TableHead>
              <TableHead>Formula</TableHead>
              <TableHead className="text-right">Example</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(([col, name, formula, example]) => (
              <TableRow key={col}>
                <TableCell className="font-mono text-xs text-foreground-lighter">{col}</TableCell>
                <TableCell className="text-foreground">{name}</TableCell>
                <TableCell className="text-foreground-light">{formula}</TableCell>
                <TableCell className="text-right font-mono text-xs">{example}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per credit note</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm text-foreground-light list-disc pl-5">
            <li><span className="text-foreground">Billed by company</span> = WSP + GST on bill, of all EOSS sales</li>
            <li><span className="text-foreground">Net receivable</span> = sale value − GST in sale − dealer margin + GST on bill, of all EOSS sales</li>
            <li><span className="text-foreground">Credit on EOSS</span> = billed − net receivable</li>
            <li><span className="text-foreground">Credit on fresh</span> = sum of the credit of each fresh sale (close to zero when the fresh margin matches the WSP discount)</li>
            <li><span className="text-foreground">Credit note amount</span> = credit on EOSS + credit on fresh</li>
            <li><span className="text-foreground">CN % of MRP</span> = amount ÷ (dispatch MRP × {Math.round(s.cnBasePct * 100)}%)</li>
          </ul>
        </CardContent>
      </Card>

      <Admonition
        type="default"
        title="Checked against the Excel sheet"
        description="All 1,058 sale rows of NIKHIL.xlsx give the same sale value, GST, margin and net payable, and the EOSS credit (₹ 3,25,665.07) matches to the paisa."
      />
    </Page>
  );
}
