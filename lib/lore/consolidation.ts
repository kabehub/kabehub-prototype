// Client componentからも参照されるため、server-only依存を追加しないこと。

export function normalizePair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

export function pairKey(idA: string, idB: string): string {
  const [a, b] = normalizePair(idA, idB);
  return `${a}:${b}`;
}
