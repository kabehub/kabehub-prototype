export const PINNED_GITHUB_FILES_MAX = 5;

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;
const HANDLE_CHARS_PATTERN = /^[a-z][a-z0-9_-]*$/;

export function isValidHandleFormat(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.length >= HANDLE_MIN_LENGTH &&
    normalized.length <= HANDLE_MAX_LENGTH &&
    HANDLE_CHARS_PATTERN.test(normalized)
  );
}

export function isAllUpperHandle(value: string): boolean {
  return value === value.toUpperCase();
}

export const TAG_NAME_MAX_LENGTH = 20;

export function normalizeTagName(value: string): string {
  return value.replace(/^#+/, "").replace(/[\s\u3000]/g, "");
}
