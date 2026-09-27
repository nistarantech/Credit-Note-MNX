"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";

/** Label + control + optional hint, stacked. */
export function FormField({
  label, hint, htmlFor, className, children,
}: { label: string; hint?: React.ReactNode; htmlFor?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor} className="text-foreground-light">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-foreground-lighter">{hint}</p> : null}
    </div>
  );
}

/**
 * Numeric input that keeps what the user is typing ("12.", "") while it has
 * focus and reports parsed numbers. `percent` shows 0.2 as 20.
 */
export function NumberInput({
  id, value, onChange, percent, prefix, suffix, placeholder, allowEmpty, className, autoFocus,
}: {
  id?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  percent?: boolean;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  className?: string;
  autoFocus?: boolean;
}) {
  const shown = value === null ? "" : String(+(percent ? value * 100 : value).toFixed(percent ? 4 : 6));
  const [text, setText] = useState(shown);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(shown);
  }, [shown, focus]);

  const props = {
    id,
    inputMode: "decimal" as const,
    autoFocus,
    value: focus ? text : shown,
    placeholder,
    className: "text-right tabular-nums",
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      setFocus(true);
      setText(shown);
      e.target.select();
    },
    onBlur: () => setFocus(false),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const t = e.target.value;
      setText(t);
      const clean = t.replace(/[,₹%\s]/g, "");
      if (clean === "" || clean === "-") return onChange(allowEmpty ? null : 0);
      const n = parseFloat(clean);
      if (!isNaN(n)) onChange(percent ? n / 100 : n);
    },
  };

  const end = suffix ?? (percent ? "%" : undefined);
  if (!prefix && !end) return <Input {...props} className={cn(props.className, className)} />;
  return (
    <InputGroup className={className}>
      {prefix ? (
        <InputGroupAddon>
          <InputGroupText>{prefix}</InputGroupText>
        </InputGroupAddon>
      ) : null}
      <InputGroupInput {...props} />
      {end ? (
        <InputGroupAddon align="inline-end">
          <InputGroupText>{end}</InputGroupText>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}

/** A labelled amount in a definition list: label left, figure right. */
export function Figure({
  label, value, emphasis, muted, className,
}: { label: React.ReactNode; value: React.ReactNode; emphasis?: boolean; muted?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2", className)}>
      <dt className={cn("text-sm", muted ? "text-foreground-lighter" : "text-foreground-light", emphasis && "text-foreground font-medium")}>{label}</dt>
      <dd className={cn("tabular-nums text-sm", emphasis ? "text-foreground font-medium" : "text-foreground")}>{value}</dd>
    </div>
  );
}

export const today = () => new Date().toISOString().slice(0, 10);

/** yyyy-mm-dd shifted by whole days. */
export function shiftDay(d: string, days: number) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + days)).toISOString().slice(0, 10);
}
export const dayBefore = (d: string) => shiftDay(d, -1);
export const dayAfter = (d: string) => shiftDay(d, 1);

export function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
