"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, ReceiptIndianRupee, Trash2 } from "lucide-react";
import { inr } from "@/lib/calc";
import { useStore, type SupplierCn } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";
import { fmtDate } from "@/components/app/fields";
import { Metric } from "@/components/app/metric";
import { Page } from "@/components/app/page";
import { SupplierCnDialog } from "@/components/app/supplier-cn-dialog";

export default function SupplierCnsPage() {
  const { data, brand, deleteSupplierCn } = useStore();
  const [scope, setScope] = useState(brand ? "brand" : "all");
  const [show, setShow] = useState("all");
  const [open, setOpen] = useState<{ cn: SupplierCn | null } | null>(null);
  const list = data.supplierCns
    .filter((c) => scope === "all" || c.brandId === brand?.id)
    .filter((c) => show === "all" || (show === "unlinked" ? !c.claimId : c.disputed));
  const brandName = (id: string) => data.brands.find((b) => b.id === id)?.name ?? "Deleted brand";
  const claim = (id: string | null) => data.claims.find((c) => c.id === id);
  const total = list.filter((c) => !c.disputed).reduce((a, c) => a + c.gross, 0);

  return (
    <Page
      title="Supplier CNs"
      description="Every credit note brands have issued you — linked to the claim it answers, and checked line by line there."
      size="large"
      actions={<Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />} disabled={!data.brands.length} onClick={() => setOpen({ cn: null })}>Record a CN</Button>}
    >
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Metric label="Credit notes" value={String(list.length)} />
        <Metric label="Received" value={`₹ ${inr(total)}`} strong tooltip="Not counting disputed CNs" />
        <Metric label="Not linked to a claim" value={String(list.filter((c) => !c.claimId).length)} tooltip="Link them to check them against what you claimed" />
        <Metric label="Disputed" value={`₹ ${inr(list.filter((c) => c.disputed).reduce((a, c) => a + c.gross, 0))}`} />
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b px-(--card-padding-x) py-3">
          <ToggleGroup type="single" value={scope} onValueChange={(v) => v && setScope(v)} className="gap-1 rounded-md bg-surface-200 p-1">
            <ToggleGroupItem value="brand" size="tiny" disabled={!brand}>{brand ? brand.name : "Selected brand"}</ToggleGroupItem>
            <ToggleGroupItem value="all" size="tiny">All brands</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="single" value={show} onValueChange={(v) => v && setShow(v)} className="gap-1 rounded-md bg-surface-200 p-1">
            <ToggleGroupItem value="all" size="tiny">All</ToggleGroupItem>
            <ToggleGroupItem value="unlinked" size="tiny">Not linked</ToggleGroupItem>
            <ToggleGroupItem value="disputed" size="tiny">Disputed</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {list.length === 0 ? (
          <div className="py-16">
            <EmptyStatePresentational icon={ReceiptIndianRupee} title="No supplier credit notes" description="Record a brand's credit note — its total, or its lines from their Excel — and link it to your claim." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CN</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Against claim</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpen({ cn: c })}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-mono text-xs text-foreground">{c.number || "(no number)"} {c.disputed ? <Badge variant="destructive">Disputed</Badge> : null}</div>
                    <div className="text-xs text-foreground-lighter">{fmtDate(c.date)}{c.fileName ? ` · ${c.fileName}` : ""}</div>
                  </TableCell>
                  <TableCell>{brandName(c.brandId)}</TableCell>
                  <TableCell className="font-mono text-xs">{claim(c.claimId)?.number ?? <span className="font-sans text-foreground-lighter">Not linked</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.lines.length || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(c.basic)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(c.gst)}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">{inr(c.gross)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="text" size="tiny" className="h-7 w-7 px-0" icon={<MoreHorizontal size={14} strokeWidth={1.5} />} aria-label="Actions" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem className="gap-2" onSelect={() => setOpen({ cn: c })}><Pencil size={14} strokeWidth={1.5} /> Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 text-destructive" onSelect={() => { deleteSupplierCn(c.id); toast.success("Credit note deleted"); }}>
                          <Trash2 size={14} strokeWidth={1.5} /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <SupplierCnDialog open={!!open} onOpenChange={(o) => !o && setOpen(null)} cn={open?.cn ?? null} brandId={brand?.id} />
    </Page>
  );
}
