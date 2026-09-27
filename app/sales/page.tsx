"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Copy, FileSpreadsheet, MoreHorizontal, Pencil, Plus, ReceiptText, Search, Trash2 } from "lucide-react";
import { calcRow, inr, summarize, uid } from "@/lib/calc";
import { monthLabel, monthOf, salesMonths } from "@/lib/month";
import { calcSettings, useStore, type Sale } from "@/lib/store";
import { partyStats } from "@/lib/stats";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";
import { fmtDate } from "@/components/app/fields";
import { Metric } from "@/components/app/metric";
import { ImportDialog } from "@/components/app/import-dialog";
import { NoParty } from "@/components/app/no-party";
import { Page } from "@/components/app/page";
import { SaleSheet } from "@/components/app/sale-sheet";

const PAGE = 100;

export default function SalesPage() {
  const { data, party, saveSale, deleteSales } = useStore();
  const [sheet, setSheet] = useState<{ open: boolean; sale: Sale | null }>({ open: false, sale: null });
  const [importing, setImporting] = useState(false);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [month, setMonth] = useState("all");

  // Month-end links here with ?month=2025-09
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("month");
    if (m) {
      setMonth(m);
      setStatus("all");
    }
  }, []);

  const settings = calcSettings(data.globals, party);
  const stats = party ? partyStats(data, party) : null;
  const rows = useMemo(() => {
    if (!stats) return [];
    const needle = q.trim().toLowerCase();
    return stats.sales
      .filter((s) => month === "all" || monthOf(s.date) === month)
      .filter((s) => (status === "all" ? true : status === "open" ? !s.noteId : !!s.noteId))
      .filter((s) => type === "all" || s.type === type)
      .filter((s) => !needle || [s.billNo, s.barcode, s.department, s.division, s.ageing].some((v) => v.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.billNo.localeCompare(a.billNo))
      .map((s) => ({ sale: s, row: calcRow(s, settings) }));
  }, [stats, q, status, type, settings, month]);

  if (!party || !stats) {
    return (
      <Page title="Sales">
        <NoParty />
      </Page>
    );
  }

  const noteNo = (id: string | null) => data.notes.find((n) => n.id === id)?.number ?? "Credited";
  const tot = rows.reduce((a, { row }) => ({ qty: a.qty + row.qty, sale: a.sale + row.realization, margin: a.margin + row.margin, cn: a.cn + row.cn }), { qty: 0, sale: 0, margin: 0, cn: 0 });
  const p = stats.pending;
  const months = salesMonths(stats.sales);
  // With a month picked, the tiles describe that month (settled or not).
  const monthSum = month === "all" ? null : summarize(stats.sales.filter((s) => monthOf(s.date) === month), settings);

  return (
    <Page
      title="Sales"
      description={`What ${party.name} sold to customers. Open sales go into the next credit note.`}
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
          <Metric label="Dealer margin" value={`₹ ${inr(monthSum.all.margin)}`} />
          <Metric label={`Credit note · ${monthLabel(month, "short")}`} value={`₹ ${inr(monthSum.totalCn)}`} tooltip="For all of the month's sales, settled or not" strong />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Metric label="Open sales" value={`${inr(p.all.qty, 0)} pcs`} />
          <Metric label="Sale value" value={`₹ ${inr(p.all.realization)}`} />
          <Metric label="Dealer margin" value={`₹ ${inr(p.all.margin)}`} />
          <Metric label="Credit due" value={`₹ ${inr(p.totalCn)}`} tooltip="Credit note the party should get for open sales" strong />
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b px-(--card-padding-x) py-3">
          <InputGroup className="w-64">
            <InputGroupAddon><Search size={14} strokeWidth={1.5} /></InputGroupAddon>
            <InputGroupInput placeholder="Search bill no., barcode, item…" value={q} onChange={(e) => setQ(e.target.value)} />
          </InputGroup>
          <Select value={month} onValueChange={(v) => { setMonth(v); setLimit(PAGE); }}>
            <SelectTrigger size="tiny" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <ToggleGroup type="single" value={status} onValueChange={(v) => v && setStatus(v)} className="gap-1 rounded-md bg-surface-200 p-1">
            <ToggleGroupItem value="open" size="tiny">Open</ToggleGroupItem>
            <ToggleGroupItem value="credited" size="tiny">Credited</ToggleGroupItem>
            <ToggleGroupItem value="all" size="tiny">All</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="single" value={type} onValueChange={(v) => v && setType(v)} className="gap-1 rounded-md bg-surface-200 p-1">
            <ToggleGroupItem value="all" size="tiny">All types</ToggleGroupItem>
            <ToggleGroupItem value="DISC" size="tiny">EOSS</ToggleGroupItem>
            <ToggleGroupItem value="FRESH" size="tiny">Fresh</ToggleGroupItem>
          </ToggleGroup>
          <span className="ml-auto text-xs text-foreground-lighter">{rows.length} sales</span>
        </div>

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
                <TableHead>Date</TableHead>
                <TableHead>Bill</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">MRP × qty</TableHead>
                <TableHead className="text-right">Disc.</TableHead>
                <TableHead className="text-right">Sale value</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, limit).map(({ sale, row }) => (
                <TableRow key={sale.id} className="cursor-pointer" onClick={() => setSheet({ open: true, sale })}>
                  <TableCell className="whitespace-nowrap text-foreground-light">{fmtDate(sale.date)}</TableCell>
                  <TableCell className="font-mono text-xs">{sale.billNo || "—"}</TableCell>
                  <TableCell>
                    <div className="whitespace-nowrap text-foreground">{[sale.division, sale.department].filter(Boolean).join(" · ") || "—"}</div>
                    <div className="whitespace-nowrap font-mono text-xs text-foreground-lighter">{sale.barcode}{sale.ageing ? ` · ${sale.ageing}` : ""}</div>
                  </TableCell>
                  <TableCell>{sale.type === "DISC" ? <Badge>EOSS</Badge> : <Badge variant="success">Fresh</Badge>}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {inr(sale.mrp, 0)} × {sale.qty}
                    {sale.qty < 0 ? <span className="ml-1 text-xs text-destructive">return</span> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground-light">{+(sale.disc * 100).toFixed(2)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(row.realization)}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground-light">{inr(row.margin)}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">{inr(row.cn)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {sale.noteId ? <span className="font-mono text-xs text-foreground-lighter">{noteNo(sale.noteId)}</span> : <Badge variant="warning">Open</Badge>}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="text" size="tiny" className="h-7 w-7 px-0" icon={<MoreHorizontal size={14} strokeWidth={1.5} />} aria-label="Actions" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem className="gap-2" onSelect={() => setSheet({ open: true, sale })}>
                          <Pencil size={14} strokeWidth={1.5} /> {sale.noteId ? "View" : "Edit"}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2" onSelect={() => saveSale({ ...sale, id: uid(), noteId: null })}>
                          <Copy size={14} strokeWidth={1.5} /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 text-destructive" disabled={!!sale.noteId} onSelect={() => deleteSales([sale.id])}>
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
                <TableCell colSpan={4} className="text-foreground-light">Total of {rows.length} sales</TableCell>
                <TableCell className="text-right tabular-nums">{inr(tot.qty, 0)} pcs</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">{inr(tot.sale)}</TableCell>
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
            {stats.open.length} open sales are ready to settle for <span className="text-foreground">₹ {inr(p.totalCn)}</span>.
          </span>
          <Button variant="primary" asChild><Link href={month === "all" ? "/month-end/" : `/credit-notes/?new=1&month=${month}`}>{month === "all" ? "Go to month-end" : `Credit note for ${monthLabel(month, "short")}`}</Link></Button>
        </div>
      ) : null}

      <SaleSheet
        open={sheet.open}
        onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))}
        sale={sheet.sale}
        partyId={party.id}
        settings={settings}
        last={stats.sales[stats.sales.length - 1]}
      />
      <ImportDialog open={importing} onOpenChange={setImporting} partyId={party.id} partyName={party.name} settings={settings} />
    </Page>
  );
}
