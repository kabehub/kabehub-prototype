export function trashDaysRemaining(expiresAt: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / (24 * 60 * 60 * 1000)));
}

export function trashRestoreError(status: number, error?: string): string {
  return status === 409 && error === "trash retention expired"
    ? "保持期間が過ぎたため復元できません"
    : "スレッドの復元に失敗しました";
}
