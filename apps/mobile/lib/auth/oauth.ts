import { externalBrowser } from "../externalBrowser";
import { supabase } from "../supabase/client";

const CALLBACK_ORIGIN = "https://www.kabehub.com";
const CALLBACK_PATH = "/mobile/auth/callback";

const completedCodes = new Set<string>();
const inFlightCodes = new Map<string, Promise<void>>();

function parseCallbackUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    if (url.origin !== CALLBACK_ORIGIN || url.pathname !== CALLBACK_PATH) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export async function startGoogleSignIn(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      skipBrowserRedirect: true,
      redirectTo: "https://www.kabehub.com/mobile/auth/callback",
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error("OAuth authorization URL was not returned");

  await externalBrowser.open(data.url);
}

export async function handleAuthCallbackUrl(rawUrl: string): Promise<void> {
  const url = parseCallbackUrl(rawUrl);
  if (!url) return;

  const error = url.searchParams.get("error");
  if (error) {
    console.error(
      "OAuth callback error:",
      error,
      url.searchParams.get("error_description")
    );
    return;
  }

  const code = url.searchParams.get("code");
  if (!code || completedCodes.has(code)) return;

  const existingExchange = inFlightCodes.get(code);
  if (existingExchange) {
    await existingExchange;
    return;
  }

  const exchangePromise = (async () => {
    try {
      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);
      if (!exchangeError) {
        completedCodes.add(code);
      } else {
        console.error("OAuth code exchange error:", exchangeError);
      }
    } finally {
      inFlightCodes.delete(code);
    }
  })();

  inFlightCodes.set(code, exchangePromise);
  await exchangePromise;
}
