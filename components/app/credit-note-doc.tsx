"use client";

import { calcRow, inWords, inr, pctStr, summarize, type Line, type Settings } from "@/lib/calc";
import type { Party } from "@/lib/store";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Figure, fmtDate } from "./fields";

export interface NoteDocProps {
  company: string;
  number: string;
  date: string;
  from: string;
  to: string;
  remarks: string;
  party: Party;
  settings: Settings;
  lines: Line[];
  draft?: boolean;
}

/** The credit note itself — on screen and on paper (A4). */
export function CreditNoteDoc({ company, number, date, from, to, remarks, party, settings, lines, draft }: NoteDocProps) {
  const s = summarize(lines, settings);
  const b = s.billing;
  const m = s.marginWorking;
  const monthName = (k: string) => (k.length === 7 ? new Date(k + "-01").toLocaleString("en-IN", { month: "short", year: "numeric" }) : k);
  const rows = [...lines].sort((a, x) => a.date.localeCompare(x.date)).map((l) => calcRow(l, settings));

  return (
    <article className="print-plain rounded-lg border bg-surface-100 px-10 py-10 text-foreground">
      <header className="flex items-start justify-between gap-6 border-b pb-6">
        <div>
          <p className="heading-meta text-foreground-lighter">{company || "Credit note working"}</p>
          <h1 className="mt-1 text-2xl text-foreground">Credit Note {draft ? <span className="text-foreground-lighter">(draft)</span> : null}</h1>
          <p className="mt-1 text-sm text-foreground-light">EOSS credit note sharing working · {party.season}</p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-foreground-lighter">Number</dt><dd className="text-right font-mono">{number}</dd>
          <dt className="text-foreground-lighter">Date</dt><dd className="text-right">{fmtDate(date)}</dd>
          <dt className="text-foreground-lighter">Period</dt><dd className="text-right">{fmtDate(from)} – {fmtDate(to)}</dd>
        </dl>
      </header>

      <section className="grid grid-cols-2 gap-8 border-b py-6">
        <div>
          <p className="heading-meta text-foreground-lighter mb-2">Issued to</p>
          <p className="text-base text-foreground">{party.name}</p>
          {party.address ? <p className="text-sm text-foreground-light whitespace-pre-line">{party.address}</p> : null}
          {party.gstNo ? <p className="mt-1 font-mono text-xs text-foreground-light">GSTIN {party.gstNo}</p> : null}
        </div>
        <dl className="text-sm">
          <Figure label="Deal (EOSS / Fresh margin)" value={`${Math.round(settings.discMargin * 100)}% / ${Math.round(settings.freshMargin * 100)}%`} className="py-1" />
          <Figure label="Applicability" value={party.applicability || "—"} className="py-1" />
          <Figure label="Conditions" value={party.conditions || "—"} className="py-1" />
          <Figure label="First season" value={party.firstSeason || "—"} className="py-1" />
        </dl>
      </section>

      <section className="grid grid-cols-2 gap-10 border-b py-6">
        <div>
          <p className="heading-meta text-foreground-lighter mb-1">Billing working — EOSS</p>
          <dl className="divide-y">
            <Figure label="Pieces sold" value={inr(b.qty, 0)} />
            <Figure label="MRP value" value={inr(b.mrpValue)} />
            <Figure label="WSP" value={inr(b.wsp)} />
            <Figure label="Add: GST" value={inr(b.gst)} muted />
            <Figure label="Billed by company" value={inr(b.total)} emphasis />
          </dl>
        </div>
        <div>
          <p className="heading-meta text-foreground-lighter mb-1">Margin working — EOSS</p>
          <dl className="divide-y">
            <Figure label="Sale value (R.V.)" value={inr(m.rv)} />
            <Figure label="Less: GST in sale" value={inr(m.taxB2C)} muted />
            <Figure label="Net of tax" value={inr(m.not)} />
            <Figure label="Less: dealer margin" value={inr(m.dealer)} muted />
            <Figure label="Company's share" value={inr(m.company)} />
            <Figure label="Add: GST" value={inr(m.gst)} muted />
            <Figure label="Net receivable" value={inr(m.netReceivable)} emphasis />
          </dl>
        </div>
      </section>

      <section className="border-b py-6">
        <dl className="divide-y">
          <Figure label="Credit on EOSS sales (billed − net receivable)" value={inr(s.eossCn)} />
          <Figure label="Credit on fresh sales" value={inr(s.freshCn)} />
        </dl>
        <div className="mt-3 flex items-end justify-between rounded-md bg-surface-200 px-4 py-4">
          <div>
            <p className="text-sm text-foreground-light">Credit note amount</p>
            <p className="mt-1 text-xs text-foreground-lighter italic">{inWords(s.totalCn)}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl tabular-nums text-foreground">₹ {inr(s.totalCn)}</p>
            {s.cnPctOfMrp !== null ? <p className="text-xs text-foreground-lighter">{pctStr(s.cnPctOfMrp)} of dispatch MRP × {Math.round(settings.cnBasePct * 100)}%</p> : null}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-10 border-b py-6">
        <div>
          <p className="heading-meta text-foreground-lighter mb-1">Dispatch this season</p>
          <dl className="divide-y">
            <Figure label="Pieces" value={inr(settings.dispatch.qty, 0)} />
            <Figure label="MRP value" value={inr(settings.dispatch.mrp)} />
            <Figure label="Billing value (WSP + GST)" value={inr(s.dispatchBilling)} />
            <Figure label="Goods sold in EOSS" value={pctStr(s.goodsSoldPct)} />
            <Figure label="EOSS discount hit" value={pctStr(s.discHitPct)} />
          </dl>
        </div>
        <div>
          <p className="heading-meta text-foreground-lighter mb-1">Month-wise — EOSS</p>
          <dl className="divide-y">
            {s.months.length === 0 ? <Figure label="No EOSS sales" value="—" muted /> : null}
            {s.months.map(({ month, t }) => (
              <Figure key={month} label={`${monthName(month)} · ${inr(t.qty, 0)} pcs`} value={inr(t.cn)} />
            ))}
          </dl>
        </div>
      </section>

      {remarks ? (
        <section className="border-b py-6">
          <p className="heading-meta text-foreground-lighter mb-1">Remarks</p>
          <p className="text-sm text-foreground-light whitespace-pre-line">{remarks}</p>
        </section>
      ) : null}

      <section className="py-6 break-before-page">
        <p className="heading-meta text-foreground-lighter mb-2">Annexure — {rows.length} sales</p>
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Bill</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">MRP × qty</TableHead>
              <TableHead className="text-right">Sale value</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                <TableCell className="font-mono">{r.billNo}</TableCell>
                <TableCell className="font-mono">{r.barcode}</TableCell>
                <TableCell>{r.type === "DISC" ? "EOSS" : "Fresh"}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.mrp, 0)} × {r.qty}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.realization)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.margin)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.cn)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>Total</TableCell>
              <TableCell className="text-right tabular-nums">{inr(s.all.qty, 0)} pcs</TableCell>
              <TableCell className="text-right tabular-nums">{inr(s.all.realization)}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(s.all.margin)}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(s.all.cn)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </section>

      <footer className="mt-16 grid grid-cols-3 gap-10 text-center text-xs text-foreground-lighter">
        <div className="border-t border-strong pt-2">Prepared by</div>
        <div className="border-t border-strong pt-2">Checked by</div>
        <div className="border-t border-strong pt-2">Authorised signatory</div>
      </footer>
    </article>
  );
}
