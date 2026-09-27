"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileText, Plus, Printer, Undo2 } from "lucide-react";
import { inr, summarize } from "@/lib/calc";
import { calcSettings, useStore, type CreditNote } from "@/lib/store";
import { partyStats } from "@/lib/stats";
import { printPage } from "@/lib/print";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Admonition } from "@/components/ui-patterns/admonition";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";
import { CreditNoteDoc } from "@/components/app/credit-note-doc";
import { Figure, FormField, fmtDate, today } from "@/components/app/fields";
import { NoParty } from "@/components/app/no-party";
import { Page } from "@/components/app/page";

type Mode = { kind: "list" } | { kind: "new" } | { kind: "view"; id: string };

export default function CreditNotesPage() {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const router = useRouter();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new")) {
      setMode({ kind: "new" });
      router.replace("/credit-notes/");
    }
  }, [router]);

  if (mode.kind === "new") return <Compose onDone={(id) => setMode(id ? { kind: "view", id } : { kind: "list" })} />;
  if (mode.kind === "view") return <View id={mode.id} onBack={() => setMode({ kind: "list" })} />;
  return <List onNew={() => setMode({ kind: "new" })} onOpen={(id) => setMode({ kind: "view", id })} />;
}

function List({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const { data, party } = useStore();
  const [scope, setScope] = useState<"party" | "all">("party");
  const notes = data.notes.filter((n) => scope === "all" || n.partyId === party?.id);
  const total = notes.reduce((a, n) => a + n.total, 0);

  return (
    <Page
      title="Credit notes"
      description="Credit notes issued to parties. Issuing one settles the open sales it covers."
      actions={<Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} disabled={!party} onClick={onNew}>New credit note</Button>}
    >
      <Card>
        <div className="flex items-center gap-3 border-b px-(--card-padding-x) py-3">
          <div className="flex gap-1 rounded-md bg-surface-200 p-1">
            <Button variant={scope === "party" ? "default" : "text"} size="tiny" onClick={() => setScope("party")} disabled={!party}>
              {party ? party.name : "Selected party"}
            </Button>
            <Button variant={scope === "all" ? "default" : "text"} size="tiny" onClick={() => setScope("all")}>All parties</Button>
          </div>
          <span className="ml-auto text-xs text-foreground-lighter">{notes.length} notes · ₹ {inr(total)}</span>
        </div>
        {notes.length === 0 ? (
          <div className="py-16">
            <EmptyStatePresentational icon={FileText} title="No credit notes issued" description="Create one from the open sales of a party.">
              {party ? <Button variant="primary" onClick={onNew}>New credit note</Button> : null}
            </EmptyStatePresentational>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notes.map((n) => (
                <TableRow key={n.id} className="cursor-pointer" onClick={() => onOpen(n.id)}>
                  <TableCell className="font-mono text-xs text-foreground">{n.number}</TableCell>
                  <TableCell className="text-foreground-light">{fmtDate(n.date)}</TableCell>
                  <TableCell>{n.party.name}</TableCell>
                  <TableCell className="text-foreground-light whitespace-nowrap">{fmtDate(n.from)} – {fmtDate(n.to)}</TableCell>
                  <TableCell className="text-right tabular-nums">{n.lines.length}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">₹ {inr(n.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </Page>
  );
}

function Compose({ onDone }: { onDone: (id: string | null) => void }) {
  const { data, party, issueNote } = useStore();
  const stats = party ? partyStats(data, party) : null;
  const dates = stats?.open.map((s) => s.date).sort() ?? [];
  const [from, setFrom] = useState(dates[0] ?? today());
  const [to, setTo] = useState(dates[dates.length - 1] ?? today());
  const [date, setDate] = useState(today());
  const [remarks, setRemarks] = useState("");

  if (!party || !stats) return <Page title="New credit note"><NoParty /></Page>;

  const settings = calcSettings(data.globals, party);
  const included = stats.open.filter((s) => s.date >= from && s.date <= to);
  const sum = summarize(included, settings);
  const number = `${data.globals.notePrefix}${String(data.globals.nextNoteNo).padStart(4, "0")}`;

  const issue = () => {
    const id = issueNote(
      { date, from, to, remarks, partyId: party.id, party, settings, lines: included.map(({ partyId: _p, noteId: _n, ...l }) => l), total: sum.totalCn },
      included.map((s) => s.id),
    );
    toast.success(`Credit note ${number} issued for ₹ ${inr(sum.totalCn)}`);
    onDone(id);
  };

  return (
    <Page
      title="New credit note"
      description={`From the open sales of ${party.name}.`}
      size="large"
      actions={<Button variant="default" icon={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => onDone(null)}>Back</Button>}
    >
      <div className="grid gap-6 lg:grid-cols-[340px_1fr] items-start">
        <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>Sales dated inside the period are settled by this note.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FormField label="Number"><Input value={number} readOnly className="font-mono" /></FormField>
              <FormField label="Credit note date" htmlFor="n-date"><Input id="n-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Sales from" htmlFor="n-from"><Input id="n-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></FormField>
                <FormField label="Sales to" htmlFor="n-to"><Input id="n-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></FormField>
              </div>
              <FormField label="Remarks" htmlFor="n-rem"><Textarea id="n-rem" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></FormField>
            </CardContent>
            <CardContent>
              <dl className="divide-y">
                <Figure label="Sales included" value={`${included.length} of ${stats.open.length}`} />
                <Figure label="Pieces" value={inr(sum.all.qty, 0)} />
                <Figure label="Credit note amount" value={`₹ ${inr(sum.totalCn)}`} emphasis />
              </dl>
            </CardContent>
            <CardContent>
              <Button variant="primary" size="small" block disabled={!included.length} onClick={issue}>Issue credit note</Button>
            </CardContent>
          </Card>
          {!stats.open.length ? <Admonition type="warning" title="No open sales" description="Every sale of this party is already settled. Add or import sales first." /> : null}
        </div>
        <div className="min-w-0 overflow-x-auto">
        <CreditNoteDoc
          draft
          company={data.globals.company}
          number={number}
          date={date}
          from={from}
          to={to}
          remarks={remarks}
          party={party}
          settings={settings}
          lines={included}
        />
        </div>
      </div>
    </Page>
  );
}

function View({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, cancelNote } = useStore();
  const [confirm, setConfirm] = useState(false);
  const n: CreditNote | undefined = data.notes.find((x) => x.id === id);
  if (!n) return <Page title="Credit note"><Button variant="default" onClick={onBack}>Back</Button></Page>;

  const save = async () => {
    const path = await printPage(`${n.number.replace(/[\\/]/g, "-")} ${n.party.name}.pdf`);
    if (path) toast.success("PDF saved", { description: path });
  };

  return (
    <Page
      title={n.number}
      description={`${n.party.name} · ₹ ${inr(n.total)}`}
      actions={
        <>
          <Button variant="default" icon={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={onBack}>All notes</Button>
          <Button variant="default" icon={<Undo2 size={14} strokeWidth={1.5} />} onClick={() => setConfirm(true)}>Cancel note</Button>
          <Button variant="primary" icon={<Printer size={14} strokeWidth={1.5} />} onClick={save}>{typeof window !== "undefined" && window.desktop ? "Save PDF" : "Print / PDF"}</Button>
        </>
      }
    >
      <CreditNoteDoc
        company={data.globals.company}
        number={n.number}
        date={n.date}
        from={n.from}
        to={n.to}
        remarks={n.remarks}
        party={n.party}
        settings={n.settings}
        lines={n.lines}
      />
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {n.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The note is removed and its {n.lines.length} sales become open again, ready for a new credit note.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep note</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => { cancelNote(n.id); toast.success(`${n.number} cancelled`); onBack(); }}>Cancel note</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
