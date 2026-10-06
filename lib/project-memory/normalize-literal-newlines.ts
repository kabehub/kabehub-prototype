/** Normalize prose only; ambiguous or unclosed code spans remain untouched. */
export function normalizeLiteralNewlines(content: string): string {
  let result = "";
  for (let i = 0; i < content.length;) {
    let end = i;
    if (content[i] === "`") {
      while (content[end] === "`") end++;
      const width = end - i;
      // Match a whole backtick run, never a substring of a longer delimiter.
      let cursor = end;
      end = content.length;
      while (cursor < content.length) {
        if (content[cursor] !== "`") { cursor++; continue; }
        const start = cursor;
        while (content[cursor] === "`") cursor++;
        if (cursor - start === width) { end = cursor; break; }
      }
    } else if ((/^[A-Za-z]:\\/.test(content.slice(i, i + 3)) &&
      (i === 0 || !/[A-Za-z0-9]/.test(content[i - 1]))) || content.startsWith("\\\\", i)) {
      while (end < content.length && !/\s/.test(content[end])) end++;
    }
    if (end > i) {
      result += content.slice(i, end);
      i = end;
    } else if (content[i] === "\\" && content[i + 1] === "n" && content[i - 1] !== "\\") {
      result += "\n";
      i += 2;
    } else {
      result += content[i++];
    }
  }
  return result;
}
