"use client";

import { MetricCard, MetricCardContent, MetricCardHeader, MetricCardLabel, MetricCardValue } from "@/components/ui-patterns/metric-card";

/** One KPI tile. `strong` marks the figure the screen is about. */
export function Metric({ label, value, tooltip, strong }: { label: string; value: string; tooltip?: string; strong?: boolean }) {
  return (
    <MetricCard>
      <MetricCardHeader>
        <MetricCardLabel tooltip={tooltip}>{label}</MetricCardLabel>
      </MetricCardHeader>
      <MetricCardContent>
        <MetricCardValue className={strong ? "text-brand-600" : undefined}>{value}</MetricCardValue>
      </MetricCardContent>
    </MetricCard>
  );
}
