"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { DEFAULT_GLOBALS, useStore, type Data, type Globals } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PageSection, PageSectionContent, PageSectionDescription, PageSectionMeta, PageSectionSummary, PageSectionTitle,
} from "@/components/ui-patterns/page-section";
import { FormField, NumberInput, today } from "@/components/app/fields";
import { Page } from "@/components/app/page";

function Section({ title, description, children }: { title: string; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <PageSection orientation="horizontal" className="pt-8 first:pt-0">
      <PageSectionMeta>
        <PageSectionSummary>
          <PageSectionTitle>{title}</PageSectionTitle>
          <PageSectionDescription>{description}</PageSectionDescription>
        </PageSectionSummary>
      </PageSectionMeta>
      <PageSectionContent>{children}</PageSectionContent>
    </PageSection>
  );
}

export default function SettingsPage() {
  const { data, setGlobals, replaceAll } = useStore();
  const g = data.globals;
  const [reset, setReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Globals>) => setGlobals(patch);
  const setSlab = (i: number, patch: Partial<Globals["b2cSlabs"][number]>) =>
    set({ b2cSlabs: g.b2cSlabs.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `credit-notes-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as Data;
      if (!Array.isArray(d.parties) || !Array.isArray(d.sales)) throw new Error("not a backup");
      replaceAll(d);
      toast.success(`Restored ${d.parties.length} parties, ${d.sales.length} sales, ${d.notes?.length ?? 0} credit notes`);
    } catch {
      toast.error("That file is not a Credit Note backup");
    }
  };

  return (
    <Page title="Settings" description="Rules used for every party. A party's own deal is edited on the Parties screen.">
      <Section title="Credit note" description="Printed on every credit note.">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <FormField label="Company name" htmlFor="s-co">
              <Input id="s-co" value={g.company} onChange={(e) => set({ company: e.target.value })} placeholder="Your company" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Number prefix" htmlFor="s-pre">
                <Input id="s-pre" value={g.notePrefix} onChange={(e) => set({ notePrefix: e.target.value })} className="font-mono" />
              </FormField>
              <FormField label="Next number" htmlFor="s-next" hint={`Next note: ${g.notePrefix}${String(g.nextNoteNo).padStart(4, "0")}`}>
                <NumberInput id="s-next" value={g.nextNoteNo} onChange={(v) => set({ nextNoteNo: Math.max(1, Math.round(v ?? 1)) })} />
              </FormField>
            </div>
            <FormField label="CN % is worked on" htmlFor="s-base" hint="Share of the dispatch MRP used for “CN % of MRP”">
              <NumberInput id="s-base" percent value={g.cnBasePct} onChange={(v) => set({ cnBasePct: v ?? 0 })} />
            </FormField>
          </CardContent>
        </Card>
      </Section>

      <Section title="Default deal" description="Filled in for new parties. Each party can have its own.">
        <Card>
          <CardContent className="grid grid-cols-3 gap-4">
            <FormField label="EOSS margin" htmlFor="s-disc">
              <NumberInput id="s-disc" percent value={g.defaults.discMargin} onChange={(v) => set({ defaults: { ...g.defaults, discMargin: v ?? 0 } })} />
            </FormField>
            <FormField label="Fresh margin" htmlFor="s-fresh">
              <NumberInput id="s-fresh" percent value={g.defaults.freshMargin} onChange={(v) => set({ defaults: { ...g.defaults, freshMargin: v ?? 0 } })} />
            </FormField>
            <FormField label="WSP factor" htmlFor="s-wsp" hint="WSP = MRP × factor">
              <NumberInput id="s-wsp" value={g.defaults.wspFactor} onChange={(v) => set({ defaults: { ...g.defaults, wspFactor: v ?? 0 } })} />
            </FormField>
          </CardContent>
        </Card>
      </Section>

      <Section
        title="GST in the sale price"
        description="GST the customer paid, included in the sale value. The slab is chosen by bill date and by the per-piece value before GST."
      >
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bills from</TableHead>
                <TableHead>Above ₹ / piece</TableHead>
                <TableHead>Up to it</TableHead>
                <TableHead>Above it</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.b2cSlabs.map((s, i) => (
                <TableRow key={i}>
                  <TableCell><Input type="date" value={s.from} onChange={(e) => setSlab(i, { from: e.target.value })} /></TableCell>
                  <TableCell><NumberInput value={s.threshold} onChange={(v) => setSlab(i, { threshold: v ?? 0 })} /></TableCell>
                  <TableCell><NumberInput percent value={s.low} onChange={(v) => setSlab(i, { low: v ?? 0 })} /></TableCell>
                  <TableCell><NumberInput percent value={s.high} onChange={(v) => setSlab(i, { high: v ?? 0 })} /></TableCell>
                  <TableCell>
                    <Button
                      variant="text"
                      size="tiny"
                      className="h-7 w-7 px-0"
                      disabled={g.b2cSlabs.length < 2}
                      icon={<Trash2 size={14} strokeWidth={1.5} />}
                      aria-label="Remove slab"
                      onClick={() => set({ b2cSlabs: g.b2cSlabs.filter((_, j) => j !== i) })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CardContent className="flex flex-col gap-4">
            <Button
              variant="default"
              className="w-fit"
              icon={<Plus size={14} strokeWidth={1.5} />}
              onClick={() => set({ b2cSlabs: [...g.b2cSlabs, { from: today(), threshold: 2500, low: 0.05, high: 0.18 }] })}
            >
              Add slab
            </Button>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="s-round">Round GST factor to 4 decimals</Label>
                <p className="text-xs text-foreground-lighter">0.1071 / 0.0476 / 0.1525 — same as the Excel sheet.</p>
              </div>
              <Switch id="s-round" checked={g.roundGstFactor} onCheckedChange={(c) => set({ roundGstFactor: c })} />
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="GST on the company bill" description="GST the company charged on WSP when it dispatched the goods.">
        <Card>
          <CardContent className="grid grid-cols-3 gap-4">
            <FormField label="WSP above ₹ / piece" htmlFor="s-bt">
              <NumberInput id="s-bt" value={g.b2b.threshold} onChange={(v) => set({ b2b: { ...g.b2b, threshold: v ?? 0 } })} />
            </FormField>
            <FormField label="Up to it" htmlFor="s-bl">
              <NumberInput id="s-bl" percent value={g.b2b.low} onChange={(v) => set({ b2b: { ...g.b2b, low: v ?? 0 } })} />
            </FormField>
            <FormField label="Above it" htmlFor="s-bh">
              <NumberInput id="s-bh" percent value={g.b2b.high} onChange={(v) => set({ b2b: { ...g.b2b, high: v ?? 0 } })} />
            </FormField>
          </CardContent>
          <CardFooter className="justify-end border-t">
            <Button
              variant="default"
              onClick={() => {
                set({ b2cSlabs: DEFAULT_GLOBALS.b2cSlabs, b2b: DEFAULT_GLOBALS.b2b, roundGstFactor: true, cnBasePct: DEFAULT_GLOBALS.cnBasePct });
                toast.success("GST rules reset to the Excel sheet's");
              }}
            >
              Reset GST rules
            </Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Data" description="Everything is stored on this computer. Keep a backup file somewhere safe.">
        <Card>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="default" icon={<Download size={14} strokeWidth={1.5} />} onClick={exportData}>Download backup</Button>
            <Button variant="default" icon={<Upload size={14} strokeWidth={1.5} />} onClick={() => file.current?.click()}>Restore backup</Button>
            <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ""; }} />
            <Button variant="danger" className="ml-auto" onClick={() => setReset(true)}>Erase all data</Button>
          </CardContent>
        </Card>
      </Section>

      <AlertDialog open={reset} onOpenChange={setReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Erase all data?</AlertDialogTitle>
            <AlertDialogDescription>
              All {data.parties.length} parties, {data.sales.length} sales and {data.notes.length} credit notes are deleted from this computer. Download a backup first if you may need them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => replaceAll({ globals: DEFAULT_GLOBALS, parties: [], sales: [], notes: [], currentPartyId: null })}>
              Erase everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
