"use client";

import { calcRow, inWords, inr, pctStr, summarize, type Line, type Settings } from "@/lib/calc";
import type { Brand, Business } from "@/lib/store";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Figure, fmtDate } from "./fields";

export interface ClaimDocProps {
  business: Business;
  number: string;
  date: string;
  from: string;
  to: string;
  remarks: string;
  brand: Brand;
  settings: Settings;
  lines: Line[];
  draft?: boolean;
}

/** The claim you send the brand — on screen and on paper (A4). */
export function ClaimDoc({ business, number, date, from, to, remarks, brand, settings, lines, draft }: ClaimDocProps) {
  const s = summarize(lines, settings);
  const b = s.billing;
  const m = s.marginWorking;
  const monthName = (k: string) => (k.length === 7 ? new Date(k + "-01").toLocaleString("en-IN", { month: "short", year: "numeric" }) : k);
  const rows = [...lines].sort((a, x) => a.date.localeCompare(x.date)).map((l) => calcRow(l, settings));

  return (
    <article className="print-plain rounded-lg border bg-surface-100 px-10 py-10 text-foreground">
      <header className="flex items-start justify-between gap-6 border-b pb-6">
        <div>
          <p className="text-base text-foreground">{business.name || "Your business name"}</p>
          {business.address ? <p className="text-xs text-foreground-light whitespace-pre-line">{business.address}</p> : null}
          <p className="text-xs text-foreground-lighter">
            {[business.gstNo && `GSTIN ${business.gstNo}`, business.phone, business.email].filter(Boolean).join(" · ")}
          </p>
          <h1 className="mt-5 text-2xl text-foreground">Credit Note Claim {draft ? <span className="text-foreground-lighter">(draft)</span> : null}</h1>
          <p className="mt-1 text-sm text-foreground-light">EOSS credit note sharing working · {brand.season}</p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-foreground-lighter">Claim no.</dt><dd className="text-right font-mono">{number}</dd>
          <dt className="text-foreground-lighter">Date</dt><dd className="text-right">{fmtDate(date)}</dd>
          <dt className="text-foreground-lighter">Period</dt><dd className="text-right">{fmtDate(from)} – {fmtDate(to)}</dd>
        </dl>
      </header>

      <section className="grid grid-cols-2 gap-8 border-b py-6">
        <div>
          <p className="heading-meta text-foreground-lighter mb-2">To</p>
          <p className="text-base text-foreground">{brand.name}</p>
          {brand.address ? <p className="text-sm text-foreground-light whitespace-pre-line">{brand.address}</p> : null}
          {brand.gstNo ? <p className="mt-1 font-mono text-xs text-foreground-light">GSTIN {brand.gstNo}</p> : null}
        </div>
        <dl className="text-sm">
          <Figure label="Deal" value={brand.dealName || `${Math.round(settings.freshMargin * 100)}/${Math.round(settings.discMargin * 100)}`} className="py-1" />
          <Figure label="Our margin (Fresh / EOSS)" value={`${Math.round(settings.freshMargin * 100)}% / ${Math.round(settings.discMargin * 100)}%`} className="py-1" />
          {settings.termChanges?.length ? (
            <Figure
              label="Terms changed"
              value={settings.termChanges.map((c) => `from ${fmtDate(c.from)}: ${Math.round(c.freshMargin * 100)}% / ${Math.round(c.discMargin * 100)}%`).join("; ")}
              className="py-1"
            />
          ) : null}
          {settings.marginSlabs.length ? (
            <Figure
              label="Margin by discount"
              value={settings.marginSlabs.map((m) => `${m.type === "DISC" ? "EOSS" : "Fresh"} ≤${Math.round(m.upTo * 100)}%: ${Math.round(m.margin * 100)}%`).join(", ")}
              className="py-1"
            />
          ) : null}
          <Figure label="Applicability" value={brand.applicability || "—"} className="py-1" />
          <Figure label="Conditions" value={brand.conditions || "—"} className="py-1" />
          <Figure label="First season" value={brand.firstSeason || "—"} className="py-1" />
        </dl>
      </section>

      <section className="border-b py-6">
        <p className="heading-meta text-foreground-lighter mb-2">Sales in this claim</p>
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead className="text-right">Pieces</TableHead>
              <TableHead className="text-right">MRP value</TableHead>
              <TableHead className="text-right">Sale value</TableHead>
              <TableHead className="text-right">WSP</TableHead>
              <TableHead className="text-right">Our margin</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {([["EOSS (discounted)", s.disc, s.eossCn], ["Fresh (full price)", s.fresh, s.freshCn]] as const).map(([label, t, cn]) => (
              <TableRow key={label}>
                <TableCell className="text-foreground-light">{label}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(t.qty, 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(t.mrpValue)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(t.realization)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(t.wspValue)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(t.margin)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(cn)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{inr(s.all.qty, 0)}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(s.all.mrpValue)}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(s.all.realization)}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(s.all.wspValue)}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(s.all.margin)}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(s.totalCn)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        <p className="mt-2 text-xs text-foreground-lighter">
          EOSS credit is worked out on the EOSS sales together (below); fresh credit sale by sale (annexure).
        </p>
      </section>

      <section className="grid grid-cols-2 gap-10 border-b py-6">
        <div>
          <p className="heading-meta text-foreground-lighter mb-1">Billing working — EOSS sales only · {inr(b.qty, 0)} of {inr(s.all.qty, 0)} pcs</p>
          <dl className="divide-y">
            <Figure label="Pieces sold" value={inr(b.qty, 0)} />
            <Figure label="MRP value" value={inr(b.mrpValue)} />
            <Figure label="WSP" value={inr(b.wsp)} />
            <Figure label="Add: GST" value={inr(b.gst)} muted />
            <Figure label="Billed to us by the brand" value={inr(b.total)} emphasis />
          </dl>
        </div>
        <div>
          <p className="heading-meta text-foreground-lighter mb-1">Margin working — EOSS sales only</p>
          <dl className="divide-y">
            <Figure label="Sale value (R.V.)" value={inr(m.rv)} />
            {s.disc.flatDiscAmt ? <Figure label="(after flat discounts of)" value={inr(s.disc.flatDiscAmt)} muted /> : null}
            <Figure label="Less: GST in sale" value={inr(m.taxB2C)} muted />
            <Figure label="Net of tax" value={inr(m.not)} />
            {m.cashback ? <Figure label="Less: cashback to customers" value={inr(m.cashback)} muted /> : null}
            <Figure label="Less: our margin" value={inr(m.dealer)} muted />
            <Figure label="Brand's share" value={inr(m.company)} />
            <Figure label="Add: GST" value={inr(m.gst)} muted />
            <Figure label="Payable to brand" value={inr(m.netReceivable)} emphasis />
          </dl>
        </div>
      </section>

      <section className="border-b py-6">
        <dl className="divide-y">
          <Figure label="Credit on EOSS sales (billed − payable)" value={inr(s.eossCn)} />
          <Figure label="Credit on fresh sales" value={inr(s.freshCn)} />
        </dl>
        <div className="mt-3 flex items-end justify-between rounded-md bg-surface-200 px-4 py-4">
          <div>
            <p className="text-sm text-foreground-light">Credit note claimed</p>
            <p className="mt-1 text-xs text-foreground-lighter italic">{inWords(s.totalCn)}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl tabular-nums text-foreground">₹ {inr(s.totalCn)}</p>
            {s.cnPctOfMrp !== null ? <p className="text-xs text-foreground-lighter">{pctStr(s.cnPctOfMrp)} of MRP received × {Math.round(settings.cnBasePct * 100)}%</p> : null}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-10 border-b py-6">
        <div>
          <p className="heading-meta text-foreground-lighter mb-1">Received from brand this season</p>
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

      <p className="border-b py-4 text-sm text-foreground-light">
        Please issue a credit note for the amount above against our {brand.season} sales for the period, as per the agreed terms.
      </p>

      {remarks ? (
        <section className="border-b py-6">
          <p className="heading-meta text-foreground-lighter mb-1">Remarks</p>
          <p className="text-sm text-foreground-light whitespace-pre-line">{remarks}</p>
        </section>
      ) : null}

      <section className="py-6 break-before-page">
        <p className="heading-meta text-foreground-lighter mb-2">
          Annexure — {rows.length} sales{rows.some((r) => r.wspEstimated) ? ` · WSP marked est. is MRP × ${settings.wspFactor}, no purchase rate on record` : ""}
        </p>
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Bill</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">MRP × qty</TableHead>
              <TableHead className="text-right">Sale value</TableHead>
              <TableHead className="text-right">WSP</TableHead>
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
                <TableCell className="text-right tabular-nums">{inr(r.wspValue)}{r.wspEstimated ? <span className="ml-1 text-foreground-lighter">est.</span> : null}</TableCell>
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
              <TableCell className="text-right tabular-nums">{inr(s.all.wspValue)}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(s.all.margin)}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(s.all.cn)}</TableCell>
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
