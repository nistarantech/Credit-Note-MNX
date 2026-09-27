"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyStatePresentational } from "@/components/ui-patterns/empty-state";

/** Shown by brand-scoped screens when no brand is selected. */
export function NoBrand() {
  return (
    <Card className="py-16">
      <EmptyStatePresentational icon={Building2} title="Select a brand first" description="Pick one from the switcher at the top, or add a new brand.">
        <Button variant="primary" asChild>
          <Link href="/brands/">Go to brands</Link>
        </Button>
      </EmptyStatePresentational>
    </Card>
  );
}
