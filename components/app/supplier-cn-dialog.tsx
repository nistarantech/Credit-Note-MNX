"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Upload } from "lucide-react";
import { inr, uid } from "@/lib/calc";
import { readCnSheet, type Cell, type CnSheet } from "@/lib/excel";
import { useStore, type SupplierCn } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogSection, DialogSectionSeparator, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Admonition } from "@/components/ui-patterns/admonition";
import { FormField, NumberInput, today } from "./fields";

const NONE = "__none";

function blank(brandId: string, claimId: string | null, amount = 0): SupplierCn {
  return {
    id: uid(), number: "", brandId, claimId, date: today(), from: null, to: null, basic: amount, gst: 0, gross: amount, disputed: false,
    fileName: "", storedPath: null, remarks: "", lines: [], createdAt: new Date().toISOString(),
  };
}

/** Record a credit note the supplier issued — just its total, or line by line from their Excel / pasted rows. */
export function SupplierCnDialog({
  open, onOpenChange, cn, brandId, claimId,
}: { open: boolean; onOpenChange: (o: boolean) => void; cn: SupplierCn | null; brandId?: string; claimId?: string | null }) {
  const { data, saveSupplierCn } = useStore();
  const claimTotal = (id: string | null | undefined) => data.claims.find((c) => c.id === id)?.total ?? 0;
  const init = () => cn ?? blank(brandId ?? data.currentBrandId ?? data.brands[0]?.id ?? "", claimId ?? null, +claimTotal(claimId).toFixed(2));
  const [x, setX] = useState<SupplierCn>(init);
  const [tab, setTab] = useState(cn?.lines.length ? "lines" : "total");
  const [text, setText] = useState("");
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [seen, setSeen] = useState(open);
  if (seen !== open) {
    setSeen(open);
    if (open) {
      setX(init());
      setTab(cn?.lines.length ? "lines" : "total");
      setText("");
      setBytes(null);
      setError(null);
    }
  }
  const set = (patch: Partial<SupplierCn>) => setX((v) => ({ ...v, ...patch }));

  const applySheet = (s: CnSheet | null, fileName: string) => {
    if (!s) {
      setError("No credit note lines found. The header row needs an amount column (Taxable / Amount / Total) and Barcode, SKU, Invoice No or Qty.");
      return;
    }
    setError(null);
    const lines = s.lines.map((l) => ({ ...l, id: uid(), remarks: "" }));
    setX((v) => ({
      ...v,
      lines,
      number: v.number || s.number,
      date: s.date || v.date,
      fileName,
      basic: lines.reduce((a, l) => a + l.basic, 0),
      gst: lines.reduce((a, l) => a + l.gst, 0),
      gross: lines.reduce((a, l) => a + l.gross, 0),
    }));
  };

  const readFile = async (file: File) => {
    try {
      const { default: readXlsx } = await import("read-excel-file/browser");
      const b = await file.arrayBuffer();
      const sheets = (await readXlsx(b)) as { sheet: string; data: Cell[][] }[];
      setBytes(b);
      applySheet(sheets.map((s) => readCnSheet(s.sheet, s.data)).find(Boolean) ?? null, file.name);
    } catch (e) {
      setError(`Couldn't read ${file.name}: ${(e as Error).message}`);
    }
  };
  const readText = (t: string) => {
    setText(t);
    if (!t.trim()) return;
    const rows = t.replace(/\r/g, "").split("\n").filter((r) => r.trim()).map((r) => r.split("\t"));
    applySheet(readCnSheet("Pasted rows", rows), "Pasted rows");
  };

  const brandClaims = data.claims.filter((c) => c.brandId === x.brandId);
  const linked = data.claims.find((c) => c.id === x.claimId);
  const diff = linked ? linked.total - x.gross : 0;

  const save = async () => {
    let storedPath = x.storedPath;
    const files = typeof window !== "undefined" ? window.desktop?.files : undefined;
    if (files && bytes && tab === "lines") {
      const brand = data.brands.find((b) => b.id === x.brandId);
      try {
        const stored = await files.storeImport({ brand: brand?.code || brand?.name || "brand", months: [`supplier-cn-${x.date.slice(0, 7)}`], fileName: x.fileName, bytes });
        storedPath = Object.values(stored)[0] ?? null;
      } catch {
        toast.warning("Saved, but the original file couldn't be copied to the data folder");
      }
    }
    const lines = tab === "lines" ? x.lines : [];
    saveSupplierCn({ ...x, lines, storedPath, fileName: tab === "lines" ? x.fileName : "" });
    toast.success(`Supplier CN ${x.number || ""} saved`.replace("  ", " "), { description: `₹ ${inr(x.gross)}${linked ? ` against ${linked.number}` : ""}` });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="large" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cn ? "Edit supplier credit note" : "Supplier credit note"}</DialogTitle>
          <DialogDescription>What the brand actually credited. Add its lines to check them one by one against the claim.</DialogDescription>
        </DialogHeader>
        <DialogSectionSeparator />
        <DialogSection className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Brand">
              <Select value={x.brandId} onValueChange={(v) => set({ brandId: v, claimId: null })}>
                <SelectTrigger size="small"><SelectValue placeholder="Choose a brand" /></SelectTrigger>
                <SelectContent>
                  {data.brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Against claim" hint={linked ? (Math.abs(diff) < 1 ? `Matches ${linked.number}` : `${diff > 0 ? "Short" : "Over"} by ₹ ${inr(Math.abs(diff))} against ₹ ${inr(linked.total)} claimed`) : "Link it to check it against a claim"}>
              <Select value={x.claimId ?? NONE} onValueChange={(v) => set({ claimId: v === NONE ? null : v })}>
                <SelectTrigger size="small"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not linked</SelectItem>
                  {brandClaims.map((c) => <SelectItem key={c.id} value={c.id}>{c.number} · ₹ {inr(c.total)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Their CN number" htmlFor="cn-no">
              <Input id="cn-no" autoFocus value={x.number} onChange={(e) => set({ number: e.target.value })} className="font-mono" />
            </FormField>
            <FormField label="CN date" htmlFor="cn-date">
              <Input id="cn-date" type="date" value={x.date} onChange={(e) => set({ date: e.target.value })} />
            </FormField>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="gap-6">
              <TabsTrigger value="total">Total only</TabsTrigger>
              <TabsTrigger value="lines">Line by line</TabsTrigger>
            </TabsList>
            <TabsContent value="total" className="grid grid-cols-2 gap-4">
              <FormField label="Total credited" htmlFor="cn-gross">
                <NumberInput id="cn-gross" prefix="₹" value={x.gross} onChange={(v) => set({ gross: v ?? 0, basic: (v ?? 0) - x.gst })} />
              </FormField>
              <FormField label="of which GST" htmlFor="cn-gst" hint={`Basic ₹ ${inr(x.gross - x.gst)}`}>
                <NumberInput id="cn-gst" prefix="₹" value={x.gst} onChange={(v) => set({ gst: v ?? 0, basic: x.gross - (v ?? 0) })} />
              </FormField>
            </TabsContent>
            <TabsContent value="lines" className="flex flex-col gap-3">
              {x.lines.length ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <FileSpreadsheet size={16} strokeWidth={1.5} className="text-foreground-lighter" />
                    <span className="flex-1 truncate text-foreground">{x.fileName || "Lines"} · {x.lines.length} lines · ₹ {inr(x.gross)}</span>
                    <Button variant="text" size="tiny" onClick={() => set({ lines: [], fileName: "" })}>Replace</Button>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-md border">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>SKU / barcode</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Basic</TableHead>
                          <TableHead className="text-right">GST</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {x.lines.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-mono">{l.invoiceNo || "—"}</TableCell>
                            <TableCell className="font-mono">{l.barcode || "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{l.qty ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{inr(l.basic)}</TableCell>
                            <TableCell className="text-right tabular-nums">{inr(l.gst)}</TableCell>
                            <TableCell className="text-right tabular-nums">{inr(l.gross)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => input.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-md border border-dashed border-strong px-6 py-6 text-center transition-colors hover:bg-surface-200 focus-ring"
                  >
                    <Upload size={18} strokeWidth={1.5} className="text-foreground-lighter" />
                    <span className="text-sm text-foreground">Choose the supplier&apos;s CN Excel file</span>
                    <span className="text-xs text-foreground-lighter">Columns like Invoice No, Barcode / SKU, Qty, Taxable, GST (or CGST + SGST / IGST), Total</span>
                  </button>
                  <Textarea rows={4} value={text} onChange={(e) => readText(e.target.value)} placeholder="…or copy the rows in Excel, with the header row, and paste here" className="font-mono text-xs" />
                </>
              )}
              <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
              {error ? <Admonition type="warning" title="Couldn't read the credit note" description={error} /> : null}
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
            <div>
              <Label htmlFor="cn-disputed">Disputed</Label>
              <p className="text-xs text-foreground-lighter">You don&apos;t accept this CN yet. It isn&apos;t counted as received.</p>
            </div>
            <Switch id="cn-disputed" checked={x.disputed} onCheckedChange={(c) => set({ disputed: c })} />
          </div>
          <FormField label="Remarks" htmlFor="cn-rem">
            <Textarea id="cn-rem" rows={2} value={x.remarks} onChange={(e) => set({ remarks: e.target.value })} />
          </FormField>
        </DialogSection>
        <DialogFooter>
          <Button variant="default" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!x.brandId || (tab === "lines" && !x.lines.length)} onClick={save}>Save credit note</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
