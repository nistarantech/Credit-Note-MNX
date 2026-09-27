"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { calcRow, inr, type Settings } from "@/lib/calc";
import type { Cell } from "@/lib/excel";
import { HOW_LABEL, matchRates, readDesigns, readRateSheet, type RateEntry, type RateHow } from "@/lib/rates";
import { useStore, type Brand } from "@/lib/store";
import { Admonition } from "@/components/ui-patterns/admonition";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogSection, DialogSectionSeparator, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Loaded {
  name: string;
  rates: RateEntry[];
}

const ORDER: RateHow[] = ["barcode", "item+mrp+season", "item+mrp", "mrp", "design", "none"];

/**
 * Load the brand's purchase rates — purchase register, invoices, stock reports
 * with a Pur. Rate — and give every unclaimed sale the rate it was bought at.
 */
export function RatesDialog({ open, onOpenChange, brand, settings }: { open: boolean; onOpenChange: (o: boolean) => void; brand: Brand; settings: Settings }) {
  const { data, setSaleRates } = useStore();
  const [files, setFiles] = useState<Loaded[]>([]);
  const [designs, setDesigns] = useState<Map<string, string>>(new Map());
  const [overwrite, setOverwrite] = useState(false);
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFiles([]);
    setDesigns(new Map());
    setOverwrite(false);
  };

  const read = async (list: FileList) => {
    setReading(true);
    const { default: readXlsx } = await import("read-excel-file/browser");
    const next = new Map(designs);
    const loaded: Loaded[] = [];
    for (const f of Array.from(list)) {
      try {
        const sheets = (await readXlsx(await f.arrayBuffer())) as { sheet: string; data: Cell[][] }[];
        const rates = sheets.flatMap((s) => readRateSheet(s.data, f.name));
        sheets.forEach((s) => readDesigns(s.data, next));
        loaded.push({ name: f.name, rates });
      } catch (e) {
        toast.error(`Couldn't read ${f.name}`, { description: (e as Error).message });
      }
    }
    setDesigns(next);
    setFiles((x) => [...x.filter((y) => !loaded.some((l) => l.name === y.name)), ...loaded]);
    setReading(false);
  };

  // unclaimed sales of this brand; by default only those still on an estimated WSP
  const target = useMemo(
    () => data.sales.filter((s) => s.brandId === brand.id && !s.claimId && (overwrite || s.wsp === null || s.wsp === undefined)),
    [data.sales, brand.id, overwrite],
  );
  const rates = files.flatMap((f) => f.rates);
  const matches = useMemo(() => (rates.length ? matchRates(target, rates, (b) => designs.get(b)) : []), [target, rates, designs]);
  const found = matches.filter((m) => m.wsp !== null);
  const byId = new Map(target.map((s) => [s.id, s]));
  const cn = (wsp: (id: string) => number | null | undefined) =>
    found.reduce((a, m) => { const s = byId.get(m.id)!; return a + calcRow({ ...s, wsp: wsp(m.id) ?? null }, settings).cn; }, 0);
  const before = found.length ? cn((id) => byId.get(id)!.wsp) : 0;
  const after = found.length ? cn((id) => found.find((m) => m.id === id)!.wsp) : 0;

  const apply = () => {
    setSaleRates(found.map((m) => ({ id: m.id, wsp: m.wsp, wspSource: m.wspSource })));
    toast.success(`Purchase rates set on ${found.length} ${brand.name} sales`, { description: `CN ₹ ${inr(before)} → ₹ ${inr(after)}` });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent size="large" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Purchase rates for {brand.name}</DialogTitle>
          <DialogDescription>
            The WSP each sale was actually bought at. Load the purchase register, the brand&apos;s invoices or a stock report with a Pur. Rate — several files at once is fine.
          </DialogDescription>
        </DialogHeader>
        <DialogSectionSeparator />
        <DialogSection className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex flex-col items-center gap-2 rounded-md border border-dashed border-strong px-6 py-6 text-center transition-colors hover:bg-surface-200 focus-ring"
          >
            <Upload size={18} strokeWidth={1.5} className="text-foreground-lighter" />
            <span className="text-sm text-foreground">{reading ? "Reading…" : "Choose .xlsx files"}</span>
            <span className="text-xs text-foreground-lighter">Needs a rate column (Pur. Rate, Purc Rate, Invoice Rate, WSP) and a barcode, or an item name with MRP.</span>
          </button>
          <input ref={input} type="file" accept=".xlsx" multiple hidden onChange={(e) => { if (e.target.files?.length) read(e.target.files); e.target.value = ""; }} />

          {files.length ? (
            <div className="flex flex-col gap-1">
              {files.map((f) => (
                <div key={f.name} className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet size={14} strokeWidth={1.5} className="text-foreground-lighter" />
                  <span className="flex-1 truncate text-foreground">{f.name}</span>
                  <span className={f.rates.length ? "text-xs text-foreground-lighter" : "text-xs text-warning-600"}>
                    {f.rates.length ? `${f.rates.length.toLocaleString("en-IN")} rates` : "no purchase rates found"}
                  </span>
                  <Button variant="text" size="tiny" className="h-6 w-6 px-0" icon={<X size={12} strokeWidth={1.5} />} aria-label="Remove file" onClick={() => setFiles((x) => x.filter((y) => y !== f))} />
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
            <div>
              <Label htmlFor="rt-over">Also replace rates already set</Label>
              <p className="text-xs text-foreground-lighter">Off = only sales still on an estimated WSP (MRP × {settings.wspFactor}). Sales in a claim are never changed.</p>
            </div>
            <Switch id="rt-over" checked={overwrite} onCheckedChange={setOverwrite} />
          </div>

          {rates.length ? (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Matched by</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ORDER.map((how) => {
                      const n = matches.filter((m) => m.how === how).length;
                      return n ? (
                        <TableRow key={how}>
                          <TableCell className={how === "none" ? "text-warning-600" : "text-foreground-light"}>{HOW_LABEL[how]}{how === "none" ? " — stays estimated" : ""}</TableCell>
                          <TableCell className="text-right tabular-nums">{n}</TableCell>
                        </TableRow>
                      ) : null;
                    })}
                  </TableBody>
                </Table>
              </div>
              {found.length ? (
                <Admonition type="default" title={`${found.length} of ${target.length} sales get their purchase rate`} description={`Credit note on these sales: ₹ ${inr(before)} → ₹ ${inr(after)}.`} />
              ) : (
                <Admonition type="warning" title="No sale matched" description="Check that the files are this brand's, and that barcodes or item names with MRP line up with your sales." />
              )}
            </>
          ) : null}
        </DialogSection>
        <DialogFooter>
          <Button variant="default" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!found.length} onClick={apply}>Set rates on {found.length} sales</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
