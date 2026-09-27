"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Upload } from "lucide-react";
import { inr, summarize, uid, type Settings } from "@/lib/calc";
import { linkPurchases, monthsOf, readPaste, readSheet, type Cell, type SheetFound } from "@/lib/excel";
import { monthLabel } from "@/lib/month";
import { useStore, type Brand, type ImportRecord, type Purchase, type Sale } from "@/lib/store";
import { Admonition } from "@/components/ui-patterns/admonition";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogSection, DialogSectionSeparator, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface Source {
  fileName: string;
  bytes: ArrayBuffer | null; // the original file, kept in the data folder (desktop)
  found: SheetFound[];
}

/** Import a brand's sales (and purchase invoices) from an Excel file or pasted rows, month by month. */
export function ImportDialog({
  open, onOpenChange, brand, settings,
}: { open: boolean; onOpenChange: (o: boolean) => void; brand: Brand; settings: Settings }) {
  const { data, importBatch } = useStore();
  const [tab, setTab] = useState("file");
  const [source, setSource] = useState<Source | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [replace, setReplace] = useState(true);
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setSource(null);
    setPicked(new Set());
    setText("");
    setError(null);
  };

  const readFile = async (file: File) => {
    setReading(true);
    setError(null);
    try {
      const { default: readXlsx } = await import("read-excel-file/browser");
      const bytes = await file.arrayBuffer();
      const sheets = (await readXlsx(bytes)) as { sheet: string; data: Cell[][] }[];
      const found = sheets.map((s) => readSheet(s.sheet, s.data)).filter((x): x is SheetFound => !!x);
      if (!found.length) setError(`No sales or purchase sheet found in ${file.name}. The header row needs at least Bill Date, Mrp and Qty (or INVOICE_DATE, INVOICE_RATE, INVOICE_QTY).`);
      setSource({ fileName: file.name, bytes, found });
      setPicked(new Set(found.map((f) => f.sheet)));
    } catch (e) {
      setError(`Couldn't read ${file.name}: ${(e as Error).message}`);
    } finally {
      setReading(false);
    }
  };

  const pasted = tab === "paste" && text ? readPaste(text) : null;
  const active: SheetFound[] = tab === "paste" ? (pasted ? [pasted] : []) : (source?.found ?? []).filter((f) => picked.has(f.sheet));

  // Month-by-month preview of what will come in, and what is already there.
  const sales = active.flatMap((f) => f.sales);
  const buys = active.flatMap((f) => f.purchases);
  const months = monthsOf([...sales, ...buys].map((x) => x.date)).reverse();
  const existing = (month: string, kind: ImportRecord["kind"]) =>
    data.imports.filter((i) => i.brandId === brand.id && i.month === month && i.kind === kind);
  const clash = months.some((m) => (sales.some((s) => s.date.startsWith(m)) && existing(m, "sales").length) || (buys.some((p) => p.date.startsWith(m)) && existing(m, "purchases").length));

  const doImport = async () => {
    const fileName = tab === "paste" ? `Pasted ${new Date().toLocaleString("en-IN")}` : source!.fileName;
    const now = new Date().toISOString();
    const records: ImportRecord[] = [];
    const recordFor = new Map<string, ImportRecord>();
    const rec = (kind: ImportRecord["kind"], month: string, sheet: string) => {
      const k = `${kind}|${month}`;
      if (!recordFor.has(k)) {
        const r: ImportRecord = { id: uid(), brandId: brand.id, kind, month, fileName, sheet, storedPath: null, rowCount: 0, importedAt: now };
        recordFor.set(k, r);
        records.push(r);
      }
      const r = recordFor.get(k)!;
      r.rowCount++;
      if (!r.sheet.split(", ").includes(sheet)) r.sheet = r.sheet ? `${r.sheet}, ${sheet}` : sheet;
      return r.id;
    };

    const newBuys: Purchase[] = [];
    const newSales: Sale[] = [];
    for (const f of active) {
      for (const p of f.purchases) newBuys.push({ ...p, brandId: brand.id, importId: rec("purchases", p.date.slice(0, 7), f.sheet) });
    }
    const knownRates = [...data.purchases.filter((p) => p.brandId === brand.id), ...newBuys];
    for (const f of active) {
      for (const l of linkPurchases(f.sales, knownRates, settings)) {
        newSales.push({ ...l, brandId: brand.id, claimId: null, importId: rec("sales", l.date.slice(0, 7), f.sheet) });
      }
    }

    // Desktop: keep the original workbook, filed as imports/<brand>/<month>/<file>.
    const files = typeof window !== "undefined" ? window.desktop?.files : undefined;
    if (files && source?.bytes && tab === "file") {
      try {
        const stored = await files.storeImport({
          brand: brand.code || brand.name,
          months: [...new Set(records.map((r) => r.month))],
          fileName: source.fileName,
          bytes: source.bytes,
        });
        for (const r of records) r.storedPath = stored[r.month] ?? null;
      } catch {
        toast.warning("Imported, but the original file couldn't be copied to the data folder");
      }
    }

    importBatch({ imports: records, sales: newSales, purchases: newBuys, replace });
    toast.success(`Imported into ${brand.name}`, {
      description: [newSales.length && `${newSales.length} sales`, newBuys.length && `${newBuys.length} purchase lines`, `${months.length} month${months.length > 1 ? "s" : ""}`]
        .filter(Boolean)
        .join(" · "),
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent size="xlarge" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import into {brand.name}</DialogTitle>
          <DialogDescription>Your sales of this brand, and its invoices to you. Everything is filed by month.</DialogDescription>
        </DialogHeader>
        <DialogSectionSeparator />
        <DialogSection className="flex flex-col gap-4">
          <Tabs value={tab} onValueChange={(t) => { setTab(t); setError(null); }}>
            <TabsList className="gap-6">
              <TabsTrigger value="file">Excel file</TabsTrigger>
              <TabsTrigger value="paste">Paste rows</TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="flex flex-col gap-4">
              {!source ? (
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files[0];
                    if (f) readFile(f);
                  }}
                  className={`flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-center transition-colors focus-ring ${dragging ? "border-brand bg-surface-200" : "border-strong hover:bg-surface-200"}`}
                >
                  <Upload size={20} strokeWidth={1.5} className="text-foreground-lighter" />
                  <span className="text-sm text-foreground">{reading ? "Reading…" : "Choose an .xlsx file or drop it here"}</span>
                  <span className="text-xs text-foreground-lighter">
                    Sales sheets (Bill Date, Mrp, Qty, Disc %, Slab…) and invoice sheets (INVOICE_DATE, INVOICE_RATE…) are found automatically.
                  </span>
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <FileSpreadsheet size={16} strokeWidth={1.5} className="text-foreground-lighter" />
                    <span className="flex-1 truncate text-foreground">{source.fileName}</span>
                    <Button variant="text" size="tiny" onClick={reset}>Choose another</Button>
                  </div>
                  {source.found.map((f) => (
                    <label key={f.sheet} className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 hover:bg-surface-200">
                      <Checkbox
                        className="mt-0.5"
                        checked={picked.has(f.sheet)}
                        onCheckedChange={(c) => setPicked((p) => { const n = new Set(p); if (c) n.add(f.sheet); else n.delete(f.sheet); return n; })}
                      />
                      <div className="flex flex-1 flex-col">
                        <span className="text-sm text-foreground">
                          {f.sheet} <span className="text-foreground-lighter">· {f.kind === "sales" ? "your sales" : "brand's invoices to you"}</span>
                        </span>
                        <span className="text-xs text-foreground-lighter">
                          Header on row {f.headerRow} · {(f.sales.length || f.purchases.length).toLocaleString("en-IN")} rows
                          {f.skipped ? ` · ${f.skipped} total/blank rows left out` : ""}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
            </TabsContent>

            <TabsContent value="paste" className="flex flex-col gap-2">
              <Textarea autoFocus rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Copy rows in Excel, including the header row, and paste here" className="font-mono text-xs" />
              {text && !pasted ? <p className="text-xs text-destructive">No header row found — include the row with Bill Date, Mrp and Qty.</p> : null}
            </TabsContent>
          </Tabs>

          {error ? <Admonition type="warning" title="Nothing to import" description={error} /> : null}

          {months.length ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                      <TableHead className="text-right">Sale value</TableHead>
                      <TableHead className="text-right">CN to claim</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                      <TableHead>Imported before</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {months.map((m) => {
                      const ms = sales.filter((s) => s.date.startsWith(m));
                      const mb = buys.filter((p) => p.date.startsWith(m));
                      const sum = summarize(ms, settings);
                      const before = [...(ms.length ? existing(m, "sales") : []), ...(mb.length ? existing(m, "purchases") : [])];
                      return (
                        <TableRow key={m}>
                          <TableCell className="whitespace-nowrap text-foreground">{monthLabel(m, "short")}</TableCell>
                          <TableCell className="text-right tabular-nums">{ms.length || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{ms.length ? inr(sum.all.realization) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums text-foreground">{ms.length ? `₹ ${inr(sum.totalCn)}` : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{mb.length || "—"}</TableCell>
                          <TableCell className="text-xs text-foreground-lighter">
                            {before.length ? before.map((i) => `${i.rowCount} ${i.kind} from ${i.fileName}`).join("; ") : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {clash ? (
                <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
                  <div>
                    <Label htmlFor="imp-replace">Replace what was imported before for these months</Label>
                    <p className="text-xs text-foreground-lighter">
                      Use this when re-importing a corrected sheet. Sales already in a claim are kept either way. Off = add to what is there.
                    </p>
                  </div>
                  <Switch id="imp-replace" checked={replace} onCheckedChange={setReplace} />
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogSection>
        <DialogFooter>
          <Button variant="default" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!months.length} onClick={doImport}>
            Import {sales.length ? `${sales.length.toLocaleString("en-IN")} sales` : ""}
            {sales.length && buys.length ? " + " : ""}
            {buys.length ? `${buys.length.toLocaleString("en-IN")} invoice lines` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
