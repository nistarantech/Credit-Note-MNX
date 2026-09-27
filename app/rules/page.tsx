"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Scale } from "lucide-react";
import { inr } from "@/lib/calc";
import { monthRange, thisMonth } from "@/lib/month";
import { CN_BASES, GST_TREATMENTS, baseInfo, expectedFromRules } from "@/lib/recon";
import { calcSettings, newRule, useStore, type CnRule } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";
import { FormField, NumberInput, fmtDate } from "@/components/app/fields";
import { NoBrand } from "@/components/app/no-brand";
import { Page } from "@/components/app/page";

const LINE_GST = "__line";

const rateText = (r: Pick<CnRule, "base" | "rate">) =>
  baseInfo(r.base).per === "pct" ? `${+(r.rate * 100).toFixed(2)}% of ${baseInfo(r.base).label}` : `₹ ${inr(r.rate)} ${r.base === "qty" ? "per piece" : "per line"}`;

export default function RulesPage() {
  const { data, brand } = useStore();
  const [editing, setEditing] = useState<CnRule | null>(null);
  const [open, setOpen] = useState(false);
  if (!brand) return <Page title="CN rules"><NoBrand /></Page>;

  const rules = data.rules.filter((r) => r.brandId === brand.id).sort((a, b) => a.priority - b.priority || a.from.localeCompare(b.from));
  const [from, to] = monthRange(thisMonth());
  const preview = expectedFromRules({
    rules, purchases: data.purchases.filter((p) => p.brandId === brand.id), sales: data.sales.filter((s) => s.brandId === brand.id),
    skus: data.skus.filter((s) => s.brandId === brand.id), settings: calcSettings(data.globals, brand), from, to,
  });
  const create = () => { setEditing(null); setOpen(true); };

  return (
    <Page
      title="CN rules"
      description={`${brand.name}'s schemes: what each pays a credit note on, at what rate, with what GST, for which dates. Change a scheme here — not in a spreadsheet formula.`}
      size="large"
      actions={rules.length ? <Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} onClick={create}>New rule</Button> : null}
    >
      {rules.length === 0 ? (
        <Card className="py-16">
          <EmptyStatePresentational icon={Scale} title="No CN rules yet" description="Add a scheme — e.g. 20% of WSP on invoices from 1 to 30 Sep, GST added on the CN. Sales claims (margin support) keep working without rules.">
            <Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} onClick={create}>New rule</Button>
          </EmptyStatePresentational>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>On</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>CN</TableHead>
                <TableHead>GST</TableHead>
                <TableHead className="text-right">This month</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => {
                const lines = preview.lines.filter((l) => l.ruleId === r.id);
                const m = r.match;
                const scope = [m.barcodes.length && `${m.barcodes.length} SKUs`, m.category, m.division, m.department].filter(Boolean).join(" · ");
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => { setEditing(r); setOpen(true); }}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{r.name || r.code}</span>
                        {!r.active ? <Badge variant="default">Off</Badge> : null}
                        {r.stacking ? <Badge variant="default">Stacks</Badge> : null}
                      </div>
                      <div className="text-xs text-foreground-lighter">{[r.code, `priority ${r.priority}`, scope || "all SKUs"].filter(Boolean).join(" · ")}</div>
                    </TableCell>
                    <TableCell className="text-foreground-light">{r.appliesOn === "purchases" ? "Invoices" : "Sales"}</TableCell>
                    <TableCell className="whitespace-nowrap text-foreground-light">{fmtDate(r.from)} – {r.to ? fmtDate(r.to) : "open"}</TableCell>
                    <TableCell className="text-foreground">
                      {rateText(r)}
                      {r.minQty || r.maxQty ? <div className="text-xs text-foreground-lighter">{[r.minQty && `min ${r.minQty} pcs`, r.maxQty && `max ${r.maxQty} pcs`].filter(Boolean).join(", ")}</div> : null}
                    </TableCell>
                    <TableCell className="text-xs text-foreground-light">{GST_TREATMENTS.find((g) => g.value === r.gstTreatment)?.label}{r.gstRate !== null ? ` @ ${+(r.gstRate * 100).toFixed(2)}%` : ""}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">{lines.length ? `₹ ${inr(lines.reduce((a, l) => a + l.gross, 0))}` : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <RuleSheet open={open} onOpenChange={setOpen} rule={editing} brandId={brand.id} />
    </Page>
  );
}

function RuleSheet({ open, onOpenChange, rule, brandId }: { open: boolean; onOpenChange: (o: boolean) => void; rule: CnRule | null; brandId: string }) {
  const { data, saveRule, deleteRule } = useStore();
  const supplier = data.suppliers.find((s) => s.id === data.brands.find((b) => b.id === brandId)?.supplierId);
  const fresh = () => newRule(brandId, { gstTreatment: supplier?.gstTreatment ?? "included", priority: (data.rules.filter((r) => r.brandId === brandId).length + 1) * 10 });
  const [x, setX] = useState<CnRule>(() => rule ?? fresh());
  const [codes, setCodes] = useState("");
  const [reason, setReason] = useState("");
  const [seen, setSeen] = useState({ open, rule });
  if (seen.open !== open || seen.rule !== rule) {
    setSeen({ open, rule });
    if (open) {
      const r = rule ?? fresh();
      setX(r);
      setCodes(r.match.barcodes.join("\n"));
      setReason("");
    }
  }
  const set = (patch: Partial<CnRule>) => setX((v) => ({ ...v, ...patch }));
  const setMatch = (patch: Partial<CnRule["match"]>) => setX((v) => ({ ...v, match: { ...v.match, ...patch } }));
  const info = baseInfo(x.base);
  const sample = info.per === "pct" ? `A ₹ 3,499 base × ${+(x.rate * 100).toFixed(2)}% = ₹ ${inr(3499 * x.rate)}` : `${x.base === "qty" ? "10 pcs" : "1 line"} × ₹ ${inr(x.rate)} = ₹ ${inr((x.base === "qty" ? 10 : 1) * x.rate)}`;

  const save = () => {
    const barcodes = codes.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean);
    saveRule({ ...x, name: x.name.trim(), match: { ...x.match, barcodes } }, reason.trim());
    toast.success(`Rule ${x.name || x.code} saved`);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" className="flex w-full flex-col gap-0 p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{rule ? x.name || "Edit rule" : "New CN rule"}</SheetTitle>
          <SheetDescription>Claims keep a copy of the lines as worked out, so changing a rule never changes a claim already raised.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-[1fr_140px] gap-4">
            <FormField label="Name" htmlFor="r-name"><Input id="r-name" autoFocus value={x.name} onChange={(e) => set({ name: e.target.value })} placeholder="EOSS support Sep 2026" /></FormField>
            <FormField label="Scheme code" htmlFor="r-code"><Input id="r-code" value={x.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className="font-mono" placeholder="R-2026-001" /></FormField>
          </div>

          <FormField label="Pays on">
            <ToggleGroup type="single" value={x.appliesOn} onValueChange={(v) => v && set({ appliesOn: v as CnRule["appliesOn"] })} className="w-fit gap-1 rounded-md bg-surface-200 p-1">
              <ToggleGroupItem value="purchases" size="tiny">Brand&apos;s invoices to you</ToggleGroupItem>
              <ToggleGroupItem value="sales" size="tiny">Your sales</ToggleGroupItem>
            </ToggleGroup>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="From" htmlFor="r-from"><Input id="r-from" type="date" value={x.from} onChange={(e) => set({ from: e.target.value })} /></FormField>
            <FormField label="To" htmlFor="r-to" hint="Empty = no end date"><Input id="r-to" type="date" value={x.to ?? ""} onChange={(e) => set({ to: e.target.value || null })} /></FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Worked out on" hint={info.hint}>
              <Select value={x.base} onValueChange={(v) => set({ base: v as CnRule["base"] })}>
                <SelectTrigger size="small"><SelectValue /></SelectTrigger>
                <SelectContent>{CN_BASES.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={info.per === "pct" ? "Rate" : "Amount"} htmlFor="r-rate" hint={sample}>
              {info.per === "pct"
                ? <NumberInput id="r-rate" percent value={x.rate} onChange={(v) => set({ rate: v ?? 0 })} />
                : <NumberInput id="r-rate" prefix="₹" value={x.rate} onChange={(v) => set({ rate: v ?? 0 })} />}
            </FormField>
            <FormField label="GST on the CN" hint={supplier ? `${supplier.name} default: ${GST_TREATMENTS.find((g) => g.value === supplier.gstTreatment)?.label}` : GST_TREATMENTS.find((g) => g.value === x.gstTreatment)?.hint}>
              <Select value={x.gstTreatment} onValueChange={(v) => set({ gstTreatment: v as CnRule["gstTreatment"] })}>
                <SelectTrigger size="small"><SelectValue /></SelectTrigger>
                <SelectContent>{GST_TREATMENTS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="GST rate">
              <Select value={x.gstRate === null ? LINE_GST : String(x.gstRate)} onValueChange={(v) => set({ gstRate: v === LINE_GST ? null : Number(v) })}>
                <SelectTrigger size="small"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={LINE_GST}>The line&apos;s own rate</SelectItem>
                  {[0.05, 0.12, 0.18].map((g) => <SelectItem key={g} value={String(g)}>{g * 100}%</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Which lines</Label>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Category" htmlFor="r-cat"><Input id="r-cat" value={x.match.category} onChange={(e) => setMatch({ category: e.target.value })} placeholder="Any" /></FormField>
              <FormField label="Division" htmlFor="r-div"><Input id="r-div" value={x.match.division} onChange={(e) => setMatch({ division: e.target.value })} placeholder="Any" /></FormField>
              <FormField label="Department" htmlFor="r-dep"><Input id="r-dep" value={x.match.department} onChange={(e) => setMatch({ department: e.target.value })} placeholder="Any" /></FormField>
            </div>
            <FormField label="Only these SKUs / barcodes" htmlFor="r-codes" hint="One per line or comma-separated. Empty = every CN-eligible SKU.">
              <Textarea id="r-codes" rows={3} value={codes} onChange={(e) => setCodes(e.target.value)} className="font-mono text-xs" />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Minimum qty" htmlFor="r-min" hint="In the claim period"><NumberInput id="r-min" allowEmpty value={x.minQty} onChange={(v) => set({ minQty: v })} /></FormField>
            <FormField label="Maximum qty" htmlFor="r-max" hint="Pieces it pays on"><NumberInput id="r-max" allowEmpty value={x.maxQty} onChange={(v) => set({ maxQty: v })} /></FormField>
            <FormField label="Priority" htmlFor="r-prio" hint="Lower runs first"><NumberInput id="r-prio" value={x.priority} onChange={(v) => set({ priority: Math.round(v ?? 10) })} /></FormField>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
            <div>
              <Label htmlFor="r-stack">Stacks on other rules</Label>
              <p className="text-xs text-foreground-lighter">Off = a line takes only the first matching rule by priority.</p>
            </div>
            <Switch id="r-stack" checked={x.stacking} onCheckedChange={(c) => set({ stacking: c })} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
            <div>
              <Label htmlFor="r-active">Active</Label>
              <p className="text-xs text-foreground-lighter">Only active rules are used in new claims.</p>
            </div>
            <Switch id="r-active" checked={x.active} onCheckedChange={(c) => set({ active: c })} />
          </div>
          <FormField label="Remarks" htmlFor="r-rem"><Textarea id="r-rem" rows={2} value={x.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="Circular reference, conditions…" /></FormField>
          {rule ? (
            <FormField label="Reason for the change" htmlFor="r-reason" hint="Kept in the audit log">
              <Input id="r-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
          ) : null}
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-3">
          {rule ? <Button variant="text" className="mr-auto text-destructive" onClick={() => { deleteRule(rule.id); onOpenChange(false); }}>Delete rule</Button> : null}
          <Button variant="default" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!x.name.trim() || !x.from || (!!x.to && x.to < x.from)} onClick={save}>{rule ? "Save changes" : "Create rule"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
