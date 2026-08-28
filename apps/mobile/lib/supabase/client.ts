import { createClient } from "@supabase/supabase-js";

import { MOBILE_AUTH_STORAGE_KEY } from "../authConstants";
import { secureStorageAdapter } from "../secureStorage";

// Supabase Auth自身のisBrowser()判定（typeof window !== "undefined" && typeof document !== "undefined"）と
// 意味論を揃える。static exportのprerender（Node.js環境）ではfalseとなり、
// Secure Storage・web fallback・localStorageのいずれにも触れないパスへ分岐する。
const isBrowserRuntime =
  typeof window !== "undefined" && typeof document !== "undefined";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      flowType: "pkce",
      autoRefreshToken: isBrowserRuntime,
      persistSession: true,
      // Native deep links are handled explicitly instead of parsing a browser URL.
      detectSessionInUrl: false,
      ...(isBrowserRuntime ? { storage: secureStorageAdapter } : {}),
      storageKey: MOBILE_AUTH_STORAGE_KEY,
    },
  }
);
