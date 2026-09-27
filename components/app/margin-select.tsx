"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberInput } from "./fields";

export const MARGIN_PRESETS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];
export const DISCOUNT_PRESETS = [0, 0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7];
const pc = (n: number) => `${+(n * 100).toFixed(2)}%`;

/**
 * A percentage from a dropdown of presets, with "Custom…" for anything else.
 * With `autoLabel`, the first option is "no value" (null) — e.g. "Brand terms (20%)".
 */
export function PercentPicker({
  value, onChange, presets, autoLabel, autoValue, id, size = "small",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  presets: number[];
  autoLabel?: string;
  autoValue?: number; // what the auto option stands for; starts "Custom…" from here
  id?: string;
  size?: "tiny" | "small";
}) {
  const [typing, setTyping] = useState(false);
  const inList = value !== null && presets.some((p) => Math.abs(p - value) < 1e-9);
  const current = value === null && autoLabel ? "auto" : typing || !inList ? "custom" : String(value);

  return (
    <div className="flex gap-2">
      <Select
        value={current}
        onValueChange={(v) => {
          setTyping(v === "custom");
          if (v === "auto") onChange(null);
          else if (v === "custom") onChange(value ?? autoValue ?? 0);
          else onChange(Number(v));
        }}
      >
        <SelectTrigger id={id} size={size} className="min-w-0 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {autoLabel ? (
            <>
              <SelectItem value="auto">{autoLabel}</SelectItem>
              <SelectSeparator />
            </>
          ) : null}
          {presets.map((p) => (
            <SelectItem key={p} value={String(p)}>{pc(p)}</SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value="custom">Custom…</SelectItem>
        </SelectContent>
      </Select>
      {current === "custom" ? <NumberInput percent value={value} onChange={(v) => onChange(v ?? 0)} className="w-24" /> : null}
    </div>
  );
}

/** Margin for a sale: the brand's terms (null), or a custom margin. */
export function MarginSelect({
  value, onChange, brandMargin, id, size,
}: { value: number | null; onChange: (v: number | null) => void; brandMargin: number; id?: string; size?: "tiny" | "small" }) {
  return (
    <PercentPicker
      id={id}
      size={size}
      value={value}
      onChange={onChange}
      presets={MARGIN_PRESETS}
      autoLabel={`Brand terms (${pc(brandMargin)})`}
      autoValue={brandMargin}
    />
  );
}
