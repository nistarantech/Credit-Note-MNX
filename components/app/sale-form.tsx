"use client";

import { calcRow, inr, marginFor, type Line, type Settings } from "@/lib/calc";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FormField, NumberInput } from "./fields";

/** The inputs of one sale. Used by the quick calculator and the sale sheet. */
export function SaleFields({
  line, set, settings, showRefs = true,
}: { line: Line; set: (patch: Partial<Line>) => void; settings: Settings; showRefs?: boolean }) {
  const row = calcRow(line, settings);
  const autoWsp = line.mrp * settings.wspFactor;
  return (
    <div className="flex flex-col gap-6">
      <FormField label="Sale type" hint={`${line.type === "DISC" ? "End-of-season sale" : "Regular sale"} — your margin ${+(marginFor(line.type, line.disc, settings) * 100).toFixed(2)}% on this brand's terms`}>
        <ToggleGroup
          type="single"
          value={line.type}
          onValueChange={(v) => v && set({ type: v as Line["type"], disc: v === "FRESH" && line.disc === 0.5 ? 0 : line.disc })}
          className="justify-start gap-1 rounded-md bg-surface-200 p-1 w-fit"
        >
          <ToggleGroupItem value="DISC" size="sm">EOSS / discount</ToggleGroupItem>
          <ToggleGroupItem value="FRESH" size="sm">Fresh</ToggleGroupItem>
        </ToggleGroup>
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Bill date" htmlFor="f-date" hint="Decides the GST slab">
          <Input id="f-date" type="date" value={line.date} onChange={(e) => set({ date: e.target.value })} />
        </FormField>
        {showRefs ? (
          <FormField label="Bill no." htmlFor="f-bill">
            <Input id="f-bill" value={line.billNo} onChange={(e) => set({ billNo: e.target.value })} placeholder="5284" />
          </FormField>
        ) : <div />}
        <FormField label="MRP per piece" htmlFor="f-mrp">
          <NumberInput id="f-mrp" prefix="₹" value={line.mrp} onChange={(v) => set({ mrp: v ?? 0 })} />
        </FormField>
        <FormField label="Quantity" htmlFor="f-qty" hint="Negative for a return">
          <NumberInput id="f-qty" value={line.qty} onChange={(v) => set({ qty: v ?? 0 })} />
        </FormField>
        <FormField label="Discount given" htmlFor="f-disc" hint={`Sale value ₹ ${inr(row.realization)}`}>
          <NumberInput id="f-disc" percent value={line.disc} onChange={(v) => set({ disc: v ?? 0 })} />
        </FormField>
        <FormField label="Purchase rate (WSP) per piece" htmlFor="f-wsp" hint={line.wsp === null ? `Auto: MRP × ${settings.wspFactor}` : "From the brand's invoice"}>
          <NumberInput id="f-wsp" prefix="₹" allowEmpty value={line.wsp} placeholder={inr(autoWsp)} onChange={(v) => set({ wsp: v })} />
        </FormField>
      </div>

      {showRefs ? (
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Barcode / article" htmlFor="f-barcode">
            <Input id="f-barcode" value={line.barcode} onChange={(e) => set({ barcode: e.target.value })} />
          </FormField>
          <FormField label="Department" htmlFor="f-dept">
            <Input id="f-dept" value={line.department} onChange={(e) => set({ department: e.target.value })} placeholder="Shirt" />
          </FormField>
          <FormField label="Division" htmlFor="f-div">
            <Input id="f-div" value={line.division} onChange={(e) => set({ division: e.target.value })} placeholder="Mens" />
          </FormField>
          <FormField label="Season (ageing)" htmlFor="f-age">
            <Input id="f-age" value={line.ageing} onChange={(e) => set({ ageing: e.target.value })} placeholder="AW25" />
          </FormField>
        </div>
      ) : null}
    </div>
  );
}
