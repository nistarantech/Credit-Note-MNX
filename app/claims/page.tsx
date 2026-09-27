"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileText, Pencil, Plus, Printer, ReceiptIndianRupee, Trash2, Unlink } from "lucide-react";
import { inr, summarize, uid } from "@/lib/calc";
import { claimPayload, monthLabel, monthOf, monthRange, salesMonths } from "@/lib/month";
import { RECON_LABEL, ageBucket, ageDays, expectedFromRules, type ReconStatus } from "@/lib/recon";
import { CLAIM_STATUS_LABEL, calcSettings, useStore, type Claim, type SettlementEntry, type SupplierCn } from "@/lib/store";
import { brandStats, claimPosition } from "@/lib/stats";
import { printPage } from "@/lib/print";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Admonition } from "@/components/ui-patterns/admonition";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";
import { ClaimDoc } from "@/components/app/claim-doc";
import { ClaimStatus, ReconBadge } from "@/components/app/claim-status";
import { Figure, FormField, NumberInput, fmtDate, today } from "@/components/app/fields";
import { Metric } from "@/components/app/metric";
import { NoBrand } from "@/components/app/no-brand";
import { Page } from "@/components/app/page";
import { SchemeDoc } from "@/components/app/scheme-doc";
import { SupplierCnDialog } from "@/components/app/supplier-cn-dialog";

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

const RESULT_VARIANT: Record<ReconStatus, "success" | "destructive" | "default" | "warning"> = {
  matched: "success", short: "destructive", excess: "default", missing: "warning",
};

function ClaimList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const { data, brand } = useStore();
  const [scope, setScope] = useState(brand ? "brand" : "all");
  const [status, setStatus] = useState("all");
  const claims = data.claims
    .filter((c) => scope === "all" || c.brandId === brand?.id)
    .filter((c) => status === "all" || c.status === status)
    .map((c) => ({ c, p: claimPosition(data, c) }));
  const claimed = claims.reduce((a, { c }) => a + c.total, 0);
  const received = claims.reduce((a, { p }) => a + p.settle.cnReceived, 0);
  const short = claims.reduce((a, { p }) => a + p.recon.short, 0);
  const pending = claims.filter(({ c }) => c.status !== "settled").reduce((a, { p }) => a + Math.max(0, p.settle.pending), 0);

  return (
    <Page
      title="Claims"
      description="Credit notes you claimed from brands, what each brand credited, and how it was settled."
      size="large"
      actions={<Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} disabled={!brand} onClick={onNew}>New claim</Button>}
    >
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Metric label="Claimed" value={`₹ ${inr(claimed)}`} />
        <Metric label="CN received" value={`₹ ${inr(received)}`} strong />
        <Metric label="Short credit" value={`₹ ${inr(short)}`} tooltip="Lines the brand credited less than claimed, or left out" />
        <Metric label="Not yet settled" value={`₹ ${inr(pending)}`} tooltip="Claimed (or approved) but not yet adjusted, refunded or written off" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b px-(--card-padding-x) py-3">
          <ToggleGroup type="single" value={scope} onValueChange={(v) => v && setScope(v)} className="gap-1 rounded-md bg-surface-200 p-1">
            <ToggleGroupItem value="brand" size="tiny" disabled={!brand}>{brand ? brand.name : "Selected brand"}</ToggleGroupItem>
            <ToggleGroupItem value="all" size="tiny">All brands</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="single" value={status} onValueChange={(v) => v && setStatus(v)} className="gap-1 rounded-md bg-surface-200 p-1">
            <ToggleGroupItem value="all" size="tiny">All</ToggleGroupItem>
            {(Object.keys(CLAIM_STATUS_LABEL) as Claim["status"][]).map((s) => (
              <ToggleGroupItem key={s} value={s} size="tiny">{CLAIM_STATUS_LABEL[s]}</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="ml-auto text-xs text-foreground-lighter">{claims.length} claims</span>
        </div>
        {claims.length === 0 ? (
          <div className="py-16">
            <EmptyStatePresentational icon={FileText} title="No claims yet" description="Raise a claim from a brand's sales or scheme rules, or all brands at once from Month-end.">
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
                <TableHead className="text-right">CN received</TableHead>
                <TableHead>Check</TableHead>
                <TableHead className="text-right">Age</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map(({ c, p }) => {
                const days = ageDays(c.date);
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => onOpen(c.id)}>
                    <TableCell>
                      <div className="font-mono text-xs text-foreground">{c.number}</div>
                      <div className="text-xs text-foreground-lighter">{fmtDate(c.date)}{c.kind === "scheme" ? " · scheme" : ""}</div>
                    </TableCell>
                    <TableCell>{c.brand.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-foreground-light">{c.month ? monthLabel(c.month) : `${fmtDate(c.from)} – ${fmtDate(c.to)}`}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">₹ {inr(c.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.cns.length ? `₹ ${inr(p.settle.cnReceived)}` : "—"}</TableCell>
                    <TableCell><ReconBadge r={p.recon} /></TableCell>
                    <TableCell className={`text-right tabular-nums text-xs ${c.status !== "settled" && days > 60 ? "text-warning-600" : "text-foreground-lighter"}`}>
                      {c.status === "settled" ? "—" : `${days} d`}
                    </TableCell>
                    <TableCell><ClaimStatus c={c} /></TableCell>
                  </TableRow>
                );
              })}
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
  const brandRules = data.rules.filter((r) => r.brandId === brand?.id && r.active);
  const [kind, setKind] = useState<Claim["kind"]>("sales");
  const openMonths = stats ? salesMonths(stats.open) : [];
  const buyMonths = [...new Set(data.purchases.filter((p) => p.brandId === brand?.id).map((p) => monthOf(p.date)))];
  const months = kind === "sales" ? openMonths : [...new Set([...buyMonths, ...salesMonths(stats?.sales ?? [])])].sort().reverse();
  const [period, setPeriod] = useState<"month" | "range">("month");
  const [month, setMonth] = useState(initialMonth ?? openMonths[0] ?? "");
  const dates = stats?.open.map((s) => s.date).sort() ?? [];
  const [range, setRange] = useState<[string, string]>([dates[0] ?? today(), dates[dates.length - 1] ?? today()]);
  const [date, setDate] = useState(today());
  const [remarks, setRemarks] = useState("");

  if (!brand || !stats) return <Page title="New claim"><NoBrand /></Page>;

  const [from, to] = period === "month" && month ? monthRange(month) : range;
  const settings = calcSettings(data.globals, brand);
  const number = `${data.globals.claimPrefix}${String(data.globals.nextClaimNo).padStart(4, "0")}`;

  // Sales claim: unclaimed sales in the period.
  const included = stats.open.filter((s) => (period === "month" ? monthOf(s.date) === month : s.date >= from && s.date <= to));
  const sum = summarize(included, settings);
  // Scheme claim: the brand's active rules on its invoices / sales, less lines already claimed.
  const claimedLines = new Set(data.claims.filter((c) => c.brandId === brand.id && c.kind === "scheme").flatMap((c) => c.schemeLines.map((l) => l.id)));
  const scheme = expectedFromRules({
    rules: brandRules, purchases: data.purchases.filter((p) => p.brandId === brand.id), sales: stats.sales,
    skus: data.skus.filter((s) => s.brandId === brand.id), settings, from, to, exclude: claimedLines,
  });
  const schemeTotal = scheme.lines.reduce((a, l) => a + l.gross, 0);
  const total = kind === "sales" ? sum.totalCn : schemeTotal;
  const count = kind === "sales" ? included.length : scheme.lines.length;

  const raise = () => {
    const opts = { date, from, to, month: period === "month" ? month : null, remarks };
    const id = kind === "sales"
      ? raiseClaim(claimPayload(data, brand, included, opts), included.map((s) => s.id))
      : raiseClaim({ ...opts, kind: "scheme", brandId: brand.id, brand, settings, lines: [], schemeLines: scheme.lines, total: schemeTotal }, []);
    toast.success(`Claim ${number} raised on ${brand.name}`, { description: `₹ ${inr(total)}` });
    onDone(id);
  };

  return (
    <Page
      title="New claim"
      description={`Credit note to claim from ${brand.name}.`}
      size="large"
      actions={<Button variant="default" icon={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => onDone(null)}>Back</Button>}
    >
      <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
          <Card>
            <CardHeader>
              <CardTitle>Claim</CardTitle>
              <CardDescription>{kind === "sales" ? "Your margin support on sales not in an earlier claim." : "What the brand's active CN rules pay on its invoices and your sales."}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FormField label="Claim for">
                <ToggleGroup type="single" value={kind} onValueChange={(v) => v && setKind(v as Claim["kind"])} className="w-fit gap-1 rounded-md bg-surface-200 p-1">
                  <ToggleGroupItem value="sales" size="tiny">Sales</ToggleGroupItem>
                  <ToggleGroupItem value="scheme" size="tiny">CN rules</ToggleGroupItem>
                </ToggleGroup>
              </FormField>
              <FormField label="Claim no."><Input value={number} readOnly className="font-mono" /></FormField>
              <FormField label="Period">
                <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as "month" | "range")} className="w-fit gap-1 rounded-md bg-surface-200 p-1">
                  <ToggleGroupItem value="month" size="tiny">Month</ToggleGroupItem>
                  <ToggleGroupItem value="range" size="tiny">Date range</ToggleGroupItem>
                </ToggleGroup>
              </FormField>
              {period === "month" ? (
                <FormField label="Month">
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger size="small"><SelectValue placeholder="No data" /></SelectTrigger>
                    <SelectContent>
                      {[...new Set([month, ...months])].filter(Boolean).sort().reverse().map((m) => (
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
                <Figure label={kind === "sales" ? "Sales included" : "Eligible lines"} value={kind === "sales" ? `${included.length} of ${stats.open.length} unclaimed` : String(count)} />
                <Figure label="Credit note to claim" value={`₹ ${inr(total)}`} emphasis />
              </dl>
            </CardContent>
            <CardContent>
              <Button variant="primary" size="small" block disabled={!count} onClick={raise}>Raise claim</Button>
            </CardContent>
          </Card>
          {kind === "sales" && !stats.open.length ? <Admonition type="warning" title="Nothing to claim" description="Every sale of this brand is already in a claim. Add or import sales first." /> : null}
          {kind === "scheme" && !brandRules.length ? <Admonition type="warning" title="No active CN rules" description={`Add ${brand.name}'s scheme rules on the CN rules screen first.`} /> : null}
          {kind === "scheme" && scheme.ineligible.length ? (
            <Admonition type="default" title="Rules not met" description={scheme.ineligible.map((x) => `${data.rules.find((r) => r.id === x.ruleId)?.name}: ${x.reason}`).join(" · ")} />
          ) : null}
        </div>
        <div className="min-w-0 overflow-x-auto">
          {kind === "sales" ? (
            <ClaimDoc draft business={data.globals.business} number={number} date={date} from={from} to={to} remarks={remarks} brand={brand} settings={settings} lines={included} />
          ) : (
            <SchemeDoc draft business={data.globals.business} number={number} date={date} from={from} to={to} remarks={remarks} brand={brand} lines={scheme.lines} />
          )}
        </div>
      </div>
    </Page>
  );
}

function ViewClaim({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, deleteClaim, setDisputed } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [cnOpen, setCnOpen] = useState<{ cn: SupplierCn | null } | null>(null);
  const [dispute, setDispute] = useState(false);
  const [tab, setTab] = useState("claim");
  const c = data.claims.find((x) => x.id === id);
  if (!c) return <Page title="Claim"><Button variant="default" onClick={onBack}>Back</Button></Page>;
  const p = claimPosition(data, c);

  const save = async () => {
    const path = await printPage(`${c.number.replace(/[\\/]/g, "-")} ${c.brand.name}.pdf`);
    if (path) toast.success("PDF saved", { description: path });
  };

  return (
    <Page
      title={c.number}
      description={`${c.brand.name} · ${c.month ? monthLabel(c.month) : `${fmtDate(c.from)} – ${fmtDate(c.to)}`} · ₹ ${inr(c.total)}`}
      actions={
        <>
          <Button variant="default" icon={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={onBack}>All claims</Button>
          <Button variant="default" icon={<Trash2 size={14} strokeWidth={1.5} />} onClick={() => setConfirm(true)}>Delete</Button>
          <Button variant="default" icon={<Printer size={14} strokeWidth={1.5} />} onClick={save}>{typeof window !== "undefined" && window.desktop ? "Save PDF" : "Print / PDF"}</Button>
          <Button variant="primary" icon={<ReceiptIndianRupee size={14} strokeWidth={1.5} />} onClick={() => setCnOpen({ cn: null })}>Record brand&apos;s CN</Button>
        </>
      }
    >
      <div className="no-print flex flex-wrap items-center gap-3 rounded-md border px-4 py-3">
        <ClaimStatus c={c} />
        <span className="text-sm text-foreground-light">
          {c.status === "claimed" && `Waiting for ${c.brand.name}'s credit note · ${ageDays(c.date)} days (${ageBucket(ageDays(c.date))})`}
          {c.status === "cn_received" && `Credited ₹ ${inr(p.settle.cnReceived)} of ₹ ${inr(c.total)} · ₹ ${inr(Math.max(0, p.settle.pending))} still to settle`}
          {c.status === "settled" && "Closed — credit adjusted, refunded or written off in full"}
          {c.status === "disputed" && "Disputed — it stays here until you clear the dispute"}
        </span>
        <Button variant="default" size="tiny" className="ml-auto" onClick={() => (c.status === "disputed" ? setDisputed(c.id, false) : setDispute(true))}>
          {c.status === "disputed" ? "Clear dispute" : "Mark disputed"}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print gap-6">
          <TabsTrigger value="claim">Claim</TabsTrigger>
          <TabsTrigger value="check">Check against CN {p.cns.length ? `(${p.cns.length})` : ""}</TabsTrigger>
          <TabsTrigger value="settle">Settlement</TabsTrigger>
        </TabsList>
        <TabsContent value="claim" className="mt-4">
          {c.kind === "scheme" ? (
            <SchemeDoc business={data.globals.business} number={c.number} date={c.date} from={c.from} to={c.to} remarks={c.remarks} brand={c.brand} lines={c.schemeLines} />
          ) : (
            <ClaimDoc business={data.globals.business} number={c.number} date={c.date} from={c.from} to={c.to} remarks={c.remarks} brand={c.brand} settings={c.settings} lines={c.lines} />
          )}
        </TabsContent>
        <TabsContent value="check" className="mt-4 flex flex-col gap-6">
          <CheckTab claim={c} onRecord={(cn) => setCnOpen({ cn })} />
        </TabsContent>
        <TabsContent value="settle" className="mt-4 flex flex-col gap-6">
          <SettleTab claim={c} />
        </TabsContent>
      </Tabs>

      <SupplierCnDialog open={!!cnOpen} onOpenChange={(o) => !o && setCnOpen(null)} cn={cnOpen?.cn ?? null} brandId={c.brandId} claimId={c.id} />
      <DisputeDialog open={dispute} onOpenChange={setDispute} onSave={(reason) => { setDisputed(c.id, true, reason); toast.success(`${c.number} marked disputed`); }} />

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete claim {c.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              {c.kind === "sales" ? `Its ${c.lines.length} sales become unclaimed again. ` : "Its scheme lines can be claimed again. "}
              Settlement entries are removed; supplier CNs are kept but unlinked.
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

function CheckTab({ claim: c, onRecord }: { claim: Claim; onRecord: (cn: SupplierCn | null) => void }) {
  const { data, saveSupplierCn } = useStore();
  const { cns, recon: r } = claimPosition(data, c);
  const by = { barcode: "barcode / SKU", invoice: "invoice number", total: "total (the CN has no lines)" }[r.by];

  if (!cns.length) {
    return (
      <Card className="py-12">
        <EmptyStatePresentational icon={ReceiptIndianRupee} title="No credit note yet" description={`When ${c.brand.name}'s credit note arrives, record it — with its lines if you have them — to check it line by line against this claim.`}>
          <Button variant="primary" onClick={() => onRecord(null)}>Record brand&apos;s CN</Button>
        </EmptyStatePresentational>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Metric label="Claimed" value={`₹ ${inr(r.expected.gross)}`} />
        <Metric label="Credited" value={`₹ ${inr(r.actual.gross)}`} strong />
        <Metric label="Short" value={`₹ ${inr(r.short)}`} tooltip="Lines credited less than claimed, or missing from the CN" />
        <Metric label="Excess" value={`₹ ${inr(r.excess)}`} tooltip="Lines credited more than claimed, or not in the claim" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line by line</CardTitle>
          <CardDescription>
            Matched by {by}. Within ₹ {data.globals.tolerance.amount} counts as matched (Settings).
            {" "}{(Object.keys(RECON_LABEL) as ReconStatus[]).filter((s) => r.counts[s]).map((s) => `${r.counts[s]} ${RECON_LABEL[s].toLowerCase()}`).join(" · ")}
          </CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{r.by === "invoice" ? "Invoice" : r.by === "barcode" ? "SKU / barcode" : "Item"}</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Claimed</TableHead>
              <TableHead className="text-right">Credited</TableHead>
              <TableHead className="text-right">Difference</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.rows.map((x) => (
              <TableRow key={x.key}>
                <TableCell className="font-mono text-xs">{x.label}</TableCell>
                <TableCell className="text-right tabular-nums text-xs text-foreground-light">{inr(x.expected.qty, 0)}{x.actual.qty ? ` / ${inr(x.actual.qty, 0)}` : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{x.hasExpected ? inr(x.expected.gross) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{x.hasActual ? inr(x.actual.gross) : "—"}</TableCell>
                <TableCell className={`text-right tabular-nums ${Math.abs(x.diff) > data.globals.tolerance.amount ? "text-foreground" : "text-foreground-lighter"}`}>{inr(x.diff)}</TableCell>
                <TableCell>
                  <Badge variant={RESULT_VARIANT[x.status]}>{RECON_LABEL[x.status]}</Badge>
                  {x.notes.length ? <div className="mt-1 text-xs text-foreground-lighter">{x.notes.join(" · ")}</div> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell />
              <TableCell className="text-right tabular-nums">{inr(r.expected.gross)}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(r.actual.gross)}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(r.diff)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit notes against this claim</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>CN</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">GST</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cns.map((x) => (
              <TableRow key={x.id}>
                <TableCell className="font-mono text-xs">{x.number || "(no number)"} {x.disputed ? <Badge variant="destructive" className="ml-2">Disputed</Badge> : null}</TableCell>
                <TableCell>{fmtDate(x.date)}</TableCell>
                <TableCell className="text-right tabular-nums">{x.lines.length || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(x.gst)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(x.gross)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="text" size="tiny" className="h-7 w-7 px-0" icon={<Pencil size={14} strokeWidth={1.5} />} aria-label="Edit" onClick={() => onRecord(x)} />
                  <Button variant="text" size="tiny" className="h-7 w-7 px-0" icon={<Unlink size={14} strokeWidth={1.5} />} aria-label="Unlink"
                    onClick={() => { saveSupplierCn({ ...x, claimId: null }); toast.success("CN unlinked from the claim"); }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

const SETTLE_KINDS: { value: SettlementEntry["kind"]; label: string }[] = [
  { value: "adjusted", label: "Adjusted against payable" },
  { value: "refund", label: "Refund received" },
  { value: "write_off", label: "Shortfall written off" },
];

function SettleTab({ claim: c }: { claim: Claim }) {
  const { data, addSettlement, deleteSettlement, setApproved } = useStore();
  const { entries, settle: s } = claimPosition(data, c);
  const blank = (): SettlementEntry => ({
    id: uid(), claimId: c.id, date: today(), kind: "adjusted", amount: +Math.max(0, s.toUse || s.pending).toFixed(2), reference: "", remarks: "", createdAt: "",
  });
  const [e, setE] = useState<SettlementEntry>(blank);
  const set = (patch: Partial<SettlementEntry>) => setE((x) => ({ ...x, ...patch }));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="py-4">
            <dl className="divide-y">
              <Figure label="Claimed" value={`₹ ${inr(s.expected)}`} />
              <Figure label="Approved by the brand" value={`₹ ${inr(s.approved)}`} />
              <Figure label="CN received" value={`₹ ${inr(s.cnReceived)}`} />
              <Figure label="Adjusted against payable" value={`₹ ${inr(s.adjusted)}`} muted />
              <Figure label="Refund received" value={`₹ ${inr(s.refunded)}`} muted />
              <Figure label="Written off" value={`₹ ${inr(s.writtenOff)}`} muted />
              <Figure label="Still to recover from the brand" value={`₹ ${inr(s.toRecover)}`} />
              <Figure label="CN in hand, not yet used" value={`₹ ${inr(s.toUse)}`} />
              <Figure label="Pending" value={`₹ ${inr(Math.max(0, s.pending))}`} emphasis />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Entries</CardTitle></CardHeader>
          {entries.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>How</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell>{fmtDate(x.date)}</TableCell>
                    <TableCell>
                      {SETTLE_KINDS.find((k) => k.value === x.kind)?.label}
                      {x.remarks ? <div className="text-xs text-foreground-lighter">{x.remarks}</div> : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{x.reference || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(x.amount)}</TableCell>
                    <TableCell>
                      <Button variant="text" size="tiny" className="h-7 w-7 px-0" icon={<Trash2 size={14} strokeWidth={1.5} />} aria-label="Remove" onClick={() => deleteSettlement(x.id)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <CardContent className="pb-6 text-sm text-foreground-lighter">Nothing settled yet.</CardContent>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Approved amount</CardTitle>
            <CardDescription>If the brand agreed to less (or more) than claimed. Empty = the claim total.</CardDescription>
          </CardHeader>
          <CardContent>
            <NumberInput prefix="₹" allowEmpty value={c.approvedAmount} placeholder={inr(c.total)} onChange={(v) => setApproved(c.id, v)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Add a settlement entry</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField label="How">
              <Select value={e.kind} onValueChange={(v) => set({ kind: v as SettlementEntry["kind"] })}>
                <SelectTrigger size="small"><SelectValue /></SelectTrigger>
                <SelectContent>{SETTLE_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Date" htmlFor="st-date"><Input id="st-date" type="date" value={e.date} onChange={(x) => set({ date: x.target.value })} /></FormField>
              <FormField label="Amount" htmlFor="st-amt"><NumberInput id="st-amt" prefix="₹" value={e.amount} onChange={(v) => set({ amount: v ?? 0 })} /></FormField>
            </div>
            <FormField label="Reference" htmlFor="st-ref"><Input id="st-ref" value={e.reference} onChange={(x) => set({ reference: x.target.value })} placeholder="JV / UTR / debit note no." /></FormField>
            <FormField label="Remarks" htmlFor="st-rem"><Textarea id="st-rem" rows={2} value={e.remarks} onChange={(x) => set({ remarks: x.target.value })} /></FormField>
            <Button variant="primary" size="small" disabled={!e.amount} onClick={() => {
              addSettlement({ ...e, createdAt: new Date().toISOString() });
              setE({ ...blank(), amount: +Math.max(0, s.pending - e.amount).toFixed(2) });
              toast.success("Settlement entry added");
            }}>
              Add entry
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DisputeDialog({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <AlertDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setReason(""); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark this claim disputed?</AlertDialogTitle>
          <AlertDialogDescription>It stops moving along on its own until you clear the dispute. The reason goes in the audit log.</AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason — e.g. brand rejected 12 lines as out of scheme period" />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!reason.trim()} onClick={() => onSave(reason.trim())}>Mark disputed</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
