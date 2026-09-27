"use client";

import { inWords, inr } from "@/lib/calc";
import type { ExpectedLine } from "@/lib/recon";
import type { Brand, Business } from "@/lib/store";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "./fields";

/** The claim you send the brand for a scheme credit note: every eligible line, the rule and the formula. */
export function SchemeDoc({
  business, number, date, from, to, remarks, brand, lines, draft,
}: {
  business: Business;
  number: string;
  date: string;
  from: string;
  to: string;
  remarks: string;
  brand: Brand;
  lines: ExpectedLine[];
  draft?: boolean;
}) {
  const t = lines.reduce((a, l) => ({ qty: a.qty + l.qty, basic: a.basic + l.basic, gst: a.gst + l.gst, gross: a.gross + l.gross }), { qty: 0, basic: 0, gst: 0, gross: 0 });
  const rules = [...new Set(lines.map((l) => l.ruleCode))];
  const rows = [...lines].sort((a, b) => a.date.localeCompare(b.date) || a.invoiceNo.localeCompare(b.invoiceNo));

  return (
    <article className="print-plain rounded-lg border bg-surface-100 px-10 py-10 text-foreground">
      <header className="flex items-start justify-between gap-6 border-b pb-6">
        <div>
          <p className="text-base text-foreground">{business.name || "Your business name"}</p>
          {business.address ? <p className="text-xs text-foreground-light whitespace-pre-line">{business.address}</p> : null}
          <p className="text-xs text-foreground-lighter">{[business.gstNo && `GSTIN ${business.gstNo}`, business.phone, business.email].filter(Boolean).join(" · ")}</p>
          <h1 className="mt-5 text-2xl text-foreground">Scheme Credit Note Claim {draft ? <span className="text-foreground-lighter">(draft)</span> : null}</h1>
          <p className="mt-1 text-sm text-foreground-light">Rules: {rules.join(", ") || "—"}</p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-foreground-lighter">Claim no.</dt><dd className="text-right font-mono">{number}</dd>
          <dt className="text-foreground-lighter">Date</dt><dd className="text-right">{fmtDate(date)}</dd>
          <dt className="text-foreground-lighter">Period</dt><dd className="text-right">{fmtDate(from)} – {fmtDate(to)}</dd>
        </dl>
      </header>

      <section className="border-b py-6">
        <p className="heading-meta text-foreground-lighter mb-2">To</p>
        <p className="text-base text-foreground">{brand.name}</p>
        {brand.address ? <p className="text-sm text-foreground-light whitespace-pre-line">{brand.address}</p> : null}
        {brand.gstNo ? <p className="mt-1 font-mono text-xs text-foreground-light">GSTIN {brand.gstNo}</p> : null}
      </section>

      <section className="border-b py-6">
        <div className="flex items-end justify-between rounded-md bg-surface-200 px-4 py-4">
          <div>
            <p className="text-sm text-foreground-light">Credit note claimed · {inr(t.qty, 0)} pcs · basic ₹ {inr(t.basic)} + GST ₹ {inr(t.gst)}</p>
            <p className="mt-1 text-xs text-foreground-lighter italic">{inWords(t.gross)}</p>
          </div>
          <p className="text-2xl tabular-nums text-foreground">₹ {inr(t.gross)}</p>
        </div>
      </section>

      {remarks ? (
        <section className="border-b py-6">
          <p className="heading-meta text-foreground-lighter mb-1">Remarks</p>
          <p className="text-sm text-foreground-light whitespace-pre-line">{remarks}</p>
        </section>
      ) : null}

      <section className="py-6">
        <p className="heading-meta text-foreground-lighter mb-2">Annexure — {rows.length} lines</p>
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>{rows.some((r) => r.source === "sale") ? "Invoice / bill" : "Invoice"}</TableHead>
              <TableHead>SKU / barcode</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead>Working</TableHead>
              <TableHead className="text-right">Basic</TableHead>
              <TableHead className="text-right">GST</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                <TableCell className="font-mono">{r.invoiceNo}</TableCell>
                <TableCell className="font-mono">{r.barcode}</TableCell>
                <TableCell>{r.ruleCode}</TableCell>
                <TableCell className="text-foreground-light">{r.formula}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.basic)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.gst)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.gross)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5}>Total · {inr(t.qty, 0)} pcs</TableCell>
              <TableCell className="text-right tabular-nums">{inr(t.basic)}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(t.gst)}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(t.gross)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </section>

      <footer className="mt-16 grid grid-cols-3 gap-10 text-center text-xs text-foreground-lighter">
        <div className="border-t border-strong pt-2">Prepared by</div>
        <div className="border-t border-strong pt-2">For {business.name || "the claimant"}</div>
        <div className="border-t border-strong pt-2">Accepted by {brand.name}</div>
      </footer>
    </article>
  );
}
