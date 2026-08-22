import type { AccessTokenProvider } from "@kabehub/shared";

import { supabase } from "./supabase/client";

export const mobileAccessTokenProvider: AccessTokenProvider = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session.access_token;
};
