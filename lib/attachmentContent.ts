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
