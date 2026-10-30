export type KabeCardTone = "positive" | "neutral" | "warning" | "negative";

export type KabeCard = {
  title: string;
  badge?: string;
  tone?: KabeCardTone;
  meta?: string;
  body: string;
};

export const KABE_CARD_MAX_PER_MESSAGE = 20;
export const KABE_CARD_MAX_TITLE_LENGTH = 60;
export const KABE_CARD_MAX_BADGE_LENGTH = 30;
export const KABE_CARD_MAX_META_LENGTH = 100;
export const KABE_CARD_MAX_BODY_LENGTH = 600;

export function parseKabeCard(inner: string): KabeCard | null {
  const lines = inner.split(/\r\n?|\n/);
  const header = new Map<string, string>();
  let bodyStart = 0;
  while (bodyStart < lines.length) {
    const match = /^(title|badge|tone|meta):/.exec(lines[bodyStart]);
    if (!match) break;
    if (!header.has(match[1])) {
      header.set(match[1], lines[bodyStart].slice(match[0].length).trim());
    }
    bodyStart += 1;
  }

  let bodyEnd = lines.length;
  while (bodyStart < bodyEnd && lines[bodyStart].trim() === "") bodyStart += 1;
  while (bodyEnd > bodyStart && lines[bodyEnd - 1].trim() === "") bodyEnd -= 1;
  const body = lines.slice(bodyStart, bodyEnd).join("\n");
  const title = header.get("title");
  const badge = header.get("badge") || undefined;
  const meta = header.get("meta") || undefined;
  const rawTone = header.get("tone");
  const tone = rawTone === "positive" || rawTone === "neutral"
    || rawTone === "warning" || rawTone === "negative" ? rawTone : undefined;

  if (!title
    || Array.from(title).length > KABE_CARD_MAX_TITLE_LENGTH
    || Array.from(badge || "").length > KABE_CARD_MAX_BADGE_LENGTH
    || Array.from(meta || "").length > KABE_CARD_MAX_META_LENGTH
    || Array.from(body).length > KABE_CARD_MAX_BODY_LENGTH) {
    return null;
  }
  return { title, badge, tone, meta, body };
}

function stripBlockquoteMarkers(line: string): string {
  // ASTのsliceでは先頭行のコンテナ接頭辞だけが除かれ、後続行には残る。
  return line.replace(/^(?: {0,3}> ?)+/, "");
}

export function isKabeCardFenceClosed(fenceSource: string): boolean {
  // trim()は使わず、閉じ行の先頭インデントを保持する。
  const lines = fenceSource.replace(/[ \t\r\n]+$/, "").split(/\r\n?|\n/);
  if (lines.length < 2) return false;
  const opening = /^ {0,3}(`{3,}|~{3,})/.exec(stripBlockquoteMarkers(lines[0]));
  const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(
    stripBlockquoteMarkers(lines[lines.length - 1])
  );
  return Boolean(opening && closing
    && opening[1][0] === closing[1][0]
    && closing[1].length >= opening[1].length);
}

export function createKabeCardLimiter(
  max: number = KABE_CARD_MAX_PER_MESSAGE
): (startOffset: number) => boolean {
  const ordinals = new Map<number, number>();
  // 番号はレンダリング呼び出し順で割り当てる。同期レンダリングでは出現順と一致する前提。
  // カードUIが複雑化したらAST事前処理に移行する。
  return (startOffset) => {
    if (!ordinals.has(startOffset)) ordinals.set(startOffset, ordinals.size + 1);
    return ordinals.get(startOffset)! <= max;
  };
}
