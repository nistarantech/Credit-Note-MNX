"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, FileSpreadsheet, MoreHorizontal, Pencil, Plus, ReceiptText, Search, Trash2, X } from "lucide-react";
import { GST_RATES, calcRow, inr, summarize, uid, type Row } from "@/lib/calc";
import { monthLabel, monthOf, salesMonths } from "@/lib/month";
import { calcSettings, useStore, type Sale } from "@/lib/store";
import { brandStats } from "@/lib/stats";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogSection, DialogSectionSeparator, DialogTitle,
} from "@/components/ui/dialog";
import { FormField, NumberInput, fmtDate } from "@/components/app/fields";
import { MARGIN_PRESETS } from "@/components/app/margin-select";
import { Metric } from "@/components/app/metric";
import { ImportDialog } from "@/components/app/import-dialog";
import { NoBrand } from "@/components/app/no-brand";
import { Page } from "@/components/app/page";
import { SaleSheet } from "@/components/app/sale-sheet";

const PAGE = 100;
const pc = (n: number) => `${+(n * 100).toFixed(2)}%`;
const key = (n: number) => String(+n.toFixed(6));

export default function SalesPage() {
  const { data, brand, saveSale, deleteSales, updateSales } = useStore();
  const [sheet, setSheet] = useState<{ open: boolean; sale: Sale | null }>({ open: false, sale: null });
  const [importing, setImporting] = useState(false);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("open");
  const [margin, setMargin] = useState("all"); // all | brand | custom | <rate>
  const [gst, setGst] = useState("all"); // all | <rate>
  const [offer, setOffer] = useState("all"); // all | flat | cashback | none
  const [amounts, setAmounts] = useState<{ flatDisc: number | null; cashback: number | null } | null>(null);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [month, setMonth] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Month-end links here with ?month=2025-09
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("month");
    if (m) {
      setMonth(m);
      setStatus("all");
    }
  }, []);

  const settings = calcSettings(data.globals, brand);
  const stats = brand ? brandStats(data, brand) : null;

  // Everything but the margin/GST filters, so their dropdowns can show counts.
  const base = useMemo(() => {
    if (!stats) return [] as { sale: Sale; row: Row }[];
    const needle = q.trim().toLowerCase();
    return stats.sales
      .filter((s) => month === "all" || monthOf(s.date) === month)
      .filter((s) => (status === "all" ? true : status === "open" ? !s.claimId : !!s.claimId))
      .filter((s) => type === "all" || s.type === type)
      .filter((s) => !needle || [s.billNo, s.barcode, s.department, s.division, s.ageing].some((v) => v.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.billNo.localeCompare(a.billNo))
      .map((s) => ({ sale: s, row: calcRow(s, settings) }));
  }, [stats, q, status, type, settings, month]);

  const rows = base
    .filter(({ row }) => margin === "all" || (margin === "brand" ? !row.marginCustom : margin === "custom" ? row.marginCustom : key(row.marginPct) === margin))
    .filter(({ row }) => gst === "all" || key(row.gstRate) === gst)
    .filter(({ row }) =>
      offer === "all" ? true : offer === "flat" ? row.flatDiscAmt !== 0 : offer === "cashback" ? row.cashbackAmt !== 0 : !row.flatDiscAmt && !row.cashbackAmt,
    );

  if (!brand || !stats) {
    return (
      <Page title="Sales">
        <NoBrand />
      </Page>
    );
  }

  const count = (f: (r: Row) => boolean) => base.filter(({ row }) => f(row)).length;
  const marginRates = [...new Set(base.map(({ row }) => key(row.marginPct)))].sort((a, b) => +a - +b);
  const gstRates = [...new Set(base.map(({ row }) => key(row.gstRate)))].sort((a, b) => +a - +b);

  const claimNo = (id: string | null) => data.claims.find((n) => n.id === id)?.number ?? "Claimed";
  const tot = rows.reduce((a, { row }) => ({ qty: a.qty + row.qty, sale: a.sale + row.realization, margin: a.margin + row.margin, cn: a.cn + row.cn }), { qty: 0, sale: 0, margin: 0, cn: 0 });
  const p = stats.pending;
  const months = salesMonths(stats.sales);
  // With a month picked, the tiles describe that month (claimed or not).
  const monthSum = month === "all" ? null : summarize(stats.sales.filter((s) => monthOf(s.date) === month), settings);

  const shown = rows.slice(0, limit);
  const editable = rows.filter(({ sale }) => !sale.claimId);
  const picked = [...selected].filter((id) => editable.some(({ sale }) => sale.id === id));
  const allPicked = editable.length > 0 && picked.length === editable.length;
  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const apply = (patch: Partial<Sale>, what: string) => {
    updateSales(picked, patch);
    toast.success(`${what} for ${picked.length} sales`);
  };

  return (
    <Page
      title="Sales"
      description={`Your sales of ${brand.name} goods. Unclaimed sales go into the next claim.`}
      size="large"
      actions={
        <>
          <Button variant="default" icon={<FileSpreadsheet size={14} strokeWidth={1.5} />} onClick={() => setImporting(true)}>Import from Excel</Button>
          <Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} onClick={() => setSheet({ open: true, sale: null })}>New sale</Button>
        </>
      }
    >
      {monthSum ? (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Metric label={`Sold in ${monthLabel(month, "short")}`} value={`${inr(monthSum.all.qty, 0)} pcs`} />
          <Metric label="Sale value" value={`₹ ${inr(monthSum.all.realization)}`} />
          <Metric label="Your margin" value={`₹ ${inr(monthSum.all.margin)}`} />
          <Metric label={`CN to claim · ${monthLabel(month, "short")}`} value={`₹ ${inr(monthSum.totalCn)}`} tooltip="For all of the month's sales, claimed or not" strong />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Metric label="Unclaimed sales" value={`${inr(p.all.qty, 0)} pcs`} />
          <Metric label="Sale value" value={`₹ ${inr(p.all.realization)}`} />
          <Metric label="Your margin" value={`₹ ${inr(p.all.margin)}`} />
          <Metric label="CN to claim" value={`₹ ${inr(p.totalCn)}`} tooltip="Credit note you can claim from the brand for unclaimed sales" strong />
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b px-(--card-padding-x) py-3">
          <InputGroup className="w-60">
            <InputGroupAddon><Search size={14} strokeWidth={1.5} /></InputGroupAddon>
            <InputGroupInput placeholder="Search bill no., barcode, item…" value={q} onChange={(e) => setQ(e.target.value)} />
          </InputGroup>
          <Filter value={month} onChange={(v) => { setMonth(v); setLimit(PAGE); }} width="w-40">
            <SelectItem value="all">All months</SelectItem>
            {months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
          </Filter>
          <Filter value={status} onChange={setStatus} width="w-36">
            <SelectItem value="open">Unclaimed</SelectItem>
            <SelectItem value="credited">Claimed</SelectItem>
            <SelectItem value="all">Claimed or not</SelectItem>
          </Filter>
          <Filter value={type} onChange={setType} width="w-32">
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="DISC">EOSS</SelectItem>
            <SelectItem value="FRESH">Fresh</SelectItem>
          </Filter>
          <Filter value={margin} onChange={setMargin} width="w-48">
            <SelectItem value="all">All margins</SelectItem>
            <SelectSeparator />
            <SelectItem value="brand">Brand terms ({count((r) => !r.marginCustom)})</SelectItem>
            <SelectItem value="custom">Custom margin ({count((r) => r.marginCustom)})</SelectItem>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Margin %</SelectLabel>
              {marginRates.map((m) => <SelectItem key={m} value={m}>{pc(+m)} ({count((r) => key(r.marginPct) === m)})</SelectItem>)}
            </SelectGroup>
          </Filter>
          <Filter value={gst} onChange={setGst} width="w-36">
            <SelectItem value="all">All GST rates</SelectItem>
            <SelectSeparator />
            {gstRates.map((g) => <SelectItem key={g} value={g}>GST {pc(+g)} ({count((r) => key(r.gstRate) === g)})</SelectItem>)}
          </Filter>
          <Filter value={offer} onChange={setOffer} width="w-44">
            <SelectItem value="all">All offers</SelectItem>
            <SelectSeparator />
            <SelectItem value="flat">Flat discount ({count((r) => r.flatDiscAmt !== 0)})</SelectItem>
            <SelectItem value="cashback">Cashback ({count((r) => r.cashbackAmt !== 0)})</SelectItem>
            <SelectItem value="none">Neither ({count((r) => !r.flatDiscAmt && !r.cashbackAmt)})</SelectItem>
          </Filter>
          <span className="ml-auto text-xs text-foreground-lighter">{rows.length} sales</span>
        </div>

        {picked.length ? (
          <div className="flex flex-wrap items-center gap-2 border-b bg-surface-75 px-(--card-padding-x) py-2">
            <span className="text-sm text-foreground">{picked.length} selected</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="default" size="tiny">Set margin</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onSelect={() => apply({ marginOverride: null }, "Brand terms restored")}>Brand terms</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Custom margin</DropdownMenuLabel>
                {MARGIN_PRESETS.map((m) => (
                  <DropdownMenuItem key={m} onSelect={() => apply({ marginOverride: m }, `Margin ${pc(m)} set`)}>{pc(m)}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="default" size="tiny">Set GST</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onSelect={() => apply({ gstRateOverride: null }, "GST back to the rate history")}>As per rate history</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Fixed GST in sale price</DropdownMenuLabel>
                {GST_RATES.map((g) => (
                  <DropdownMenuItem key={g} onSelect={() => apply({ gstRateOverride: g }, `GST ${pc(g)} set`)}>{pc(g)}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="default" size="tiny" onClick={() => setAmounts({ flatDisc: null, cashback: null })}>Flat discount / cashback</Button>
            <Button variant="text" size="tiny" icon={<X size={14} strokeWidth={1.5} />} onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <div className="py-16">
            <EmptyStatePresentational
              icon={ReceiptText}
              title={stats.sales.length ? "No sales match" : "No sales yet"}
              description={stats.sales.length ? "Try a different filter or search." : "Add a sale by hand or import the rows from your Excel sheet."}
            >
              {!stats.sales.length ? (
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => setSheet({ open: true, sale: null })}>New sale</Button>
                  <Button variant="default" onClick={() => setImporting(true)}>Import from Excel</Button>
                </div>
              ) : null}
            </EmptyStatePresentational>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    aria-label="Select all unclaimed sales shown"
                    checked={allPicked ? true : picked.length ? "indeterminate" : false}
                    onCheckedChange={(c) => setSelected(c ? new Set(editable.map(({ sale }) => sale.id)) : new Set())}
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Bill</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">MRP × qty</TableHead>
                <TableHead className="text-right">Disc.</TableHead>
                <TableHead className="text-right">Sale value</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">CN</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map(({ sale, row }) => (
                <TableRow key={sale.id} className="cursor-pointer" onClick={() => setSheet({ open: true, sale })}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label="Select sale"
                      disabled={!!sale.claimId}
                      checked={selected.has(sale.id) && !sale.claimId}
                      onCheckedChange={(c) => toggle(sale.id, !!c)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-foreground-light">{fmtDate(sale.date)}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{sale.billNo || "—"}</TableCell>
                  <TableCell>
                    <div className="whitespace-nowrap text-foreground">{[sale.division, sale.department].filter(Boolean).join(" · ") || "—"}</div>
                    <div className="whitespace-nowrap font-mono text-xs text-foreground-lighter">{sale.barcode}{sale.ageing ? ` · ${sale.ageing}` : ""}</div>
                  </TableCell>
                  <TableCell>{sale.type === "DISC" ? <Badge>EOSS</Badge> : <Badge variant="success">Fresh</Badge>}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {inr(sale.mrp, 0)} × {sale.qty}
                    {sale.qty < 0 ? <span className="ml-1 text-xs text-destructive">return</span> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap text-foreground-light">
                    <div>{pc(sale.disc)}{row.flatDiscAmt ? ` + ₹ ${inr(row.flatDiscAmt, 0)}` : ""}</div>
                    {row.cashbackAmt ? <div className="text-xs text-foreground-lighter">cashback ₹ {inr(row.cashbackAmt, 0)}</div> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{inr(row.realization)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap text-foreground-light">
                    {pc(row.gstRate)}
                    {sale.gstRateOverride != null ? <Badge variant="warning" className="ml-1.5">Fixed</Badge> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    <div className="text-foreground-light">
                      {row.marginCustom ? <Badge variant="warning" className="mr-1.5">Custom</Badge> : null}
                      {pc(row.marginPct)}
                    </div>
                    <div className="text-xs text-foreground-lighter">{inr(row.margin)}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">{inr(row.cn)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {sale.claimId ? <span className="font-mono text-xs text-foreground-lighter">{claimNo(sale.claimId)}</span> : <Badge variant="warning">Unclaimed</Badge>}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="text" size="tiny" className="h-7 w-7 px-0" icon={<MoreHorizontal size={14} strokeWidth={1.5} />} aria-label="Actions" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem className="gap-2" onSelect={() => setSheet({ open: true, sale })}>
                          <Pencil size={14} strokeWidth={1.5} /> {sale.claimId ? "View" : "Edit"}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2" onSelect={() => saveSale({ ...sale, id: uid(), claimId: null, importId: null })}>
                          <Copy size={14} strokeWidth={1.5} /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 text-destructive" disabled={!!sale.claimId} onSelect={() => deleteSales([sale.id])}>
                          <Trash2 size={14} strokeWidth={1.5} /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="text-foreground-light">Total of {rows.length} sales</TableCell>
                <TableCell className="text-right tabular-nums">{inr(tot.qty, 0)} pcs</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">{inr(tot.sale)}</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">{inr(tot.margin)}</TableCell>
                <TableCell className="text-right tabular-nums text-foreground">{inr(tot.cn)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        )}
        {rows.length > limit ? (
          <div className="flex justify-center border-t py-3">
            <Button variant="default" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</Button>
          </div>
        ) : null}
      </Card>

      {p.all.qty !== 0 && status !== "credited" ? (
        <div className="flex items-center justify-between rounded-md border bg-surface-75 px-4 py-3">
          <span className="text-sm text-foreground-light">
            {stats.open.length} unclaimed sales are worth a claim of <span className="text-foreground">₹ {inr(p.totalCn)}</span>.
          </span>
          <Button variant="primary" asChild><Link href={month === "all" ? "/month-end/" : `/claims/?new=1&month=${month}`}>{month === "all" ? "Go to month-end" : `Claim ${monthLabel(month, "short")}`}</Link></Button>
        </div>
      ) : null}

      <SaleSheet
        open={sheet.open}
        onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))}
        sale={sheet.sale}
        brandId={brand.id}
        settings={settings}
        last={stats.sales[stats.sales.length - 1]}
        suggest={{
          division: [...new Set(stats.sales.map((s) => s.division).filter(Boolean))].sort(),
          department: [...new Set(stats.sales.map((s) => s.department).filter(Boolean))].sort(),
          ageing: [...new Set(stats.sales.map((s) => s.ageing).filter(Boolean))].sort(),
        }}
      />
      <Dialog open={!!amounts} onOpenChange={(o) => !o && setAmounts(null)}>
        <DialogContent size="small">
          <DialogHeader>
            <DialogTitle>Flat discount &amp; cashback</DialogTitle>
            <DialogDescription>For each of the {picked.length} selected sales (whole line). Leave empty to remove.</DialogDescription>
          </DialogHeader>
          <DialogSectionSeparator />
          <DialogSection className="flex flex-col gap-4">
            <FormField label="Flat discount (₹)" htmlFor="b-flat" hint="Taken off the bill, lowers GST too">
              <NumberInput id="b-flat" prefix="₹" allowEmpty placeholder="0" value={amounts?.flatDisc ?? null} onChange={(v) => setAmounts((a) => a && { ...a, flatDisc: v })} />
            </FormField>
            <FormField label="Cashback to customer (₹)" htmlFor="b-cash" hint="Paid after billing, lowers what you keep">
              <NumberInput id="b-cash" prefix="₹" allowEmpty placeholder="0" value={amounts?.cashback ?? null} onChange={(v) => setAmounts((a) => a && { ...a, cashback: v })} />
            </FormField>
          </DialogSection>
          <DialogFooter>
            <Button variant="default" onClick={() => setAmounts(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!amounts) return;
                apply({ flatDisc: amounts.flatDisc || null, cashback: amounts.cashback || null }, "Flat discount and cashback set");
                setAmounts(null);
              }}
            >
              Apply to {picked.length} sales
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImportDialog open={importing} onOpenChange={setImporting} brand={brand} settings={settings} />
    </Page>
  );
}

function Filter({ value, onChange, width, children }: { value: string; onChange: (v: string) => void; width: string; children: React.ReactNode }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="tiny" className={width}><SelectValue /></SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}
