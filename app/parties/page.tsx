"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, MoreHorizontal, Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";
import { inr } from "@/lib/calc";
import { newParty, useStore, type Party } from "@/lib/store";
import { partyStats } from "@/lib/stats";
import { SAMPLE_PARTY, sampleLines } from "@/lib/sample";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";
import { Page } from "@/components/app/page";
import { PartySheet } from "@/components/app/party-sheet";

export default function PartiesPage() {
  const store = useStore();
  const { data, party: current, selectParty, deleteParty, saveParty, addSales } = store;
  const router = useRouter();
  const [editing, setEditing] = useState<Party | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Party | null>(null);

  // "New party" from the header switcher lands here with ?new=1
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new")) {
      setEditing(null);
      setOpen(true);
      router.replace("/parties/");
    }
  }, [router]);

  const create = () => {
    setEditing(null);
    setOpen(true);
  };

  const loadSample = () => {
    const p = newParty(data.globals, SAMPLE_PARTY);
    saveParty(p);
    selectParty(p.id);
    addSales(sampleLines().map((l) => ({ ...l, partyId: p.id, noteId: null })));
  };

  return (
    <Page
      title="Parties"
      description="Retailers you settle credit notes with, and the deal agreed with each."
      actions={data.parties.length ? <Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} onClick={create}>New party</Button> : null}
    >
      {data.parties.length === 0 ? (
        <Card className="py-16">
          <EmptyStatePresentational icon={Building2} title="No parties yet" description="Add the retailer you want to work out credit notes for, or load the sample party from NIKHIL.xlsx.">
            <div className="flex gap-2">
              <Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} onClick={create}>New party</Button>
              <Button variant="default" onClick={loadSample}>Load sample party</Button>
            </div>
          </EmptyStatePresentational>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead className="text-right">Open sales</TableHead>
                <TableHead className="text-right">Credit due</TableHead>
                <TableHead className="text-right">Issued so far</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.parties.map((p) => {
                const s = partyStats(data, p);
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => { selectParty(p.id); router.push("/sales/"); }}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{p.name}</span>
                        {p.id === current?.id ? <Badge>Selected</Badge> : null}
                        {!p.active ? <Badge variant="warning">Inactive</Badge> : null}
                      </div>
                      <div className="text-xs text-foreground-lighter">
                        {[p.code, p.season, p.conditions].filter(Boolean).join(" · ")}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground-light">{p.gstNo || "—"}</TableCell>
                    <TableCell className="text-foreground-light tabular-nums">
                      <div>EOSS {Math.round(p.discMargin * 100)}% · Fresh {Math.round(p.freshMargin * 100)}%</div>
                      <div className="text-xs text-foreground-lighter">
                        {p.marginSlabs.length ? `${p.marginSlabs.length} discount slabs · ` : ""}WSP × {p.wspFactor}
                        {p.dealName ? ` · ${p.dealName}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.open.length}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">₹ {inr(s.pending.totalCn)}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground-light">₹ {inr(s.issued)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="text" size="tiny" className="h-7 w-7 px-0" icon={<MoreHorizontal size={14} strokeWidth={1.5} />} aria-label="Actions" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem className="gap-2" onSelect={() => { setEditing(p); setOpen(true); }}>
                            <Pencil size={14} strokeWidth={1.5} /> Edit party
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" asChild>
                            <Link href="/sales/" onClick={() => selectParty(p.id)}><ReceiptText size={14} strokeWidth={1.5} /> Open sales</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-destructive" onSelect={() => setConfirm(p)}>
                            <Trash2 size={14} strokeWidth={1.5} /> Delete party
                          </DropdownMenuItem>
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

      <PartySheet open={open} onOpenChange={setOpen} party={editing} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its sales will be deleted too. Credit notes already issued to this party are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => confirm && deleteParty(confirm.id)}>Delete party</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
