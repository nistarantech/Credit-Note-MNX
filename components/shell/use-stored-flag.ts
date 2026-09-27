"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "cn:stored-flag";

/** Fallback for browsers that refuse localStorage (private mode, blocked site data). */
const memory = new Map<string, boolean>();

function read(key: string): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? (memory.get(key) ?? false) : stored === "1";
  } catch {
    return memory.get(key) ?? false;
  }
}

/**
 * A boolean remembered in localStorage (e.g. "product menu collapsed").
 * The server render and hydration always see `false`, then the stored value
 * takes over, so there is no hydration mismatch.
 */
export function useStoredFlag(key: string): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    (onChange) => {
      window.addEventListener(EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    () => read(key),
    () => false,
  );

  const set = useCallback(
    (next: boolean) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // the in-memory value above still applies for this page's lifetime
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, set];
}
