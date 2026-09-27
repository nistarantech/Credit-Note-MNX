"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthLabel, shiftMonth } from "@/lib/month";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** ‹ [September 2025 ▾] › — steps a month at a time or jumps to one with sales. */
export function MonthPicker({ value, onChange, months }: { value: string; onChange: (m: string) => void; months: string[] }) {
  const options = [...new Set([value, ...months])].sort().reverse();
  return (
    <div className="flex items-center gap-1">
      <Button variant="default" size="tiny" className="h-[26px] w-[26px] px-0" icon={<ChevronLeft size={14} strokeWidth={1.5} />} aria-label="Previous month" onClick={() => onChange(shiftMonth(value, -1))} />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="tiny" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((m) => (
            <SelectItem key={m} value={m}>
              {monthLabel(m)}
              {!months.includes(m) ? <span className="ml-2 text-foreground-lighter">· no sales</span> : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="default" size="tiny" className="h-[26px] w-[26px] px-0" icon={<ChevronRight size={14} strokeWidth={1.5} />} aria-label="Next month" onClick={() => onChange(shiftMonth(value, 1))} />
    </div>
  );
}
