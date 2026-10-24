export type ThreadView = { epoch: number; threadId: string | null };

export function isViewCurrent(view: ThreadView, current: { currentEpoch: number; currentThreadId: string | null }): boolean {
  return view.epoch === current.currentEpoch && view.threadId === current.currentThreadId;
}

// Also usable to invalidate in-flight reads before a local mutation is displayed.
export function createLatestRequest() {
  let latest = 0;
  return {
    start: () => ++latest,
    isLatest: (request: number) => request === latest,
  };
}
