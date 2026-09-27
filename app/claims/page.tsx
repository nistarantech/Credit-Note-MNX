"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileSpreadsheet, FileText, Plus, Printer, ReceiptIndianRupee, Trash2 } from "lucide-react";
import { inr, summarize } from "@/lib/calc";
import { claimPayload, monthLabel, monthOf, monthRange, ofKind, salesMonths, type SaleKind } from "@/lib/month";
import { calcSettings, useStore, type Claim } from "@/lib/store";
import { brandStats } from "@/lib/stats";
import { printPage } from "@/lib/print";
import { saveClaimExcel } from "@/lib/claim-excel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogSection, DialogSectionSeparator, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Admonition } from "@/components/ui-patterns/admonition";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";
import { ClaimDoc } from "@/components/app/claim-doc";
import { ClaimStatus } from "@/components/app/claim-status";
import { Figure, FormField, NumberInput, fmtDate, today } from "@/components/app/fields";
import { Metric } from "@/components/app/metric";
import { NoBrand } from "@/components/app/no-brand";
import { Page } from "@/components/app/page";

type Mode = { kind: "list" } | { kind: "new"; month?: string } | { kind: "view"; id: string };

export default function ClaimsPage() {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const router = useRouter();

  // Other screens link here with ?new=1[&month=2025-09] or ?view=<claim id>
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("view")) setMode({ kind: "view", id: q.get("view")! });
    else if (q.get("new")) setMode({ kind: "new", month: q.get("month") ?? undefined });
    if (q.size) router.replace("/claims/");
  }, [router]);

  if (mode.kind === "new") return <NewClaim month={mode.month} onDone={(id) => setMode(id ? { kind: "view", id } : { kind: "list" })} />;
  if (mode.kind === "view") return <ViewClaim id={mode.id} onBack={() => setMode({ kind: "list" })} />;
  return <ClaimList onNew={() => setMode({ kind: "new" })} onOpen={(id) => setMode({ kind: "view", id })} />;
}

function ClaimList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const { data, brand } = useStore();
  const [scope, setScope] = useState(brand ? "brand" : "all");
  const [status, setStatus] = useState("all");
  const claims = data.claims
    .filter((c) => scope === "all" || c.brandId === brand?.id)
    .filter((c) => status === "all" || c.status === status);
  const claimed = claims.reduce((a, c) => a + c.total, 0);
  const received = claims.reduce((a, c) => a + (c.received?.amount ?? 0), 0);
  const awaiting = claims.filter((c) => c.status === "raised").reduce((a, c) => a + c.total, 0);

  return (
    <Page
      title="Claims"
      description="Credit notes you have claimed from brands, and what each brand actually credited."
      size="large"
      actions={<Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} disabled={!brand} onClick={onNew}>New claim</Button>}
    >
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Metric label="Claimed" value={`₹ ${inr(claimed)}`} />
        <Metric label="Credit notes received" value={`₹ ${inr(received)}`} strong />
        <Metric label="Awaiting from brands" value={`₹ ${inr(awaiting)}`} tooltip="Claims the brand has not credited yet" />
        <Metric label="Short-credited" value={`₹ ${inr(claimed - awaiting - received)}`} tooltip="Claimed minus received, on claims the brand has credited" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b px-(--card-padding-x) py-3">
          <ToggleGroup type="single" value={scope} onValueChange={(v) => v && setScope(v)} className="gap-1 rounded-md bg-surface-200 p-1">
            <ToggleGroupItem value="brand" size="tiny" disabled={!brand}>{brand ? brand.name : "Selected brand"}</ToggleGroupItem>
            <ToggleGroupItem value="all" size="tiny">All brands</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="single" value={status} onValueChange={(v) => v && setStatus(v)} className="gap-1 rounded-md bg-surface-200 p-1">
            <ToggleGroupItem value="all" size="tiny">All</ToggleGroupItem>
            <ToggleGroupItem value="raised" size="tiny">Awaiting CN</ToggleGroupItem>
            <ToggleGroupItem value="received" size="tiny">Received</ToggleGroupItem>
          </ToggleGroup>
          <span className="ml-auto text-xs text-foreground-lighter">{claims.length} claims</span>
        </div>
        {claims.length === 0 ? (
          <div className="py-16">
            <EmptyStatePresentational icon={FileText} title="No claims yet" description="Raise a claim from a brand's sales, or all brands at once from Month-end.">
              {brand ? <Button variant="primary" onClick={onNew}>New claim</Button> : null}
            </EmptyStatePresentational>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>For</TableHead>
                <TableHead className="text-right">Claimed</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead>Brand&apos;s CN</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => onOpen(c.id)}>
                  <TableCell>
                    <div className="font-mono text-xs text-foreground">{c.number}</div>
                    <div className="text-xs text-foreground-lighter">{fmtDate(c.date)}</div>
                  </TableCell>
                  <TableCell>{c.brand.name}</TableCell>
                  <TableCell className="whitespace-nowrap text-foreground-light">
                    {c.month ? monthLabel(c.month) : `${fmtDate(c.from)} – ${fmtDate(c.to)}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">₹ {inr(c.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.received ? `₹ ${inr(c.received.amount)}` : "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-foreground-light">{c.received?.cnNumber || "—"}</TableCell>
                  <TableCell><ClaimStatus c={c} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </Page>
  );
}

function NewClaim({ month: initialMonth, onDone }: { month?: string; onDone: (id: string | null) => void }) {
  const { data, brand, raiseClaim } = useStore();
  const stats = brand ? brandStats(data, brand) : null;
  const openMonths = stats ? salesMonths(stats.open) : [];
  const [period, setPeriod] = useState<"month" | "range">("month");
  const [month, setMonth] = useState(initialMonth ?? openMonths[0] ?? "");
  const dates = stats?.open.map((s) => s.date).sort() ?? [];
  const [range, setRange] = useState<[string, string]>([dates[0] ?? today(), dates[dates.length - 1] ?? today()]);
  const [date, setDate] = useState(today());
  const [remarks, setRemarks] = useState("");
  const [kind, setKind] = useState<SaleKind>("all");

  if (!brand || !stats) return <Page title="New claim"><NoBrand /></Page>;

  const [from, to] = period === "month" && month ? monthRange(month) : range;
  const inPeriod = stats.open.filter((s) => (period === "month" ? monthOf(s.date) === month : s.date >= from && s.date <= to));
  const included = inPeriod.filter(ofKind(kind));
  const settings = calcSettings(data.globals, brand);
  const sum = summarize(included, settings);
  const number = `${data.globals.claimPrefix}${String(data.globals.nextClaimNo).padStart(4, "0")}`;

  const raise = () => {
    const id = raiseClaim(
      claimPayload(data, brand, included, { date, from, to, month: period === "month" ? month : null, remarks }),
      included.map((s) => s.id),
    );
    toast.success(`Claim ${number} raised on ${brand.name}`, { description: `₹ ${inr(sum.totalCn)}` });
    onDone(id);
  };

  return (
    <Page
      title="New claim"
      description={`Credit note to claim from ${brand.name} for your unclaimed sales.`}
      size="large"
      actions={<Button variant="default" icon={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => onDone(null)}>Back</Button>}
    >
      <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
          <Card>
            <CardHeader>
              <CardTitle>Claim</CardTitle>
              <CardDescription>Sales in the period that are not in an earlier claim.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FormField label="Claim no."><Input value={number} readOnly className="font-mono" /></FormField>
              <FormField label="Sales to claim" hint={kind === "all" ? undefined : `The ${kind === "DISC" ? "fresh" : "EOSS"} sales stay unclaimed, for a claim of their own`}>
                <ToggleGroup type="single" value={kind} onValueChange={(v) => v && setKind(v as SaleKind)} className="w-fit gap-1 rounded-md bg-surface-200 p-1">
                  <ToggleGroupItem value="all" size="tiny">All</ToggleGroupItem>
                  <ToggleGroupItem value="DISC" size="tiny">EOSS only</ToggleGroupItem>
                  <ToggleGroupItem value="FRESH" size="tiny">Fresh only</ToggleGroupItem>
                </ToggleGroup>
              </FormField>
              <FormField label="Period">
                <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as "month" | "range")} className="w-fit gap-1 rounded-md bg-surface-200 p-1">
                  <ToggleGroupItem value="month" size="tiny">Month</ToggleGroupItem>
                  <ToggleGroupItem value="range" size="tiny">Date range</ToggleGroupItem>
                </ToggleGroup>
              </FormField>
              {period === "month" ? (
                <FormField label="Month" hint={openMonths.length ? "Months with unclaimed sales" : undefined}>
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger size="small"><SelectValue placeholder="No unclaimed sales" /></SelectTrigger>
                    <SelectContent>
                      {[...new Set([month, ...openMonths])].filter(Boolean).sort().reverse().map((m) => (
                        <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="From" htmlFor="c-from"><Input id="c-from" type="date" value={range[0]} onChange={(e) => setRange([e.target.value, range[1]])} /></FormField>
                  <FormField label="To" htmlFor="c-to"><Input id="c-to" type="date" value={range[1]} onChange={(e) => setRange([range[0], e.target.value])} /></FormField>
                </div>
              )}
              <FormField label="Claim date" htmlFor="c-date"><Input id="c-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
              <FormField label="Remarks" htmlFor="c-rem"><Textarea id="c-rem" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></FormField>
            </CardContent>
            <CardContent>
              <dl className="divide-y">
                <Figure label="Sales included" value={`${included.length} of ${inPeriod.length} unclaimed in the period`} />
                <Figure label="Pieces" value={inr(sum.all.qty, 0)} />
                <Figure label="Credit note to claim" value={`₹ ${inr(sum.totalCn)}`} emphasis />
              </dl>
            </CardContent>
            <CardContent>
              <Button variant="primary" size="small" block disabled={!included.length} onClick={raise}>Raise claim</Button>
            </CardContent>
          </Card>
          {!stats.open.length ? <Admonition type="warning" title="Nothing to claim" description="Every sale of this brand is already in a claim. Add or import sales first." /> : null}
          {included.some((x) => x.wsp === null || x.wsp === undefined) ? (
            <Admonition
              type="warning"
              title={`${included.filter((x) => x.wsp === null || x.wsp === undefined).length} of these sales have no actual WSP`}
              description={`Their purchase rate is estimated as MRP × ${settings.wspFactor}, so this claim is partly an estimate. Set their purchase rates on the Sales screen (Purchase rates) before raising it.`}
            />
          ) : null}
        </div>
        <div className="min-w-0 overflow-x-auto">
          <ClaimDoc draft business={data.globals.business} number={number} date={date} from={from} to={to} remarks={remarks} brand={brand} settings={settings} lines={included} />
        </div>
      </div>
    </Page>
  );
}

function ViewClaim({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, deleteClaim, markReceived } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [recording, setRecording] = useState(false);
  const c = data.claims.find((x) => x.id === id);
  if (!c) return <Page title="Claim"><Button variant="default" onClick={onBack}>Back</Button></Page>;

  const save = async () => {
    const path = await printPage(`${c.number.replace(/[\\/]/g, "-")} ${c.brand.name}.pdf`);
    if (path) toast.success("PDF saved", { description: path });
  };
  const excel = async () => {
    try {
      const path = await saveClaimExcel({ business: data.globals.business, number: c.number, date: c.date, from: c.from, to: c.to, remarks: c.remarks, brand: c.brand, settings: c.settings, lines: c.lines, received: c.received });
      if (path) toast.success("Excel saved", { description: path });
    } catch (e) {
      toast.error("Couldn't make the Excel file", { description: (e as Error).message });
    }
  };
  const short = c.received ? c.total - c.received.amount : 0;

  return (
    <Page
      title={c.number}
      description={`${c.brand.name} · ${c.month ? monthLabel(c.month) : `${fmtDate(c.from)} – ${fmtDate(c.to)}`} · ₹ ${inr(c.total)}`}
      actions={
        <>
          <Button variant="default" icon={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={onBack}>All claims</Button>
          <Button variant="default" icon={<Trash2 size={14} strokeWidth={1.5} />} onClick={() => setConfirm(true)}>Delete</Button>
          <Button variant="default" icon={<FileSpreadsheet size={14} strokeWidth={1.5} />} onClick={excel}>Excel</Button>
          <Button variant="default" icon={<Printer size={14} strokeWidth={1.5} />} onClick={save}>{typeof window !== "undefined" && window.desktop ? "Save PDF" : "Print / PDF"}</Button>
          <Button variant="primary" icon={<ReceiptIndianRupee size={14} strokeWidth={1.5} />} onClick={() => setRecording(true)}>
            {c.received ? "Edit brand's CN" : "Record brand's CN"}
          </Button>
        </>
      }
    >
      <div className="no-print">
        {c.received ? (
          <Admonition
            type={Math.abs(short) < 1 ? "success" : "warning"}
            title={Math.abs(short) < 1 ? "Credited in full" : short > 0 ? `Brand credited ₹ ${inr(short)} less than claimed` : `Brand credited ₹ ${inr(-short)} more than claimed`}
            description={`${c.brand.name} CN ${c.received.cnNumber || "(no number)"} dated ${fmtDate(c.received.cnDate)} for ₹ ${inr(c.received.amount)}.`}
          />
        ) : (
          <Admonition type="default" title="Waiting for the brand's credit note" description="Send this claim to the brand. When their credit note arrives, record it here to check it against the claim." />
        )}
      </div>

      <ClaimDoc business={data.globals.business} number={c.number} date={c.date} from={c.from} to={c.to} remarks={c.remarks} brand={c.brand} settings={c.settings} lines={c.lines} />

      <ReceivedDialog open={recording} onOpenChange={setRecording} claim={c} onSave={(r) => { markReceived(c.id, r); toast.success(r ? "Brand's credit note recorded" : "Marked as awaiting"); }} />

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete claim {c.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {c.lines.length} sales become unclaimed again, ready for a new claim. Anything recorded against it is lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep claim</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => { deleteClaim(c.id); toast.success(`${c.number} deleted`); onBack(); }}>Delete claim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}

function ReceivedDialog({
  open, onOpenChange, claim, onSave,
}: { open: boolean; onOpenChange: (o: boolean) => void; claim: Claim; onSave: (r: Claim["received"]) => void }) {
  const init = () => claim.received ?? { cnNumber: "", cnDate: today(), amount: +claim.total.toFixed(2) };
  const [r, setR] = useState(init);
  const [seen, setSeen] = useState(open);
  if (seen !== open) {
    setSeen(open);
    if (open) setR(init());
  }
  const short = claim.total - r.amount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="small">
        <DialogHeader>
          <DialogTitle>Brand&apos;s credit note</DialogTitle>
          <DialogDescription>What {claim.brand.name} actually credited against {claim.number}.</DialogDescription>
        </DialogHeader>
        <DialogSectionSeparator />
        <DialogSection className="flex flex-col gap-4">
          <FormField label="Their CN number" htmlFor="r-no">
            <Input id="r-no" autoFocus value={r.cnNumber} onChange={(e) => setR({ ...r, cnNumber: e.target.value })} className="font-mono" />
          </FormField>
          <FormField label="CN date" htmlFor="r-date">
            <Input id="r-date" type="date" value={r.cnDate} onChange={(e) => setR({ ...r, cnDate: e.target.value })} />
          </FormField>
          <FormField
            label="Amount credited"
            htmlFor="r-amt"
            hint={Math.abs(short) < 1 ? `Matches the claim of ₹ ${inr(claim.total)}` : `${short > 0 ? "Short" : "Over"} by ₹ ${inr(Math.abs(short))} against ₹ ${inr(claim.total)} claimed`}
          >
            <NumberInput id="r-amt" prefix="₹" value={r.amount} onChange={(v) => setR({ ...r, amount: v ?? 0 })} />
          </FormField>
        </DialogSection>
        <DialogFooter>
          {claim.received ? (
            <Button variant="default" className="mr-auto" onClick={() => { onSave(null); onOpenChange(false); }}>Mark as not received</Button>
          ) : null}
          <Button variant="default" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { onSave(r); onOpenChange(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
