export class ThreadWriteError extends Error {
  constructor(public readonly status: number, public readonly error?: string, message = "Thread write failed") {
    super(message);
    this.name = "ThreadWriteError";
  }
}

export function isThreadTrashResponse(status: number, body: unknown): boolean {
  return status === 409 && typeof body === "object" && body !== null &&
    "error" in body && body.error === "thread is in trash";
}

export function isThreadTrashWriteError(error: unknown): error is ThreadWriteError {
  return error instanceof ThreadWriteError && isThreadTrashResponse(error.status, error);
}

export async function readThreadWriteError(response: Response, message: string): Promise<ThreadWriteError> {
  let body: unknown;
  try { body = await response.clone().json(); } catch { /* Status remains available even for unreadable bodies. */ }
  const error = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
    ? body.error : undefined;
  return new ThreadWriteError(response.status, error, message);
}

// Read only potential trash failures; leave every other response and its body to the existing caller.
export async function throwIfThreadTrashed(response: Response): Promise<void> {
  if (response.status !== 409) return;
  const error = await readThreadWriteError(response, "Thread is in trash");
  if (isThreadTrashWriteError(error)) throw error;
}

type ShowToast = (message: string, type?: "success" | "error", options?: {
  action?: { label: string; onClick: () => void | Promise<void> }; duration?: number;
}) => void;

export function notifyThreadTrashed(error: unknown, showToast: ShowToast): boolean {
  if (!isThreadTrashWriteError(error)) return false;
  showToast("このスレッドはゴミ箱にあります", "error", {
    action: { label: "ゴミ箱を開く", onClick: () => { window.location.href = "/trash"; } },
  });
  return true;
}

export function restoreThreadInput(current: string, content: string, queryText?: string): string {
  return current === "" ? (queryText ?? content) : current;
}

export function threadWriteNotification(error: unknown, abortReason: "user" | "thread-trashed" | null): "none" | "trash" | "generic" {
  if (abortReason === "thread-trashed") return "none";
  return isThreadTrashWriteError(error) ? "trash" : "generic";
}
