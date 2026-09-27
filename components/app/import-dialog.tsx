"use client";

import { useState } from "react";
import { toast } from "sonner";
import { inr, parsePaste, summarize, type Settings } from "@/lib/calc";
import { useStore } from "@/lib/store";
import { Admonition } from "@/components/ui-patterns/admonition";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogSection, DialogSectionSeparator, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate } from "./fields";

export function ImportDialog({
  open, onOpenChange, partyId, partyName, settings,
}: { open: boolean; onOpenChange: (o: boolean) => void; partyId: string; partyName: string; settings: Settings }) {
  const { addSales } = useStore();
  const [text, setText] = useState("");
  const lines = text ? parsePaste(text, settings) : [];
  const sum = summarize(lines, settings);
  const dates = lines.map((l) => l.date).sort();

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setText(""); }}>
      <DialogContent size="xlarge">
        <DialogHeader>
          <DialogTitle>Import sales from Excel</DialogTitle>
          <DialogDescription>Copy the rows in Excel, including the header row, and paste them below.</DialogDescription>
        </DialogHeader>
        <DialogSectionSeparator />
        <DialogSection className="flex flex-col gap-4">
          <Textarea
            autoFocus
            rows={9}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste here (⌘V / Ctrl+V)"
            className="font-mono text-xs"
          />
          {text && !lines.length ? (
            <Admonition type="warning" title="No sales found" description="Make sure the header row is included and it has at least an Mrp column." />
          ) : null}
          {lines.length ? (
            <Admonition
              type="default"
              title={`${lines.length} sales ready to import into ${partyName}`}
              description={`${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])} · ${inr(sum.all.qty, 0)} pieces · sale value ₹ ${inr(sum.all.realization)} · credit ₹ ${inr(sum.totalCn)}`}
            />
          ) : (
            <p className="text-xs text-foreground-lighter">
              Recognised columns: Bill Date, Bill No., Barcode, Division, Department, Ageing, Disc %, Slab (DISC / FRESH), Mrp, Qty, WSP, GST (B-B).
              Other columns are ignored. Without a header row, the AW&apos;25EOSS column order is assumed.
            </p>
          )}
        </DialogSection>
        <DialogFooter>
          <Button variant="default" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!lines.length}
            onClick={() => {
              addSales(lines.map((l) => ({ ...l, partyId, noteId: null })));
              toast.success(`Imported ${lines.length} sales`);
              setText("");
              onOpenChange(false);
            }}
          >
            Import {lines.length || ""} sales
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
