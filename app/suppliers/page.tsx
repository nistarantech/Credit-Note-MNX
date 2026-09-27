"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Factory, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/calc";
import { GST_TREATMENTS } from "@/lib/recon";
import { newSupplier, useStore, type Supplier } from "@/lib/store";
import { claimPosition } from "@/lib/stats";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";
import { FormField } from "@/components/app/fields";
import { Page } from "@/components/app/page";

const CYCLES: { value: Supplier["cnCycle"]; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "season", label: "Per season" },
  { value: "other", label: "Other" },
];
const MODES: { value: Supplier["settlementMode"]; label: string }[] = [
  { value: "adjustment", label: "Adjusted against payable" },
  { value: "refund", label: "Refund" },
  { value: "credit_note", label: "Credit note only" },
];

export default function SuppliersPage() {
  const { data, deleteSupplier } = useStore();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Supplier | null>(null);
  const create = () => { setEditing(null); setOpen(true); };

  return (
    <Page
      title="Suppliers"
      description="The companies and distributors that bill you and issue the credit notes. Each brand is mapped to one."
      actions={data.suppliers.length ? <Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} onClick={create}>New supplier</Button> : null}
    >
      {data.suppliers.length === 0 ? (
        <Card className="py-16">
          <EmptyStatePresentational icon={Factory} title="No suppliers yet" description="Add the company behind your brands — its GSTIN, how it puts GST on credit notes, and how it settles them.">
            <Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} onClick={create}>New supplier</Button>
          </EmptyStatePresentational>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Brands</TableHead>
                <TableHead>CN terms</TableHead>
                <TableHead className="text-right">Claimed</TableHead>
                <TableHead className="text-right">CN received</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.suppliers.map((x) => {
                const brands = data.brands.filter((b) => b.supplierId === x.id);
                const ids = new Set(brands.map((b) => b.id));
                const pos = data.claims.filter((c) => ids.has(c.brandId)).map((c) => ({ c, p: claimPosition(data, c) }));
                return (
                  <TableRow key={x.id} className="cursor-pointer" onClick={() => { setEditing(x); setOpen(true); }}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{x.name}</span>
                        {!x.active ? <Badge variant="warning">Inactive</Badge> : null}
                      </div>
                      <div className="font-mono text-xs text-foreground-lighter">{[x.code, x.gstNo].filter(Boolean).join(" · ")}</div>
                    </TableCell>
                    <TableCell className="text-foreground-light">{brands.map((b) => b.name).join(", ") || "—"}</TableCell>
                    <TableCell className="text-xs text-foreground-light">
                      <div>{GST_TREATMENTS.find((g) => g.value === x.gstTreatment)?.label}</div>
                      <div className="text-foreground-lighter">{CYCLES.find((c) => c.value === x.cnCycle)?.label} · {MODES.find((m) => m.value === x.settlementMode)?.label}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">₹ {inr(pos.reduce((a, { c }) => a + c.total, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">₹ {inr(pos.reduce((a, { p }) => a + p.settle.cnReceived, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">₹ {inr(pos.filter(({ c }) => c.status !== "settled").reduce((a, { p }) => a + Math.max(0, p.settle.pending), 0))}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="text" size="tiny" className="h-7 w-7 px-0" icon={<MoreHorizontal size={14} strokeWidth={1.5} />} aria-label="Actions" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem className="gap-2" onSelect={() => { setEditing(x); setOpen(true); }}><Pencil size={14} strokeWidth={1.5} /> Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-destructive" onSelect={() => setConfirm(x)}><Trash2 size={14} strokeWidth={1.5} /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <SupplierSheet open={open} onOpenChange={setOpen} supplier={editing} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Its brands, claims and credit notes are kept; the brands just lose their supplier.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => { if (confirm) { deleteSupplier(confirm.id); toast.success(`${confirm.name} deleted`); } }}>Delete supplier</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}

function SupplierSheet({ open, onOpenChange, supplier }: { open: boolean; onOpenChange: (o: boolean) => void; supplier: Supplier | null }) {
  const { data, saveSupplier, saveBrand } = useStore();
  const [x, setX] = useState<Supplier>(() => supplier ?? newSupplier());
  const [brandIds, setBrandIds] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState({ open, supplier });
  if (seen.open !== open || seen.supplier !== supplier) {
    setSeen({ open, supplier });
    if (open) {
      const s = supplier ?? newSupplier();
      setX(s);
      setBrandIds(new Set(data.brands.filter((b) => b.supplierId === s.id).map((b) => b.id)));
    }
  }
  const set = (patch: Partial<Supplier>) => setX((v) => ({ ...v, ...patch }));

  const save = () => {
    saveSupplier({ ...x, name: x.name.trim() });
    for (const b of data.brands) {
      const want = brandIds.has(b.id);
      if (want && b.supplierId !== x.id) saveBrand({ ...b, supplierId: x.id });
      if (!want && b.supplierId === x.id) saveBrand({ ...b, supplierId: null });
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" className="flex w-full flex-col gap-0 p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{supplier ? x.name || "Edit supplier" : "New supplier"}</SheetTitle>
          <SheetDescription>How this supplier issues and settles credit notes.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-[1fr_140px] gap-4">
            <FormField label="Name" htmlFor="s-name"><Input id="s-name" autoFocus value={x.name} onChange={(e) => set({ name: e.target.value })} placeholder="Arvind Fashions Ltd" /></FormField>
            <FormField label="Code" htmlFor="s-code"><Input id="s-code" value={x.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className="font-mono" placeholder="SUP001" /></FormField>
          </div>
          <FormField label="GSTIN" htmlFor="s-gst"><Input id="s-gst" value={x.gstNo} onChange={(e) => set({ gstNo: e.target.value.toUpperCase() })} className="font-mono" /></FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Contact person" htmlFor="s-contact"><Input id="s-contact" value={x.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} /></FormField>
            <FormField label="Phone" htmlFor="s-phone"><Input id="s-phone" value={x.phone} onChange={(e) => set({ phone: e.target.value })} /></FormField>
            <FormField label="Email" htmlFor="s-email"><Input id="s-email" value={x.email} onChange={(e) => set({ email: e.target.value })} /></FormField>
          </div>
          <FormField label="Address" htmlFor="s-addr"><Textarea id="s-addr" rows={2} value={x.address} onChange={(e) => set({ address: e.target.value })} /></FormField>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="GST on its CNs" hint={GST_TREATMENTS.find((g) => g.value === x.gstTreatment)?.hint}>
              <Select value={x.gstTreatment} onValueChange={(v) => set({ gstTreatment: v as Supplier["gstTreatment"] })}>
                <SelectTrigger size="small"><SelectValue /></SelectTrigger>
                <SelectContent>{GST_TREATMENTS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="CN cycle">
              <Select value={x.cnCycle} onValueChange={(v) => set({ cnCycle: v as Supplier["cnCycle"] })}>
                <SelectTrigger size="small"><SelectValue /></SelectTrigger>
                <SelectContent>{CYCLES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="Settles by">
              <Select value={x.settlementMode} onValueChange={(v) => set({ settlementMode: v as Supplier["settlementMode"] })}>
                <SelectTrigger size="small"><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Brands from this supplier</Label>
            {data.brands.length ? (
              <div className="flex flex-wrap gap-2">
                {data.brands.map((b) => {
                  const on = brandIds.has(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBrandIds((s) => { const n = new Set(s); if (on) n.delete(b.id); else n.add(b.id); return n; })}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors focus-ring ${on ? "border-brand bg-brand/10 text-foreground" : "text-foreground-light hover:bg-surface-200"}`}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
            ) : <p className="text-xs text-foreground-lighter">No brands yet.</p>}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
            <Label htmlFor="s-active">Active</Label>
            <Switch id="s-active" checked={x.active} onCheckedChange={(c) => set({ active: c })} />
          </div>
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-3">
          <Button variant="default" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!x.name.trim()} onClick={save}>{supplier ? "Save changes" : "Create supplier"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
