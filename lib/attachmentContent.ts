// Preserve the existing attachment formatting; raw input is used only for search.
export function buildMessageWithTextFiles(
  value: string,
  textFiles: { name: string; content: string }[],
): { content: string; queryText: string } {
  let finalContent = value;
  if (textFiles.length > 0) {
    const fileBlocks = textFiles.map((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "txt";
      const lang = ext === "csv" ? "csv" : ext === "md" ? "markdown" : "text";
      return `\`\`\`${lang}\n${f.content}\n\`\`\``;
    });
    finalContent = value.trim()
      ? `${value}\n\n${fileBlocks.join("\n\n")}`
      : fileBlocks.join("\n\n");
  }
  return { content: finalContent, queryText: value };
}

export function splitMessageContent(
  content: string,
  queryText: string,
): { attachmentBlocks: string } | null {
  if (content === queryText) return { attachmentBlocks: "" };
  let attachmentBlocks: string;
  if (queryText.trim() === "") {
    attachmentBlocks = content;
  } else {
    const prefix = `${queryText}\n\n`;
    if (!content.startsWith(prefix)) return null;
    attachmentBlocks = content.slice(prefix.length);
  }
  if (attachmentBlocks && (!attachmentBlocks.startsWith("```") || !attachmentBlocks.endsWith("```"))) return null;
  return { attachmentBlocks };
}

export function replaceQueryText(
  content: string,
  originalQueryText: string,
  editedQueryText: string,
): { content: string; queryText: string } | null {
  const split = splitMessageContent(content, originalQueryText);
  if (!split) return null;
  const blocks = split.attachmentBlocks;
  return {
    content: !blocks ? editedQueryText : editedQueryText.trim() ? `${editedQueryText}\n\n${blocks}` : blocks,
    queryText: editedQueryText,
  };
}
