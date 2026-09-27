"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Boxes, FileSpreadsheet, Plus, Search, Trash2 } from "lucide-react";
import { inr } from "@/lib/calc";
import { readSkuSheet, type Cell } from "@/lib/excel";
import { normCode, priceOn, skusFromPurchases, withPrice } from "@/lib/recon";
import { newSku, useStore, type Sku, type SkuPrice } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";
import { FormField, NumberInput, fmtDate, today } from "@/components/app/fields";
import { NoBrand } from "@/components/app/no-brand";
import { Page } from "@/components/app/page";

const pct = (n: number | null) => (n === null ? "—" : `${+(n * 100).toFixed(2)}%`);
const LIMIT = 300;

export default function SkusPage() {
  const { data, brand, addSkus } = useStore();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Sku | null>(null);
  const [open, setOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  if (!brand) return <Page title="SKU master"><NoBrand /></Page>;

  const all = data.skus.filter((s) => s.brandId === brand.id);
  const needle = q.trim().toLowerCase();
  const list = needle ? all.filter((s) => [s.sku, s.barcode, s.name, s.category, s.hsn].some((v) => v.toLowerCase().includes(needle))) : all;
  const bought = data.purchases.filter((p) => p.brandId === brand.id && p.barcode).length;
  const d = today();

  const fromInvoices = () => {
    const r = skusFromPurchases(brand.id, data.purchases, data.skus, (patch) => newSku(brand.id, patch));
    addSkus(r.changed);
    toast.success(`SKU master built from ${bought.toLocaleString("en-IN")} invoice lines`, { description: `${r.created} new SKUs · ${r.repriced} price changes recorded` });
  };

  const fromExcel = async (f: File) => {
    try {
      const { default: readXlsx } = await import("read-excel-file/browser");
      const sheets = (await readXlsx(await f.arrayBuffer())) as { sheet: string; data: Cell[][] }[];
      const rows = sheets.map((s) => readSkuSheet(s.data)).find(Boolean);
      if (!rows) {
        toast.error("No SKU sheet found", { description: "The header row needs SKU (or Barcode) and MRP." });
        return;
      }
      const byCode = new Map(all.map((s) => [normCode(s.sku), s]));
      const out = new Map<string, Sku>();
      for (const r of rows) {
        const k = normCode(r.sku);
        const base = out.get(k) ?? byCode.get(k) ?? newSku(brand.id);
        const { from, mrp, wsp, purchaseRate, gstRate, ...details } = r;
        out.set(k, withPrice({ ...base, ...details }, { from, mrp, wsp, purchaseRate, gstRate, source: f.name }));
      }
      addSkus([...out.values()]);
      toast.success(`${out.size} SKUs imported from ${f.name}`);
    } catch (e) {
      toast.error(`Couldn't read ${f.name}`, { description: (e as Error).message });
    }
  };

  const actions = (
    <>
      <Button variant="default" icon={<FileSpreadsheet size={14} strokeWidth={1.5} />} onClick={() => file.current?.click()}>Import Excel</Button>
      <Button variant="default" disabled={!bought} onClick={fromInvoices}>Build from invoices</Button>
      <Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} onClick={() => { setEditing(null); setOpen(true); }}>New SKU</Button>
    </>
  );

  return (
    <Page title="SKU master" description={`${brand.name}'s products with their MRP, WSP, purchase rate, HSN and GST — each with its own history, so old claims keep the price they used.`} size="large" actions={actions}>
      <input ref={file} type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) fromExcel(f); e.target.value = ""; }} />
      {all.length === 0 ? (
        <Card className="py-16">
          <EmptyStatePresentational icon={Boxes} title="No SKUs yet"
            description={bought ? `Build the master from the ${bought.toLocaleString("en-IN")} invoice lines you imported, or import a SKU sheet (SKU, MRP, WSP, Purchase rate, HSN, GST %…).` : "Import a SKU sheet (SKU, MRP, WSP, Purchase rate, HSN, GST %…), or import the brand's invoices first and build it from them."}>
            <div className="flex gap-2">{actions}</div>
          </EmptyStatePresentational>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-3 border-b px-(--card-padding-x) py-3">
            <div className="relative w-72">
              <Search size={14} strokeWidth={1.5} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-lighter" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU, name, category, HSN" className="pl-8" />
            </div>
            <span className="ml-auto text-xs text-foreground-lighter">{list.length.toLocaleString("en-IN")} of {all.length.toLocaleString("en-IN")} SKUs · prices as of today</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead className="text-right">WSP</TableHead>
                <TableHead className="text-right">Purchase</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Prices</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.slice(0, LIMIT).map((s) => {
                const p = priceOn(s, d);
                return (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => { setEditing(s); setOpen(true); }}>
                    <TableCell>
                      <div className="font-mono text-xs text-foreground">{s.sku}</div>
                      {s.barcode && s.barcode !== s.sku ? <div className="font-mono text-xs text-foreground-lighter">{s.barcode}</div> : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-foreground-light">
                        {s.name || [s.category, s.size, s.colour].filter(Boolean).join(" · ") || "—"}
                        {!s.cnEligible ? <Badge variant="warning">No CN</Badge> : null}
                      </div>
                      <div className="text-xs text-foreground-lighter">{[s.division, s.department, s.category].filter(Boolean).join(" / ")}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.hsn || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{p ? inr(p.mrp, 0) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{p?.wsp != null ? inr(p.wsp) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{p?.purchaseRate != null ? inr(p.purchaseRate) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(p?.gstRate ?? null)}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground-lighter">{s.prices.length}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {list.length > LIMIT ? <p className="px-(--card-padding-x) py-3 text-xs text-foreground-lighter">Showing the first {LIMIT} — search to narrow down.</p> : null}
        </Card>
      )}
      <SkuSheet open={open} onOpenChange={setOpen} sku={editing} brandId={brand.id} />
    </Page>
  );
}

function SkuSheet({ open, onOpenChange, sku, brandId }: { open: boolean; onOpenChange: (o: boolean) => void; sku: Sku | null; brandId: string }) {
  const { data, saveSku, deleteSkus } = useStore();
  const [x, setX] = useState<Sku>(() => sku ?? newSku(brandId));
  const [reason, setReason] = useState("");
  const [seen, setSeen] = useState({ open, sku });
  if (seen.open !== open || seen.sku !== sku) {
    setSeen({ open, sku });
    if (open) {
      setX(sku ?? newSku(brandId, { prices: [{ from: today(), mrp: 0, wsp: null, purchaseRate: null, gstRate: null, source: "" }] }));
      setReason("");
    }
  }
  const set = (patch: Partial<Sku>) => setX((v) => ({ ...v, ...patch }));
  const setPrice = (i: number, patch: Partial<SkuPrice>) => set({ prices: x.prices.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const pricesChanged = !!sku && JSON.stringify(sku.prices) !== JSON.stringify(x.prices);
  const dup = data.skus.some((s) => s.brandId === brandId && s.id !== x.id && normCode(s.sku) === normCode(x.sku));

  const save = () => {
    saveSku({ ...x, sku: x.sku.trim(), prices: [...x.prices].sort((a, b) => a.from.localeCompare(b.from)) }, reason.trim());
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" className="flex w-full flex-col gap-0 p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{sku ? x.sku : "New SKU"}</SheetTitle>
          <SheetDescription>MRP, WSP and purchase rate are separate — the CN rule decides which one is the base.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="SKU" htmlFor="k-sku" hint={dup ? "Another SKU of this brand has this code" : undefined}>
              <Input id="k-sku" autoFocus value={x.sku} onChange={(e) => set({ sku: e.target.value })} className="font-mono" />
            </FormField>
            <FormField label="Barcode" htmlFor="k-bc"><Input id="k-bc" value={x.barcode} onChange={(e) => set({ barcode: e.target.value })} className="font-mono" /></FormField>
          </div>
          <FormField label="Product name" htmlFor="k-name"><Input id="k-name" value={x.name} onChange={(e) => set({ name: e.target.value })} /></FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Division" htmlFor="k-div"><Input id="k-div" value={x.division} onChange={(e) => set({ division: e.target.value })} /></FormField>
            <FormField label="Department" htmlFor="k-dep"><Input id="k-dep" value={x.department} onChange={(e) => set({ department: e.target.value })} /></FormField>
            <FormField label="Category" htmlFor="k-cat"><Input id="k-cat" value={x.category} onChange={(e) => set({ category: e.target.value })} /></FormField>
            <FormField label="Sub-category" htmlFor="k-sub"><Input id="k-sub" value={x.subCategory} onChange={(e) => set({ subCategory: e.target.value })} /></FormField>
            <FormField label="Size" htmlFor="k-size"><Input id="k-size" value={x.size} onChange={(e) => set({ size: e.target.value })} /></FormField>
            <FormField label="Colour" htmlFor="k-col"><Input id="k-col" value={x.colour} onChange={(e) => set({ colour: e.target.value })} /></FormField>
            <FormField label="HSN" htmlFor="k-hsn"><Input id="k-hsn" value={x.hsn} onChange={(e) => set({ hsn: e.target.value })} className="font-mono" /></FormField>
            <FormField label="Season" htmlFor="k-season"><Input id="k-season" value={x.season} onChange={(e) => set({ season: e.target.value })} /></FormField>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
            <div>
              <Label htmlFor="k-elig">CN eligible</Label>
              <p className="text-xs text-foreground-lighter">Off = no scheme rule pays a credit note on this SKU.</p>
            </div>
            <Switch id="k-elig" checked={x.cnEligible} onCheckedChange={(c) => set({ cnEligible: c })} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Prices from a date</Label>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>MRP</TableHead>
                    <TableHead>WSP</TableHead>
                    <TableHead>Purchase</TableHead>
                    <TableHead>GST %</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {x.prices.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Input type="date" value={p.from} onChange={(e) => setPrice(i, { from: e.target.value })} className="w-36" />
                        {p.source ? <div className="mt-1 text-xs text-foreground-lighter">{p.source}</div> : null}
                      </TableCell>
                      <TableCell><NumberInput value={p.mrp} onChange={(v) => setPrice(i, { mrp: v ?? 0 })} /></TableCell>
                      <TableCell><NumberInput allowEmpty value={p.wsp} onChange={(v) => setPrice(i, { wsp: v })} /></TableCell>
                      <TableCell><NumberInput allowEmpty value={p.purchaseRate} onChange={(v) => setPrice(i, { purchaseRate: v })} /></TableCell>
                      <TableCell><NumberInput allowEmpty percent value={p.gstRate} onChange={(v) => setPrice(i, { gstRate: v })} /></TableCell>
                      <TableCell>
                        <Button variant="text" size="tiny" className="h-7 w-7 px-0" icon={<Trash2 size={14} strokeWidth={1.5} />} aria-label="Remove price" onClick={() => set({ prices: x.prices.filter((_, j) => j !== i) })} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button variant="default" className="w-fit" icon={<Plus size={14} strokeWidth={1.5} />}
              onClick={() => { const last = x.prices[x.prices.length - 1]; set({ prices: [...x.prices, { ...(last ?? { mrp: 0, wsp: null, purchaseRate: null, gstRate: null }), from: today(), source: "Typed in" }] }); }}>
              New price from a date
            </Button>
            {x.prices.length ? <p className="text-xs text-foreground-lighter">Each invoice / sale uses the price in force on its date. First price from {fmtDate([...x.prices].sort((a, b) => a.from.localeCompare(b.from))[0].from)}.</p> : null}
          </div>
          {pricesChanged ? (
            <FormField label="Reason for the price change" htmlFor="k-reason" hint="Kept in the audit log">
              <Input id="k-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rate circular dated…" />
            </FormField>
          ) : null}
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-3">
          {sku ? <Button variant="text" className="mr-auto text-destructive" onClick={() => { deleteSkus([sku.id]); onOpenChange(false); }}>Delete SKU</Button> : null}
          <Button variant="default" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!x.sku.trim() || dup || !x.prices.length} onClick={save}>{sku ? "Save changes" : "Create SKU"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
