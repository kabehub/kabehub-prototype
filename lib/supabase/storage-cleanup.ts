import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnedStoragePath } from "@/lib/storage-path-guard";

const GENERATED_IMAGES_BUCKET = "generated-images";
const STORAGE_BATCH_SIZE = 1000;

type MessageMetadataRow = {
  metadata?: { storagePath?: unknown } | null;
};

export type StorageCleanupResult = {
  attemptedCount: number;
  succeededCount: number;
  failedCount: number;
  errorCodes: string[];
};

function getStorageErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    if ("statusCode" in error && typeof error.statusCode === "string") {
      return error.statusCode;
    }
    if ("code" in error && typeof error.code === "string") {
      return error.code;
    }
    if ("name" in error && typeof error.name === "string") {
      return error.name;
    }
  }

  return "unknown";
}

export function collectOwnedStoragePaths(
  rows: MessageMetadataRow[],
  userId: string
): string[] {
  const paths = new Set<string>();

  for (const row of rows) {
    const storagePath = row.metadata?.storagePath;
    if (isOwnedStoragePath(storagePath, userId)) {
      paths.add(storagePath);
    }
  }

  return [...paths];
}

export async function removeStoragePaths(
  supabase: Pick<SupabaseClient, "storage">,
  paths: string[]
): Promise<StorageCleanupResult> {
  const result: StorageCleanupResult = {
    attemptedCount: paths.length,
    succeededCount: 0,
    failedCount: 0,
    errorCodes: [],
  };
  const bucket = supabase.storage.from(GENERATED_IMAGES_BUCKET);

  for (let offset = 0; offset < paths.length; offset += STORAGE_BATCH_SIZE) {
    const chunk = paths.slice(offset, offset + STORAGE_BATCH_SIZE);

    try {
      const { error } = await bucket.remove(chunk);
      if (error) {
        result.failedCount += chunk.length;
        result.errorCodes.push(getStorageErrorCode(error));
      } else {
        result.succeededCount += chunk.length;
      }
    } catch (error) {
      result.failedCount += chunk.length;
      result.errorCodes.push(getStorageErrorCode(error));
    }
  }

  return result;
}

export async function listAllObjectPathsUnderPrefix(
  supabase: Pick<SupabaseClient, "storage">,
  prefix: string
): Promise<string[]> {
  const bucket = supabase.storage.from(GENERATED_IMAGES_BUCKET);
  const objectPaths: string[] = [];

  async function walk(currentPrefix: string): Promise<void> {
    let offset = 0;

    while (true) {
      const { data, error } = await bucket.list(currentPrefix, {
        limit: STORAGE_BATCH_SIZE,
        offset,
      });

      if (error) throw error;

      const entries = data ?? [];
      for (const entry of entries) {
        const fullPath = currentPrefix
          ? `${currentPrefix}/${entry.name}`
          : entry.name;

        if (entry.id !== null) {
          objectPaths.push(fullPath);
        } else {
          await walk(fullPath);
        }
      }

      if (entries.length < STORAGE_BATCH_SIZE) break;
      offset += STORAGE_BATCH_SIZE;
    }
  }

  await walk(prefix.replace(/\/$/, ""));
  return objectPaths;
}
