"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";
import {
  Building2, CalendarCheck, Calculator, Check, ChevronsUpDown, FileText, LayoutDashboard, Menu, Monitor, Moon,
  PanelLeftClose, PanelLeftOpen, Plus, ReceiptText, Settings, Sigma, Sun,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStoredFlag } from "./use-stored-flag";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/calculator/", label: "Quick calculator", icon: Calculator },
  { href: "/parties/", label: "Parties", icon: Building2 },
  { href: "/sales/", label: "Sales", icon: ReceiptText },
  { href: "/month-end/", label: "Month-end", icon: CalendarCheck },
  { href: "/credit-notes/", label: "Credit notes", icon: FileText },
  { href: "/settings/", label: "Settings", icon: Settings, divider: true },
  { href: "/formulas/", label: "How it's calculated", icon: Sigma },
];

function isActive(pathname: string, href: string) {
  const p = pathname.endsWith("/") ? pathname : pathname + "/";
  return href === "/" ? p === "/" : p.startsWith(href);
}

function Slash() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="1" fill="none" aria-hidden className="shrink-0 text-foreground-muted/60">
      <path d="M16 3.549L7.12 20.600" />
    </svg>
  );
}

/**
 * Studio-style chrome: a top bar (party switcher / screen) and one sidebar
 * that collapses to an icon rail. Screens render inside `.app-content`.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready } = useStore();
  const [collapsed, setCollapsed] = useStoredFlag("cn:sidebar-collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setMobileOpen(false);
  }
  const current = NAV.find((n) => isActive(pathname, n.href));

  return (
    <div className="app-shell" data-menu={collapsed ? "closed" : "open"}>
      <header className="app-chrome fixed inset-x-0 top-0 z-40 flex h-(--header-h) items-center gap-2 border-b bg-dash-sidebar pr-3 pl-2">
        <Button
          variant="text"
          size="tiny"
          className="h-8 w-8 px-0 text-foreground-light lg:hidden"
          icon={<Menu size={18} strokeWidth={1.5} />}
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        />
        <Link href="/" className="hidden lg:flex items-center gap-2 pl-2 pr-1 text-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-400 dark:bg-brand-500 border border-brand-500/75 dark:border-brand/30">
            <FileText size={13} strokeWidth={2} />
          </span>
          <span className="text-sm font-medium">Credit Note</span>
        </Link>
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          <span className="hidden lg:inline-flex"><Slash /></span>
          <PartySwitcher />
          <Slash />
          <span className="truncate text-foreground" aria-current="page">{current?.label ?? "Screen"}</span>
        </nav>
        <ThemeMenu />
      </header>

      <aside
        aria-label="Navigation"
        className={cn(
          "app-chrome fixed left-0 bottom-0 top-(--header-h) z-30 hidden lg:flex flex-col border-r bg-dash-sidebar",
          "transition-[width] duration-200 ease-out",
          collapsed ? "w-(--rail-w)" : "w-(--menu-w)",
        )}
      >
        <nav className="no-scrollbar flex-1 overflow-y-auto overflow-x-hidden p-2">
          <NavList pathname={pathname} collapsed={collapsed} />
        </nav>
        <div className={cn("flex shrink-0 border-t p-2", collapsed ? "justify-center" : "justify-end")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="text"
                size="tiny"
                className="h-8 w-8 px-0 text-foreground-lighter"
                icon={collapsed ? <PanelLeftOpen size={16} strokeWidth={1.5} /> : <PanelLeftClose size={16} strokeWidth={1.5} />}
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              />
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
          </Tooltip>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-2 bg-dash-sidebar">
          <SheetTitle className="px-3 py-2 text-sm">Credit Note</SheetTitle>
          <NavList pathname={pathname} collapsed={false} />
        </SheetContent>
      </Sheet>

      <main className="app-content">{ready ? children : null}</main>
    </div>
  );
}

function NavList({ pathname, collapsed }: { pathname: string; collapsed: boolean }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon, divider }) => {
        const active = isActive(pathname, href);
        const link = (
          <Link
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? label : undefined}
            className={cn(
              "flex h-9 items-center rounded-md text-sm transition-colors focus-ring",
              collapsed ? "justify-center" : "gap-3 px-3",
              active ? "bg-selection text-foreground" : "text-foreground-light hover:bg-surface-200 hover:text-foreground",
            )}
          >
            <Icon size={collapsed ? 18 : 16} strokeWidth={1.5} className={active ? "text-foreground" : "text-foreground-lighter"} />
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        );
        return (
          <li key={href}>
            {divider && <div className="mx-3 my-1.5 h-px bg-border" aria-hidden />}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PartySwitcher() {
  const { data, party, selectParty } = useStore();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-foreground-light transition-colors hover:bg-surface-200 hover:text-foreground focus-ring"
        >
          <Building2 size={14} strokeWidth={1.5} className="shrink-0 text-foreground-lighter" />
          <span className="max-w-[16rem] truncate">{party?.name || "Select party"}</span>
          <ChevronsUpDown size={12} strokeWidth={1.5} className="shrink-0 text-foreground-lighter" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Parties</DropdownMenuLabel>
        {data.parties.length === 0 && <div className="px-2 py-1.5 text-xs text-foreground-lighter">No parties yet</div>}
        {data.parties.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => selectParty(p.id)} className="gap-2">
            <span className="flex-1 truncate">{p.name || "Untitled party"}</span>
            {p.id === party?.id && <Check size={14} strokeWidth={1.5} />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/parties/?new=1")} className="gap-2">
          <Plus size={14} strokeWidth={1.5} /> New party
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="text"
          size="tiny"
          className="h-8 w-8 px-0 text-foreground-light"
          icon={<Sun size={16} strokeWidth={1.5} className="dark:hidden" />}
          aria-label="Theme"
        >
          <Moon size={16} strokeWidth={1.5} className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light"><Sun size={14} strokeWidth={1.5} className="mr-2" />Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon size={14} strokeWidth={1.5} className="mr-2" />Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor size={14} strokeWidth={1.5} className="mr-2" />System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
