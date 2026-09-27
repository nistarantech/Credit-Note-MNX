"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, FolderOpen, MoreHorizontal, Undo2 } from "lucide-react";
import { inr } from "@/lib/calc";
import { monthLabel } from "@/lib/month";
import { calcSettings, useStore, type ImportRecord } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";
import { ImportDialog } from "@/components/app/import-dialog";
import { Page } from "@/components/app/page";

export default function ImportsPage() {
  const { data, brand, deleteImport } = useStore();
  const [scope, setScope] = useState(brand ? "brand" : "all");
  const [importing, setImporting] = useState(false);
  const [undo, setUndo] = useState<ImportRecord | null>(null);
  const files = typeof window !== "undefined" ? window.desktop?.files : undefined;

  const list = data.imports.filter((i) => scope === "all" || i.brandId === brand?.id);
  const months = [...new Set(list.map((i) => i.month))].sort().reverse();
  const brandName = (id: string) => data.brands.find((b) => b.id === id)?.name ?? "Deleted brand";
  const claimedIn = (i: ImportRecord) => data.sales.filter((s) => s.importId === i.id && s.claimId).length;

  return (
    <Page
      title="Imports"
      description="Every Excel file you have imported, filed by month and brand."
      size="large"
      actions={
        <Button variant="primary" icon={<FileSpreadsheet size={14} strokeWidth={1.5} />} disabled={!brand} onClick={() => setImporting(true)}>
          {brand ? `Import into ${brand.name}` : "Select a brand to import"}
        </Button>
      }
    >
      <div className="flex items-center gap-3">
        <ToggleGroup type="single" value={scope} onValueChange={(v) => v && setScope(v)} className="gap-1 rounded-md bg-surface-200 p-1">
          <ToggleGroupItem value="brand" size="tiny" disabled={!brand}>{brand ? brand.name : "Selected brand"}</ToggleGroupItem>
          <ToggleGroupItem value="all" size="tiny">All brands</ToggleGroupItem>
        </ToggleGroup>
        <span className="ml-auto text-xs text-foreground-lighter">{list.length} imports across {months.length} months</span>
      </div>

      {months.length === 0 ? (
        <Card className="py-16">
          <EmptyStatePresentational icon={FileSpreadsheet} title="Nothing imported yet" description="Import a brand's Excel sheet — its sales and invoices are split by month as they come in.">
            {brand ? <Button variant="primary" onClick={() => setImporting(true)}>Import Excel</Button> : null}
          </EmptyStatePresentational>
        </Card>
      ) : (
        months.map((m) => {
          const rows = list.filter((i) => i.month === m);
          const sales = data.sales.filter((s) => s.date.startsWith(m) && (scope === "all" || s.brandId === brand?.id));
          const pcs = sales.reduce((a, s) => a + s.qty, 0);
          return (
            <Card key={m}>
              <CardHeader>
                <CardTitle>{monthLabel(m)}</CardTitle>
                <CardDescription>
                  {sales.length.toLocaleString("en-IN")} sales · {inr(pcs, 0)} pieces from {new Set(rows.map((r) => r.brandId)).size} brand(s)
                </CardDescription>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead>Imported</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-foreground">{brandName(i.brandId)}</TableCell>
                      <TableCell>{i.kind === "sales" ? <Badge>Sales</Badge> : <Badge variant="success">Invoices</Badge>}</TableCell>
                      <TableCell>
                        <div className="truncate text-foreground-light">{i.fileName}</div>
                        <div className="text-xs text-foreground-lighter">{i.sheet}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{i.rowCount.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="whitespace-nowrap text-foreground-light">
                        {new Date(i.importedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="text" size="tiny" className="h-7 w-7 px-0" icon={<MoreHorizontal size={14} strokeWidth={1.5} />} aria-label="Actions" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem className="gap-2" disabled={!files || !i.storedPath} onSelect={() => i.storedPath && files?.show(i.storedPath)}>
                              <FolderOpen size={14} strokeWidth={1.5} /> Show original file
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="gap-2 text-destructive" onSelect={() => setUndo(i)}>
                              <Undo2 size={14} strokeWidth={1.5} /> Undo this import
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          );
        })
      )}

      {brand ? <ImportDialog open={importing} onOpenChange={setImporting} brand={brand} settings={calcSettings(data.globals, brand)} /> : null}

      <AlertDialog open={!!undo} onOpenChange={(o) => !o && setUndo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this import?</AlertDialogTitle>
            <AlertDialogDescription>
              {undo ? (
                <>
                  The {undo.rowCount} {undo.kind === "sales" ? "sales" : "invoice lines"} for {brandName(undo.brandId)}, {monthLabel(undo.month)} from {undo.fileName} are removed.
                  {claimedIn(undo) ? ` ${claimedIn(undo)} of them are already in a claim and are kept.` : ""}
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => { if (undo) { deleteImport(undo.id); toast.success("Import undone"); } }}>Undo import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
