export const LS_ENTER_MODE = "kabehub_enter_mode" as const;

export type EnterMode = "send" | "newline";

export function loadEnterMode(): EnterMode {
  if (typeof window === "undefined") return "send";
  return localStorage.getItem(LS_ENTER_MODE) === "newline" ? "newline" : "send";
}

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}
