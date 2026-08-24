import type { ApiClient } from "@kabehub/shared";
import { externalBrowser } from "../externalBrowser";

const CALLBACK_ORIGIN = "https://www.kabehub.com";
const CALLBACK_PATH = "/mobile/auth/github/callback";

export async function startGithubConnect(apiClient: ApiClient): Promise<void> {
  const response = await apiClient.request("/api/auth/github", {
    method: "GET",
  });
  if (!response.ok) throw new Error("Failed to start GitHub OAuth");

  const { url } = (await response.json()) as { url?: unknown };
  if (typeof url !== "string") {
    throw new Error("Failed to start GitHub OAuth");
  }

  await externalBrowser.open(url);
}

export function parseGithubCallbackUrl(
  rawUrl: string,
): "connected" | "error" | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.origin !== CALLBACK_ORIGIN || url.pathname !== CALLBACK_PATH) {
    return null;
  }

  // status はOAuth処理終了の通知にすぎない。連携状態の正本は
  // GET /api/auth/github/status であり、UI側で必ず再取得して確定する。
  const status = url.searchParams.get("status");
  return status === "connected" || status === "error" ? status : null;
}
