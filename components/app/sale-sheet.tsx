"use client";

import { useState } from "react";
import { toast } from "sonner";
import { blankLine, calcRow, uid, type Settings } from "@/lib/calc";
import { useStore, type Sale } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Breakdown } from "./breakdown";
import { SaleFields, type Suggestions } from "./sale-form";

export function SaleSheet({
  open, onOpenChange, sale, brandId, settings, last, suggest,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sale: Sale | null;
  brandId: string;
  settings: Settings;
  last?: Sale;
  suggest?: Suggestions;
}) {
  const { saveSale } = useStore();
  const fresh = (): Sale => ({ ...blankLine(last), brandId, claimId: null });
  const [s, setS] = useState<Sale>(() => sale ?? fresh());
  const [seen, setSeen] = useState({ open, sale });
  if (seen.open !== open || seen.sale !== sale) {
    setSeen({ open, sale });
    if (open) setS(sale ?? fresh());
  }
  const locked = !!s.claimId;
  const row = calcRow(s, settings);

  const save = (again: boolean) => {
    saveSale(s);
    toast.success(sale ? "Sale updated" : "Sale added");
    if (again) setS({ ...fresh(), id: uid(), date: s.date, type: s.type, disc: s.disc });
    else onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="xl" className="flex w-full flex-col gap-0 p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{sale ? "Edit sale" : "New sale"}</SheetTitle>
          <SheetDescription>
            {locked ? "This sale is in a claim and can't be changed. Delete the claim to edit it." : "The working on the right updates as you type."}
          </SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 gap-6 overflow-y-auto p-6 md:grid-cols-[1fr_380px]">
          <fieldset disabled={locked} className="min-w-0">
            <SaleFields line={s} set={(p) => setS((x) => ({ ...x, ...p }))} settings={settings} suggest={suggest} />
          </fieldset>
          <Breakdown row={row} className="self-start" />
        </div>
        <SheetFooter className="border-t px-6 py-3 flex-row justify-end gap-2">
          <Button variant="default" onClick={() => onOpenChange(false)}>{locked ? "Close" : "Cancel"}</Button>
          {!locked && !sale ? <Button variant="default" disabled={!s.mrp} onClick={() => save(true)}>Save &amp; add another</Button> : null}
          {!locked ? <Button variant="primary" disabled={!s.mrp} onClick={() => save(false)}>{sale ? "Save changes" : "Save sale"}</Button> : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
