import type { Metadata } from "next";
import { Shell } from "@/components/shell/Shell";
import { ThemeProvider } from "@/components/shell/ThemeProvider";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "Credit Note",
  description: "EOSS credit note working — sale, margin, GST and credit note per party",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // next-themes sets the light/dark class on <html> before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body>
        <ThemeProvider>
          <StoreProvider>
            <Shell>{children}</Shell>
          </StoreProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
