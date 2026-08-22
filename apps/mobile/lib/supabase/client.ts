import { createClient } from "@supabase/supabase-js";

import { MOBILE_AUTH_STORAGE_KEY } from "../authConstants";
import { secureStorageAdapter } from "../secureStorage";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      flowType: "pkce",
      autoRefreshToken: true,
      persistSession: true,
      // Native deep links are handled explicitly instead of parsing a browser URL.
      detectSessionInUrl: false,
      storage: secureStorageAdapter,
      storageKey: MOBILE_AUTH_STORAGE_KEY,
    },
  }
);
