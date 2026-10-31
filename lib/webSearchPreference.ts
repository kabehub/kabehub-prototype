"use client";

import { useSyncExternalStore } from "react";
import { supportsWebSearch } from "@/lib/modelRegistry";

export const WEB_SEARCH_STORAGE_KEY = "kabehub_web_search";
export type WebSearchOptions = { webSearch?: boolean };

const listeners = new Set<() => void>();
const notify = () => { listeners.forEach(listener => listener()); };

export function readWebSearchPreference(storage?: Pick<Storage, "getItem">): boolean {
  try {
    const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    return target?.getItem(WEB_SEARCH_STORAGE_KEY) === "1";
  } catch { return false; }
}

export function writeWebSearchPreference(value: boolean, storage?: Pick<Storage, "setItem" | "removeItem">): void {
  try {
    const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    if (!target) return;
    if (value) target.setItem(WEB_SEARCH_STORAGE_KEY, "1");
    else target.removeItem(WEB_SEARCH_STORAGE_KEY);
    notify();
  } catch { /* Unavailable storage keeps the default preference. */ }
}

function onStorage(event: StorageEvent) {
  if (event.key === WEB_SEARCH_STORAGE_KEY || event.key === null) notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = () => false;
export function useWebSearchPreference(): [boolean, (value: boolean) => void] {
  return [useSyncExternalStore(subscribe, readWebSearchPreference, getServerSnapshot), writeWebSearchPreference];
}

export function resolveWebSearch(input: {
  preference: boolean;
  provider: string;
  modelId: string;
  roleplay?: boolean;
}): boolean {
  return input.preference && input.provider === "claude" && supportsWebSearch("claude", input.modelId) && !input.roleplay;
}
