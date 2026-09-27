"use client";

import { Plus, Trash2 } from "lucide-react";
import { DEFAULT_GST_SLABS, GST_RATES, inr, type GstSlab } from "@/lib/calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NumberInput, dayBefore, fmtDate } from "./fields";

const pc = (r: number) => `${+(r * 100).toFixed(2)}%`;

/** A GST rate, chosen from the notified rates (plus the current value if it is something else). */
export function RateSelect({
  value, onChange, size = "small", className, allowAuto, autoLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  size?: "tiny" | "small";
  className?: string;
  allowAuto?: boolean; // adds "As per rate history" (null)
  autoLabel?: string;
}) {
  const rates = value === null || GST_RATES.includes(value) ? GST_RATES : [...GST_RATES, value].sort((a, b) => a - b);
  return (
    <Select value={value === null ? "auto" : String(value)} onValueChange={(v) => onChange(v === "auto" ? null : Number(v))}>
      <SelectTrigger size={size} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowAuto ? <SelectItem value="auto">{autoLabel ?? "As per rate history"}</SelectItem> : null}
        {rates.map((r) => (
          <SelectItem key={r} value={String(r)}>{pc(r)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}


/** Plain-words period of each slab: "Until 21 Sep 2025", "22 Sep 2025 onwards". */
export function periodOf(slabs: GstSlab[], i: number) {
  const sorted = [...slabs].sort((a, b) => a.from.localeCompare(b.from));
  const s = slabs[i];
  const next = sorted.find((x) => x.from > s.from);
  const first = sorted[0] === s;
  if (first && next) return `Until ${fmtDate(dayBefore(next.from))}`;
  if (next) return `${fmtDate(s.from)} – ${fmtDate(dayBefore(next.from))}`;
  return first ? "All dates" : `${fmtDate(s.from)} onwards`;
}

export function describeSlab(s: GstSlab) {
  return `up to ₹ ${inr(s.threshold, 0)} / piece → ${pc(s.low)}, above → ${pc(s.high)}`;
}

/**
 * The rate history as an editable table — one row per period the government
 * set, newest last. A bill uses the row in force on its date.
 */
export function GstHistory({ slabs, onChange }: { slabs: GstSlab[]; onChange: (s: GstSlab[]) => void }) {
  const order = slabs.map((_, i) => i).sort((a, b) => slabs[a].from.localeCompare(slabs[b].from));
  const set = (i: number, patch: Partial<GstSlab>) => onChange(slabs.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const first = order[0];
  const hasGst2 = slabs.some((s) => s.from === DEFAULT_GST_SLABS[1].from);

  return (
    <div className="flex flex-col">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead>From</TableHead>
            <TableHead>Up to ₹ / piece</TableHead>
            <TableHead>Rate up to it</TableHead>
            <TableHead>Rate above it</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {order.map((i) => {
            const s = slabs[i];
            return (
              <TableRow key={i}>
                <TableCell className="whitespace-nowrap text-foreground-light">{periodOf(slabs, i)}</TableCell>
                <TableCell>
                  {i === first ? (
                    <span className="text-xs text-foreground-lighter">Start</span>
                  ) : (
                    <Input type="date" value={s.from} onChange={(e) => e.target.value && set(i, { from: e.target.value })} className="w-40" />
                  )}
                </TableCell>
                <TableCell><NumberInput prefix="₹" value={s.threshold} onChange={(v) => set(i, { threshold: v ?? 0 })} className="w-32" /></TableCell>
                <TableCell><RateSelect value={s.low} onChange={(v) => set(i, { low: v ?? 0 })} className="w-24" /></TableCell>
                <TableCell><RateSelect value={s.high} onChange={(v) => set(i, { high: v ?? 0 })} className="w-24" /></TableCell>
                <TableCell>
                  <Button
                    variant="text"
                    size="tiny"
                    className="h-7 w-7 px-0"
                    disabled={slabs.length < 2}
                    icon={<Trash2 size={14} strokeWidth={1.5} />}
                    aria-label="Remove period"
                    onClick={() => onChange(slabs.filter((_, j) => j !== i))}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex flex-wrap gap-2 px-(--card-padding-x) py-3">
        <Button
          variant="default"
          icon={<Plus size={14} strokeWidth={1.5} />}
          onClick={() => {
            const last = slabs[order[order.length - 1]];
            onChange([...slabs, { ...last, from: new Date().toISOString().slice(0, 10) }]);
          }}
        >
          New rate change
        </Button>
        {!hasGst2 ? (
          <Button variant="default" onClick={() => onChange([...slabs, DEFAULT_GST_SLABS[1]])}>
            Add GST 2.0 (22 Sep 2025: 5% up to ₹ 2,500, 18% above)
          </Button>
        ) : null}
      </div>
    </div>
  );
}
