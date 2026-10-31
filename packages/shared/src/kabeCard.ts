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

/**
 * Replace closed, valid column-zero cards, preserving untouched source slices and
 * their original line endings. All 0–3-space fences are tracked so examples in
 * other code blocks (including indented ones) remain opaque.
 *
 * Known limitation (D71): quoted/list/1–3-space-indented cards are not replaced,
 * although MarkdownRenderer's AST may render them. The 20-card budget therefore
 * counts this helper's recognized cards, not necessarily the renderer's set.
 */
export function replaceKabeCards(
  content: string,
  replacer: (card: KabeCard) => string
): string {
  let open: {
    character: string; length: number; start: number; innerStart: number; isCard: boolean;
  } | null = null;
  let validCount = 0;
  let cursor = 0;
  const parts: string[] = [];

  // Capture each line without normalizing CRLF/CR/LF; match.index is its source offset.
  for (const match of content.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)) {
    if (match[0] === "") break;
    const line = match[1];
    const start = match.index!;
    if (open) {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (!closing || closing[1][0] !== open.character || closing[1].length < open.length) continue;
      if (open.isCard) {
        const inner = content.slice(open.innerStart, start).replace(/(?:\r\n|\r|\n)$/, "");
        const card = parseKabeCard(inner);
        if (card && ++validCount <= KABE_CARD_MAX_PER_MESSAGE) {
          parts.push(content.slice(cursor, open.start), replacer(card));
          cursor = start + line.length; // Keep the closing line's original newline.
        }
      }
      open = null;
      continue;
    }

    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!opening || (opening[1][0] === "`" && opening[2].includes("`"))) continue;
    open = {
      character: opening[1][0], length: opening[1].length,
      start, innerStart: start + match[0].length,
      isCard: line[0] !== " " && opening[2].trim().split(/\s+/)[0] === "kabe-card",
    };
  }
  // An unclosed fence stays in the untouched tail, including everything inside it.
  if (parts.length === 0) return content;
  return parts.join("") + content.slice(cursor);
}
