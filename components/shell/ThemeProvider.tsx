"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Light / dark / system theming the way Supabase Studio does it: next-themes
 * writes `light` or `dark` onto <html> before first paint, and the vendored
 * theme files (src/styles/supabase/theme-*.css) key off that class.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={200}>
        {children}
        <Toaster />
      </TooltipProvider>
    </NextThemesProvider>
  );
}

function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster position="top-right" theme={resolvedTheme === "dark" ? "dark" : "light"} />
  );
}
