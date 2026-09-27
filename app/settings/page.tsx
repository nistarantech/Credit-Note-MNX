"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Database, Download, FolderOpen, Pencil, Upload } from "lucide-react";
import { desktopDb } from "@/lib/persist";
import { termsFor } from "@/lib/calc";
import { DEFAULT_GLOBALS, calcSettings, useStore, type Brand, type Data, type Globals } from "@/lib/store";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandSheet } from "@/components/app/brand-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  PageSection, PageSectionContent, PageSectionDescription, PageSectionMeta, PageSectionSummary, PageSectionTitle,
} from "@/components/ui-patterns/page-section";
import { FormField, NumberInput, fmtDate, today } from "@/components/app/fields";
import { GstHistory } from "@/components/app/gst";
import { MARGIN_PRESETS, PercentPicker } from "@/components/app/margin-select";
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
  const [termsOf, setTermsOf] = useState<Brand | null>(null);
  const [dbInfo, setDbInfo] = useState<{ dir: string; file: string } | null>(null);
  useEffect(() => {
    desktopDb()?.info().then(setDbInfo);
  }, []);
  const file = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Globals>) => setGlobals(patch);
  const setBiz = (patch: Partial<Globals["business"]>) => set({ business: { ...g.business, ...patch } });

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cn-claims-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as Data;
      if (!Array.isArray(d.brands) || !Array.isArray(d.sales)) throw new Error("not a backup");
      replaceAll(d);
      toast.success(`Restored ${d.brands.length} brands, ${d.sales.length} sales, ${d.claims?.length ?? 0} claims`);
    } catch {
      toast.error("That file is not a Credit Note backup");
    }
  };

  return (
    <Page title="Settings" description="Your details, each brand's margins, and the rules shared by every brand.">
      <Section title="Your business" description="You, the retailer claiming the credit notes. Printed at the top of every claim.">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <FormField label="Business name" htmlFor="s-name">
              <Input id="s-name" value={g.business.name} onChange={(e) => setBiz({ name: e.target.value })} placeholder="MNX Family Store (Kawardha)" />
            </FormField>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="GSTIN" htmlFor="s-gst">
                <Input id="s-gst" value={g.business.gstNo} onChange={(e) => setBiz({ gstNo: e.target.value.toUpperCase() })} className="font-mono" />
              </FormField>
              <FormField label="Phone" htmlFor="s-phone">
                <Input id="s-phone" value={g.business.phone} onChange={(e) => setBiz({ phone: e.target.value })} />
              </FormField>
              <FormField label="Email" htmlFor="s-email">
                <Input id="s-email" type="email" value={g.business.email} onChange={(e) => setBiz({ email: e.target.value })} />
              </FormField>
            </div>
            <FormField label="Address" htmlFor="s-addr">
              <Textarea id="s-addr" rows={2} value={g.business.address} onChange={(e) => setBiz({ address: e.target.value })} />
            </FormField>
          </CardContent>
        </Card>
      </Section>

      <Section title="Claims" description="How your claims are numbered and the CN % is worked out.">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Claim number prefix" htmlFor="s-pre">
                <Input id="s-pre" value={g.claimPrefix} onChange={(e) => set({ claimPrefix: e.target.value })} className="font-mono" />
              </FormField>
              <FormField label="Next number" htmlFor="s-next" hint={`Next claim: ${g.claimPrefix}${String(g.nextClaimNo).padStart(4, "0")}`}>
                <NumberInput id="s-next" value={g.nextClaimNo} onChange={(v) => set({ nextClaimNo: Math.max(1, Math.round(v ?? 1)) })} />
              </FormField>
            </div>
            <FormField label="CN % is worked on" htmlFor="s-base" hint="Share of the MRP received from the brand, for “CN % of MRP”. A brand can override it.">
              <NumberInput id="s-base" percent value={g.cnBasePct} onChange={(v) => set({ cnBasePct: v ?? 0 })} />
            </FormField>
          </CardContent>
        </Card>
      </Section>

      <Section title="Margins by brand" description="Each brand's own deal — your fresh and EOSS margins, discount slabs and dated changes. Unclaimed sales are recalculated when you change them; claims already raised keep their terms.">
        <Card>
          {data.brands.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Fresh</TableHead>
                  <TableHead className="text-right">EOSS</TableHead>
                  <TableHead>Also</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.brands.map((b) => {
                  const t = termsFor(today(), calcSettings(g, b));
                  const later = b.termChanges.filter((c) => c.from > today()).length;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="text-foreground">{b.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{+(t.freshMargin * 100).toFixed(2)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{+(t.discMargin * 100).toFixed(2)}%</TableCell>
                      <TableCell className="text-xs text-foreground-lighter">
                        {[t.marginSlabs.length && `${t.marginSlabs.length} discount slabs`, t.from && `terms from ${fmtDate(t.from)}`, later && `${later} change${later > 1 ? "s" : ""} ahead`].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="default" size="tiny" icon={<Pencil size={12} strokeWidth={1.5} />} onClick={() => setTermsOf(b)}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <CardContent className="py-6 text-sm text-foreground-lighter">No brands yet — add them on the Brands screen.</CardContent>
          )}
        </Card>
        <BrandSheet open={!!termsOf} onOpenChange={(o) => !o && setTermsOf(null)} brand={termsOf} startTab="terms" />
      </Section>

      <Section title="Default deal" description="Filled in for new brands. Each brand can have its own.">
        <Card>
          <CardContent className="grid grid-cols-3 gap-4">
            <FormField label="EOSS margin" htmlFor="s-disc">
              <PercentPicker id="s-disc" presets={MARGIN_PRESETS} value={g.defaults.discMargin} onChange={(v) => set({ defaults: { ...g.defaults, discMargin: v ?? 0 } })} />
            </FormField>
            <FormField label="Fresh margin" htmlFor="s-fresh">
              <PercentPicker id="s-fresh" presets={MARGIN_PRESETS} value={g.defaults.freshMargin} onChange={(v) => set({ defaults: { ...g.defaults, freshMargin: v ?? 0 } })} />
            </FormField>
            <FormField label="WSP factor" htmlFor="s-wsp" hint="WSP = MRP × factor">
              <NumberInput id="s-wsp" value={g.defaults.wspFactor} onChange={(v) => set({ defaults: { ...g.defaults, wspFactor: v ?? 0 } })} />
            </FormField>
          </CardContent>
        </Card>
      </Section>

      <Section
        title="GST in your sale price"
        description="GST your customer paid, included in the sale value. A sale uses the period its bill date falls in, then the per-piece value before GST."
      >
        <Card>
          <GstHistory slabs={g.b2cSlabs} onChange={(b2cSlabs) => set({ b2cSlabs })} />
          <CardContent className="flex items-center justify-between gap-4 border-t">
            <div>
              <Label htmlFor="s-round">Round the GST factor to 4 decimals</Label>
              <p className="text-xs text-foreground-lighter">0.1071 / 0.0476 / 0.1525 — the same as the Excel sheet.</p>
            </div>
            <Switch id="s-round" checked={g.roundGstFactor} onCheckedChange={(c) => set({ roundGstFactor: c })} />
          </CardContent>
        </Card>
      </Section>

      <Section
        title="GST on the brand's bill"
        description="GST the brand charged you on WSP. A sale uses the period its purchase invoice date falls in — goods bought before a rate change keep the old rate."
      >
        <Card>
          <GstHistory slabs={g.b2bSlabs} onChange={(b2bSlabs) => set({ b2bSlabs })} />
          <CardFooter className="justify-end border-t">
            <Button
              variant="default"
              onClick={() => {
                set({ b2cSlabs: DEFAULT_GLOBALS.b2cSlabs, b2bSlabs: DEFAULT_GLOBALS.b2bSlabs, roundGstFactor: true, cnBasePct: DEFAULT_GLOBALS.cnBasePct });
                toast.success("GST rules reset", { description: "5% / 12% at ₹ 1,000 until 21 Sep 2025, then 5% / 18% at ₹ 2,500" });
              }}
            >
              Reset to government rates
            </Button>
          </CardFooter>
        </Card>
      </Section>

      <Section
        title="Data"
        description={dbInfo ? "Everything is kept in a SQLite database on this computer, with the original Excel files filed by brand and month." : "Everything is kept in this browser. Keep a backup file somewhere safe."}
      >
        <Card>
          {dbInfo ? (
            <CardContent className="flex flex-col gap-1">
              <span className="text-xs text-foreground-lighter">Database</span>
              <span className="break-all font-mono text-xs text-foreground-light">{dbInfo.file}</span>
            </CardContent>
          ) : null}
          <CardContent className="flex flex-wrap gap-2">
            {dbInfo ? (
              <>
                <Button variant="default" icon={<FolderOpen size={14} strokeWidth={1.5} />} onClick={() => desktopDb()?.openFolder()}>Open data folder</Button>
                <Button
                  variant="default"
                  icon={<Database size={14} strokeWidth={1.5} />}
                  onClick={async () => {
                    const file = await desktopDb()?.backup();
                    if (file) toast.success("Database backed up", { description: file });
                  }}
                >
                  Back up database
                </Button>
              </>
            ) : null}
            <Button variant="default" icon={<Download size={14} strokeWidth={1.5} />} onClick={exportData}>Export JSON</Button>
            <Button variant="default" icon={<Upload size={14} strokeWidth={1.5} />} onClick={() => file.current?.click()}>Restore from JSON</Button>
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
              All {data.brands.length} brands, {data.sales.length} sales, {data.purchases.length} invoice lines and {data.claims.length} claims are deleted. Stored Excel files stay in the data folder. Download a backup first if you may need them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => replaceAll({ globals: DEFAULT_GLOBALS })}>
              Erase everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
