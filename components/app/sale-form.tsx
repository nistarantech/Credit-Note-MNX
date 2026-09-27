"use client";

import { calcRow, inr, marginFor, termsFor, type Line, type Settings } from "@/lib/calc";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, NumberInput, fmtDate } from "./fields";
import { RateSelect } from "./gst";
import { DISCOUNT_PRESETS, MarginSelect, PercentPicker } from "./margin-select";

export interface Suggestions {
  division: string[];
  department: string[];
  ageing: string[];
}

const pc = (n: number) => `${+(n * 100).toFixed(2)}%`;

/** The inputs of one sale. Used by the quick calculator and the sale sheet. */
export function SaleFields({
  line, set, settings, showRefs = true, suggest,
}: { line: Line; set: (patch: Partial<Line>) => void; settings: Settings; showRefs?: boolean; suggest?: Suggestions }) {
  const row = calcRow(line, settings);
  const terms = termsFor(line.date, settings);
  const autoWsp = line.mrp * terms.wspFactor;
  const brandMargin = marginFor(line.type, line.disc, terms);
  const historyRate = calcRow({ ...line, gstRateOverride: null }, settings).gstRate;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Sale type" htmlFor="f-type">
          <Select value={line.type} onValueChange={(v) => set({ type: v as Line["type"], disc: v === "FRESH" && line.disc === 0.5 ? 0 : line.disc })}>
            <SelectTrigger id="f-type" size="small"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DISC">EOSS / discount sale</SelectItem>
              <SelectItem value="FRESH">Fresh (full-price) sale</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Bill date" htmlFor="f-date">
          <Input id="f-date" type="date" value={line.date} onChange={(e) => set({ date: e.target.value })} />
        </FormField>
        <FormField label="MRP per piece" htmlFor="f-mrp">
          <NumberInput id="f-mrp" prefix="₹" value={line.mrp} onChange={(v) => set({ mrp: v ?? 0 })} />
        </FormField>
        <FormField label="Quantity" htmlFor="f-qty" hint="Negative for a return">
          <NumberInput id="f-qty" value={line.qty} onChange={(v) => set({ qty: v ?? 0 })} />
        </FormField>
        <FormField label="Discount given" htmlFor="f-disc" hint={`Sale value on the bill ₹ ${inr(row.realization)}`}>
          <PercentPicker id="f-disc" value={line.disc} onChange={(v) => set({ disc: v ?? 0 })} presets={DISCOUNT_PRESETS} />
        </FormField>
        <FormField label="Purchase rate (WSP) per piece" htmlFor="f-wsp" hint={line.wsp === null ? `Auto: MRP × ${terms.wspFactor}` : "From the brand's invoice"}>
          <NumberInput id="f-wsp" prefix="₹" allowEmpty value={line.wsp} placeholder={inr(autoWsp)} onChange={(v) => set({ wsp: v })} />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Flat discount (₹, whole line)" htmlFor="f-flat" hint="Taken off the bill, on top of the % discount">
          <NumberInput id="f-flat" prefix="₹" allowEmpty value={line.flatDisc ?? null} placeholder="0" onChange={(v) => set({ flatDisc: v || null })} />
        </FormField>
        <FormField label="Cashback to customer (₹, whole line)" htmlFor="f-cash" hint="Paid after billing — lowers what you keep, not the GST">
          <NumberInput id="f-cash" prefix="₹" allowEmpty value={line.cashback ?? null} placeholder="0" onChange={(v) => set({ cashback: v || null })} />
        </FormField>
      </div>

      <div className="flex flex-col gap-4 rounded-md border px-4 py-4">
        <div>
          <p className="text-sm text-foreground">Margin &amp; GST for this sale</p>
          <p className="text-xs text-foreground-lighter">Normally from the brand&apos;s terms and the GST rate history. Change them only for this sale.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Your margin" htmlFor="f-margin" hint={line.marginOverride == null ? (terms.from ? `Brand terms from ${fmtDate(terms.from)}` : "As agreed with the brand") : "Custom for this sale"}>
            <MarginSelect id="f-margin" value={line.marginOverride ?? null} onChange={(v) => set({ marginOverride: v })} brandMargin={brandMargin} />
          </FormField>
          <FormField label="GST in sale price" htmlFor="f-gst" hint={line.gstRateOverride == null ? "Picked by bill date and per-piece value" : "Fixed for this sale"}>
            <RateSelect
              value={line.gstRateOverride ?? null}
              onChange={(v) => set({ gstRateOverride: v })}
              allowAuto
              autoLabel={`As per rate history (${pc(historyRate)})`}
              className="w-full"
            />
          </FormField>
          <FormField
            label="Bought on (brand's invoice date)"
            htmlFor="f-bought"
            hint={
              line.gstB2B !== null
                ? `GST on the brand's bill is from the invoice: ₹ ${inr(line.gstB2B)} (${pc(row.wspValue ? line.gstB2B / row.wspValue : 0)})`
                : `GST on the brand's bill: ${pc(row.gstB2BRate)}, the rate on ${fmtDate(line.purchaseDate || line.date)}${line.purchaseDate ? "" : " (bill date — no invoice date)"}`
            }
          >
            <Input id="f-bought" type="date" value={line.purchaseDate ?? ""} onChange={(e) => set({ purchaseDate: e.target.value || null })} />
          </FormField>
        </div>
      </div>

      {showRefs ? (
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Bill no." htmlFor="f-bill">
            <Input id="f-bill" value={line.billNo} onChange={(e) => set({ billNo: e.target.value })} placeholder="5284" />
          </FormField>
          <FormField label="Barcode / article" htmlFor="f-barcode">
            <Input id="f-barcode" value={line.barcode} onChange={(e) => set({ barcode: e.target.value })} />
          </FormField>
          <Suggested id="f-div" label="Division" value={line.division} options={suggest?.division} onChange={(v) => set({ division: v })} placeholder="Mens" />
          <Suggested id="f-dept" label="Department" value={line.department} options={suggest?.department} onChange={(v) => set({ department: v })} placeholder="Shirt" />
          <Suggested id="f-age" label="Season (ageing)" value={line.ageing} options={suggest?.ageing} onChange={(v) => set({ ageing: v })} placeholder="AW25" />
        </div>
      ) : null}
    </div>
  );
}

/** A text field that drops down the values already used for this brand. */
function Suggested({
  id, label, value, options, onChange, placeholder,
}: { id: string; label: string; value: string; options?: string[]; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <FormField label={label} htmlFor={id}>
      <Input id={id} list={`${id}-list`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" />
      <datalist id={`${id}-list`}>
        {(options ?? []).map((o) => <option key={o} value={o} />)}
      </datalist>
    </FormField>
  );
}
