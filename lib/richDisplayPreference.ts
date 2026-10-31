"use client";

import { useSyncExternalStore } from "react";

export const RICH_DISPLAY_STORAGE_KEY = "kabehub_rich_display";

const listeners = new Set<() => void>();
const notify = () => { listeners.forEach(listener => listener()); };

export function readRichDisplayPreference(storage?: Pick<Storage, "getItem">): boolean {
  try {
    const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    return target?.getItem(RICH_DISPLAY_STORAGE_KEY) !== "0";
  } catch { return true; }
}

export function writeRichDisplayPreference(value: boolean, storage?: Pick<Storage, "setItem" | "removeItem">): void {
  try {
    const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    if (!target) return;
    if (value) target.removeItem(RICH_DISPLAY_STORAGE_KEY);
    else target.setItem(RICH_DISPLAY_STORAGE_KEY, "0");
    notify();
  } catch { /* Unavailable storage keeps the default preference. */ }
}

function onStorage(event: StorageEvent) {
  if (event.key === RICH_DISPLAY_STORAGE_KEY || event.key === null) notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = () => true;
export function useRichDisplayPreference(): [boolean, (value: boolean) => void] {
  return [useSyncExternalStore(subscribe, readRichDisplayPreference, getServerSnapshot), writeRichDisplayPreference];
}

export function resolveRichDisplay(input: { preference: boolean; roleplay?: boolean }): boolean {
  return input.preference === true && !input.roleplay;
}
