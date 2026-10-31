import { replaceKabeCards } from "./kabeCard";

export const SECRET_MASK = "[redacted]";

export function maskSecretNotation(text: string): string {
  const masked = text.replace(/\[\[([\s\S]*?)\]\]/g, SECRET_MASK);
  const unclosedStart = masked.indexOf("[[");

  if (unclosedStart === -1) {
    return masked;
  }

  return masked.slice(0, unclosedStart) + SECRET_MASK;
}

function finishMessageSummary(content: string, maxLength: number): string {
  let text = content.replace(/[#*~>+\-`]/g, '');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

export function generateMessageSummary(content: string, maxLength: number = 35): string {
  if (!content) return "";
  const legacySummary = finishMessageSummary(content.replace(/```[\s\S]*?```/g, ''), maxLength);
  if (legacySummary !== "") return legacySummary;

  // Only an empty legacy result falls back. Tilde/nested-code summaries stay unchanged (D68).
  let firstTitle: string | undefined;
  replaceKabeCards(content, card => {
    if (firstTitle === undefined) firstTitle = card.title;
    return "";
  });
  return firstTitle === undefined ? "" : finishMessageSummary(firstTitle, maxLength);
}
