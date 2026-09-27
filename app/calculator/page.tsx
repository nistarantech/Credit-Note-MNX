"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { blankLine, calcRow, uid, type Line } from "@/lib/calc";
import { calcSettings, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Breakdown } from "@/components/app/breakdown";
import { FormField, NumberInput, today } from "@/components/app/fields";
import { Page } from "@/components/app/page";
import { SaleFields } from "@/components/app/sale-form";

const start = (): Line => ({ ...blankLine(), date: today(), mrp: 2199, qty: 1, disc: 0.5, type: "DISC" });

export default function CalculatorPage() {
  const { data, party, saveSale } = useStore();
  const base = calcSettings(data.globals, party);
  const [line, setLine] = useState<Line>(start);
  const [deal, setDeal] = useState({ freshMargin: base.freshMargin, discMargin: base.discMargin, wspFactor: base.wspFactor });
  const settings = { ...base, ...deal };
  const row = calcRow(line, settings);
  const set = (p: Partial<Line>) => setLine((l) => ({ ...l, ...p }));
  const dealChanged = party && (deal.freshMargin !== party.freshMargin || deal.discMargin !== party.discMargin || deal.wspFactor !== party.wspFactor);

  return (
    <Page
      title="Quick calculator"
      description="Enter one sale and see exactly how much credit note the party should get back."
      actions={
        <Button variant="default" icon={<RotateCcw size={14} strokeWidth={1.5} />} onClick={() => setLine(start())}>
          Reset
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_440px] items-start">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Sale</CardTitle>
              <CardDescription>What the party sold to the customer and what they paid the company.</CardDescription>
            </CardHeader>
            <CardContent>
              <SaleFields line={line} set={set} settings={settings} showRefs={false} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deal</CardTitle>
              <CardDescription>
                {party ? `Loaded from ${party.name}. Changes here only affect this calculation.` : "Default deal from Settings. Changes here only affect this calculation."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <FormField label="EOSS margin" htmlFor="d-disc">
                  <NumberInput id="d-disc" percent value={deal.discMargin} onChange={(v) => setDeal((d) => ({ ...d, discMargin: v ?? 0 }))} />
                </FormField>
                <FormField label="Fresh margin" htmlFor="d-fresh">
                  <NumberInput id="d-fresh" percent value={deal.freshMargin} onChange={(v) => setDeal((d) => ({ ...d, freshMargin: v ?? 0 }))} />
                </FormField>
                <FormField label="WSP factor" htmlFor="d-wsp" hint="WSP = MRP × factor">
                  <NumberInput id="d-wsp" value={deal.wspFactor} onChange={(v) => setDeal((d) => ({ ...d, wspFactor: v ?? 0 }))} />
                </FormField>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
          <Breakdown row={row} />
          <Button
            variant="primary"
            size="medium"
            block
            disabled={!party || !line.mrp}
            onClick={() => {
              if (!party) return;
              saveSale({ ...line, id: uid(), partyId: party.id, noteId: null });
              toast.success(`Added to ${party.name}'s sales`);
            }}
          >
            {party ? `Add to ${party.name}'s sales` : "Select a party to save this sale"}
          </Button>
          {dealChanged ? <p className="text-xs text-foreground-lighter text-center">Saved sales use the party&apos;s own deal, not the numbers above.</p> : null}
        </div>
      </div>
    </Page>
  );
}
