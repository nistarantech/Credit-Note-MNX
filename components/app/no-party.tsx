"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";

/** Shown by party-scoped screens when no party is selected. */
export function NoParty() {
  return (
    <Card className="py-16">
      <EmptyStatePresentational icon={Building2} title="Select a party first" description="Pick one from the switcher at the top, or add a new party.">
        <Button variant="primary" asChild>
          <Link href="/parties/">Go to parties</Link>
        </Button>
      </EmptyStatePresentational>
    </Card>
  );
}
