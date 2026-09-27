import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Class-name helpers the vendored Supabase components (src/components/ui) are
 * written against. Supabase's own `cn` is tailwind-merge with the `card` and
 * `content` spacing tokens registered, so `p-card` and `px-content` merge like
 * any other spacing utility — reproduced here with clsx + tailwind-merge.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ["card", "content"],
    },
  },
});

export type { ClassValue };

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Explicit tabIndex for keyboard focus (Safari skips buttons otherwise).
 * An explicit `tabIndex` wins; a disabled control defaults to -1, anything
 * else to 0.
 */
export function getExplicitTabIndex(tabIndex: number | undefined, disabled?: boolean | null): number {
  return tabIndex !== undefined ? tabIndex : disabled ? -1 : 0;
}
