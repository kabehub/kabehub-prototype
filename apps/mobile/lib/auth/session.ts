import { MOBILE_AUTH_STORAGE_KEY } from "../authConstants";
import { secureStorageAdapter } from "../secureStorage";
import { supabase } from "../supabase/client";

const FAIL_SAFE_AUTH_STORAGE_KEYS = [
  MOBILE_AUTH_STORAGE_KEY,
  `${MOBILE_AUTH_STORAGE_KEY}-code-verifier`,
  `${MOBILE_AUTH_STORAGE_KEY}-user`,
];

export async function signOutMobile(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function cleanupMobileAuthStorage(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error(
        "signOut error (account deletion), proceeding with fail-safe cleanup:",
        error
      );
    }
  } catch (error) {
    console.error(
      "signOut threw during account deletion, proceeding with fail-safe cleanup:",
      error
    );
  } finally {
    const results = await Promise.allSettled(
      FAIL_SAFE_AUTH_STORAGE_KEYS.map((key) =>
        secureStorageAdapter.removeItem(key)
      )
    );

    const failures = results
      .map((result, index) => ({ result, index }))
      .filter(
        (entry): entry is { result: PromiseRejectedResult; index: number } =>
          entry.result.status === "rejected"
      );

    for (const { result, index } of failures) {
      console.error(
        `fail-safe removeItem failed for key index ${index}:`,
        result.reason
      );
    }

    if (failures.length > 0) {
      throw new Error(`fail-safe cleanup failed for ${failures.length} key(s)`);
    }
  }
}
