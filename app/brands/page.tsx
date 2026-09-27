"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, MoreHorizontal, Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";
import { inr, termsFor } from "@/lib/calc";
import { calcSettings, newBrand, useStore, type Brand } from "@/lib/store";
import { brandStats } from "@/lib/stats";
import { SAMPLE_BRAND, sampleLines } from "@/lib/sample";
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
import { fmtDate, today } from "@/components/app/fields";
import { Page } from "@/components/app/page";
import { BrandSheet } from "@/components/app/brand-sheet";

export default function PartiesPage() {
  const store = useStore();
  const { data, brand: current, selectBrand, deleteBrand, saveBrand, addSales, setGlobals } = store;
  const router = useRouter();
  const [editing, setEditing] = useState<Brand | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Brand | null>(null);

  // "New brand" from the header switcher lands here with ?new=1
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new")) {
      setEditing(null);
      setOpen(true);
      router.replace("/brands/");
    }
  }, [router]);

  const create = () => {
    setEditing(null);
    setOpen(true);
  };

  const loadSample = () => {
    const p = newBrand(data.globals, SAMPLE_BRAND);
    saveBrand(p);
    selectBrand(p.id);
    addSales(sampleLines().map((l) => ({ ...l, brandId: p.id, claimId: null })));
    // the retailer in the same sheet, so the sample claim has a letterhead
    if (!data.globals.business.name) setGlobals({ business: { ...data.globals.business, name: "MNX Family Store (Kawardha)" } });
  };

  return (
    <Page
      title="Brands"
      description="The brands you buy from and claim credit notes from, each with its own terms."
      actions={data.brands.length ? <Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} onClick={create}>New brand</Button> : null}
    >
      {data.brands.length === 0 ? (
        <Card className="py-16">
          <EmptyStatePresentational icon={Building2} title="No brands yet" description="Add a brand you buy from and the terms agreed with it, or load the sample brand from NIKHIL.xlsx.">
            <div className="flex gap-2">
              <Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} onClick={create}>New brand</Button>
              <Button variant="default" onClick={loadSample}>Load sample brand</Button>
            </div>
          </EmptyStatePresentational>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead className="text-right">Unclaimed sales</TableHead>
                <TableHead className="text-right">To claim</TableHead>
                <TableHead className="text-right">Claimed so far</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.brands.map((p) => {
                const s = brandStats(data, p);
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => { selectBrand(p.id); router.push("/sales/"); }}>
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
                      {(() => {
                        const t = termsFor(today(), calcSettings(data.globals, p));
                        const next = p.termChanges.filter((c) => c.from > today()).sort((a, b) => a.from.localeCompare(b.from))[0];
                        return (
                          <>
                            <div>EOSS {Math.round(t.discMargin * 100)}% · Fresh {Math.round(t.freshMargin * 100)}%</div>
                            <div className="text-xs text-foreground-lighter">
                              {t.marginSlabs.length ? `${t.marginSlabs.length} discount slabs · ` : ""}WSP × {t.wspFactor}
                              {p.dealName ? ` · ${p.dealName}` : ""}
                            </div>
                            {next ? <div className="text-xs text-warning-600">New terms from {fmtDate(next.from)}</div> : null}
                          </>
                        );
                      })()}
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
                            <Pencil size={14} strokeWidth={1.5} /> Edit brand
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" asChild>
                            <Link href="/sales/" onClick={() => selectBrand(p.id)}><ReceiptText size={14} strokeWidth={1.5} /> Open sales</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-destructive" onSelect={() => setConfirm(p)}>
                            <Trash2 size={14} strokeWidth={1.5} /> Delete brand
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

      <BrandSheet open={open} onOpenChange={setOpen} brand={editing} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your sales of this brand are deleted too. Claims already raised on it are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => confirm && deleteBrand(confirm.id)}>Delete brand</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
