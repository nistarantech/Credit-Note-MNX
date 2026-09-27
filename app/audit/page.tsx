"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { useStore, type AuditEntry } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";
import { Page } from "@/components/app/page";

const MODULES: { value: AuditEntry["module"] | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "claims", label: "Claims" },
  { value: "supplier_cns", label: "Supplier CNs" },
  { value: "settlements", label: "Settlement" },
  { value: "rules", label: "CN rules" },
  { value: "skus", label: "SKU prices" },
];

export default function AuditPage() {
  const { data } = useStore();
  const [m, setM] = useState<string>("all");
  const list = data.audit.filter((a) => m === "all" || a.module === m).slice(0, 500);

  return (
    <Page title="Audit log" description="Every commercially sensitive change — claim status, supplier CNs, settlement, CN rules and SKU prices — with when, what and why." size="large">
      <Card>
        <div className="flex items-center gap-3 border-b px-(--card-padding-x) py-3">
          <ToggleGroup type="single" value={m} onValueChange={(v) => v && setM(v)} className="gap-1 rounded-md bg-surface-200 p-1">
            {MODULES.map((x) => <ToggleGroupItem key={x.value} value={x.value} size="tiny">{x.label}</ToggleGroupItem>)}
          </ToggleGroup>
          <span className="ml-auto text-xs text-foreground-lighter">{list.length} entries</span>
        </div>
        {list.length === 0 ? (
          <div className="py-16"><EmptyStatePresentational icon={History} title="Nothing logged yet" description="Changes to claims, credit notes, rules and prices show up here." /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap text-xs text-foreground-light">
                    {new Date(a.at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell className="text-xs text-foreground-lighter">{MODULES.find((x) => x.value === a.module)?.label ?? a.module} · {a.action.replace("_", " ")}</TableCell>
                  <TableCell className="text-foreground">{a.detail}</TableCell>
                  <TableCell className="text-foreground-light">{a.reason || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </Page>
  );
}
