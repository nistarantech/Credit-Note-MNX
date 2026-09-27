"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { calcRow, inr, type Line, type MarginSlab } from "@/lib/calc";
import { calcSettings, newBrand, useStore, type Brand } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FormField, NumberInput, today } from "./fields";

/** Add or edit a brand: details, the terms its credit claims use, and dispatch. */
export function BrandSheet({
  open, onOpenChange, brand,
}: { open: boolean; onOpenChange: (o: boolean) => void; brand: Brand | null }) {
  const { data, saveBrand, selectBrand } = useStore();
  const [p, setP] = useState<Brand>(() => brand ?? newBrand(data.globals));
  const [tab, setTab] = useState("details");
  const [seen, setSeen] = useState({ open, brand });
  if (seen.open !== open || seen.brand !== brand) {
    setSeen({ open, brand });
    if (open) {
      setP(brand ?? newBrand(data.globals));
      setTab("details");
    }
  }
  const set = (patch: Partial<Brand>) => setP((x) => ({ ...x, ...patch }));
  const setD = (k: keyof Brand["dispatch"], v: number | null) => setP((x) => ({ ...x, dispatch: { ...x.dispatch, [k]: v ?? 0 } }));
  const setSlab = (i: number, patch: Partial<MarginSlab>) => set({ marginSlabs: p.marginSlabs.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const isNew = !brand;
  const bought = data.purchases.filter((x) => x.brandId === p.id).length;

  const save = () => {
    if (!p.name.trim()) {
      setTab("details");
      return;
    }
    saveBrand({ ...p, name: p.name.trim(), marginSlabs: [...p.marginSlabs].sort((a, b) => a.type.localeCompare(b.type) || a.upTo - b.upTo) });
    if (isNew) selectBrand(p.id);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" className="flex w-full flex-col gap-0 p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{isNew ? "New brand" : p.name || "Edit brand"}</SheetTitle>
          <SheetDescription>Your credit note claims on this brand are worked out on the terms set here.</SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="gap-6 px-6">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="terms">Terms &amp; margins</TabsTrigger>
            <TabsTrigger value="dispatch">Season &amp; purchases</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <TabsContent value="details" className="mt-6 flex flex-col gap-4">
              <div className="grid grid-cols-[1fr_140px] gap-4">
                <FormField label="Brand / company name" htmlFor="p-name">
                  <Input id="p-name" autoFocus value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Crimsoune Club" />
                </FormField>
                <FormField label="Code" htmlFor="p-code">
                  <Input id="p-code" value={p.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="CC" className="font-mono" />
                </FormField>
              </div>
              <FormField label="GSTIN" htmlFor="p-gst">
                <Input id="p-gst" value={p.gstNo} onChange={(e) => set({ gstNo: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" className="font-mono" />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Contact person" htmlFor="p-contact">
                  <Input id="p-contact" value={p.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} />
                </FormField>
                <FormField label="Phone" htmlFor="p-phone">
                  <Input id="p-phone" value={p.phone} onChange={(e) => set({ phone: e.target.value })} />
                </FormField>
              </div>
              <FormField label="Address" htmlFor="p-addr" hint="Printed on the claim, as the addressee">
                <Textarea id="p-addr" rows={3} value={p.address} onChange={(e) => set({ address: e.target.value })} />
              </FormField>
              <FormField label="Internal claims" htmlFor="p-claims">
                <Textarea id="p-claims" rows={2} value={p.memo} onChange={(e) => set({ memo: e.target.value })} />
              </FormField>
              <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
                <div>
                  <Label htmlFor="p-active">Active</Label>
                  <p className="text-xs text-foreground-lighter">Inactive brands are left out of the month-end list when they have no sales.</p>
                </div>
                <Switch id="p-active" checked={p.active} onCheckedChange={(c) => set({ active: c })} />
              </div>
            </TabsContent>

            <TabsContent value="terms" className="mt-6 flex flex-col gap-6">
              <div className="grid grid-cols-3 gap-4">
                <FormField label="Your EOSS margin" htmlFor="p-disc" hint="Base, on discounted sales">
                  <NumberInput id="p-disc" percent value={p.discMargin} onChange={(v) => set({ discMargin: v ?? 0 })} />
                </FormField>
                <FormField label="Your fresh margin" htmlFor="p-fresh" hint="Base, on full-price sales">
                  <NumberInput id="p-fresh" percent value={p.freshMargin} onChange={(v) => set({ freshMargin: v ?? 0 })} />
                </FormField>
                <FormField label="Deal name" htmlFor="p-deal" hint="Printed on the claim">
                  <Input id="p-deal" value={p.dealName} onChange={(e) => set({ dealName: e.target.value })} placeholder="30/20/10" />
                </FormField>
              </div>

              <div className="flex flex-col gap-2">
                <div>
                  <Label>Margin by discount level</Label>
                  <p className="text-xs text-foreground-lighter">
                    Optional. A sale discounted up to the level gets that margin instead of the base margin — e.g. EOSS up to 30% → 20%, up to 60% → 10%.
                  </p>
                </div>
                {p.marginSlabs.length ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sale type</TableHead>
                          <TableHead>Discount up to</TableHead>
                          <TableHead>Margin</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {p.marginSlabs.map((m, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Select value={m.type} onValueChange={(v) => setSlab(i, { type: v as MarginSlab["type"] })}>
                                <SelectTrigger size="small" className="w-32"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="DISC">EOSS</SelectItem>
                                  <SelectItem value="FRESH">Fresh</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell><NumberInput percent value={m.upTo} onChange={(v) => setSlab(i, { upTo: v ?? 0 })} /></TableCell>
                            <TableCell><NumberInput percent value={m.margin} onChange={(v) => setSlab(i, { margin: v ?? 0 })} /></TableCell>
                            <TableCell>
                              <Button variant="text" size="tiny" className="h-7 w-7 px-0" icon={<Trash2 size={14} strokeWidth={1.5} />} aria-label="Remove slab"
                                onClick={() => set({ marginSlabs: p.marginSlabs.filter((_, j) => j !== i) })} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
                <Button variant="default" className="w-fit" icon={<Plus size={14} strokeWidth={1.5} />}
                  onClick={() => set({ marginSlabs: [...p.marginSlabs, { type: "DISC", upTo: 0.5, margin: p.discMargin }] })}>
                  Add margin slab
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="WSP factor" htmlFor="p-wsp" hint={`Purchase rate = MRP × ${p.wspFactor} (MRP ÷ ${(1 / (p.wspFactor || 1)).toFixed(3)})`}>
                  <NumberInput id="p-wsp" value={p.wspFactor} onChange={(v) => set({ wspFactor: v ?? 0 })} />
                </FormField>
                <FormField
                  label="CN % base"
                  htmlFor="p-base"
                  hint={p.cnBasePct === null ? `Using the global ${Math.round(data.globals.cnBasePct * 100)}% of MRP received` : "Of MRP received, for this brand only"}
                >
                  <NumberInput id="p-base" percent allowEmpty value={p.cnBasePct} placeholder={String(Math.round(data.globals.cnBasePct * 100))} onChange={(v) => set({ cnBasePct: v })} />
                </FormField>
              </div>

              <TermsPreview brand={p} />
            </TabsContent>

            <TabsContent value="dispatch" className="mt-6 flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Season" htmlFor="p-season"><Input id="p-season" value={p.season} onChange={(e) => set({ season: e.target.value })} placeholder="AW'25" /></FormField>
                <FormField label="First season" htmlFor="p-first"><Input id="p-first" value={p.firstSeason} onChange={(e) => set({ firstSeason: e.target.value })} placeholder="AW23" /></FormField>
                <FormField label="Applicability" htmlFor="p-app"><Input id="p-app" value={p.applicability} onChange={(e) => set({ applicability: e.target.value })} /></FormField>
                <FormField label="Conditions" htmlFor="p-cond"><Input id="p-cond" value={p.conditions} onChange={(e) => set({ conditions: e.target.value })} placeholder="1000 pcs / season" /></FormField>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <Label>Received from the brand this season</Label>
                  <p className="text-xs text-foreground-lighter">
                    {bought
                      ? `Worked out from ${bought.toLocaleString("en-IN")} imported invoice lines — re-importing updates it.`
                      : "What the brand billed you this season. Used for CN % of MRP and goods-sold %. Importing the brand's invoice sheet fills this in."}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Pieces" htmlFor="p-dq"><NumberInput id="p-dq" value={p.dispatch.qty} onChange={(v) => setD("qty", v)} /></FormField>
                  <FormField label="MRP value" htmlFor="p-dm"><NumberInput id="p-dm" prefix="₹" value={p.dispatch.mrp} onChange={(v) => setD("mrp", v)} /></FormField>
                  <FormField label="WSP" htmlFor="p-dw"><NumberInput id="p-dw" prefix="₹" value={p.dispatch.wsp} onChange={(v) => setD("wsp", v)} /></FormField>
                  <FormField label="GST" htmlFor="p-dg" hint={`Billing value ₹ ${inr(p.dispatch.wsp + p.dispatch.gst)}`}>
                    <NumberInput id="p-dg" prefix="₹" value={p.dispatch.gst} onChange={(v) => setD("gst", v)} />
                  </FormField>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-3">
          <Button variant="default" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!p.name.trim()} onClick={save}>{isNew ? "Create brand" : "Save changes"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** How a few typical sales come out on these terms — a sanity check while editing. */
function TermsPreview({ brand }: { brand: Brand }) {
  const { data } = useStore();
  const s = calcSettings(data.globals, brand);
  const cases: [string, Partial<Line>][] = [
    ["Fresh, full price", { type: "FRESH", disc: 0 }],
    ["EOSS, 30% off", { type: "DISC", disc: 0.3 }],
    ["EOSS, 50% off", { type: "DISC", disc: 0.5 }],
    ["EOSS, 60% off", { type: "DISC", disc: 0.6 }],
  ];
  const base: Line = { id: "x", date: today(), billNo: "", barcode: "", division: "", department: "", ageing: "", type: "DISC", disc: 0, mrp: 1999, qty: 1, wsp: null, gstB2B: null };
  return (
    <div className="flex flex-col gap-2">
      <Label>On these terms, an MRP ₹ 1,999 piece gives</Label>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sale</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead className="text-right">CN to claim</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map(([label, patch]) => {
              const r = calcRow({ ...base, ...patch }, s);
              return (
                <TableRow key={label}>
                  <TableCell className="text-foreground-light">{label}</TableCell>
                  <TableCell className="text-right tabular-nums">{Math.round(r.marginPct * 100)}% · ₹ {inr(r.margin)}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">₹ {inr(r.cn)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
