export function generateMessageSummary(content: string, maxLength: number = 35): string {
  if (!content) return "";
  let text = content.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/[#*~>+\-`]/g, '');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}
