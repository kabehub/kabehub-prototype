const REDACTED = "[redacted]";

// Scan delimiters once; an unterminated paste only loses its BEGIN line.
function maskPrivateKeys(content: string): string {
  const markers = [...content.matchAll(/-----(?:BEGIN|END) [A-Z0-9 ]*PRIVATE KEY-----/g)];
  const nextEnds: number[] = [];
  let nextEnd = -1;
  for (let i = markers.length - 1; i >= 0; i--) {
    nextEnds[i] = nextEnd;
    if (markers[i][0].startsWith("-----END ")) nextEnd = i;
  }
  const parts: string[] = [];
  let cursor = 0;
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    if (marker.index! < cursor || !marker[0].startsWith("-----BEGIN ")) continue;
    parts.push(content.slice(cursor, marker.index), REDACTED);
    const end = nextEnds[i];
    if (end >= 0) {
      cursor = markers[end].index! + markers[end][0].length;
      i = end;
    } else {
      const newline = content.indexOf("\n", marker.index);
      cursor = newline < 0 ? content.length : newline;
    }
  }
  parts.push(content.slice(cursor));
  return parts.join("");
}

/** Mask known sensitive formats before truncation or JSON budget accounting. */
export function maskAutoSummarySecrets(content: string): string {
  return maskPrivateKeys(content)
    // The left boundary prevents retrying a long non-email run at every character.
    .replace(/(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, REDACTED)
    .replace(/(?<![A-Za-z0-9])sk-(?:ant-)?[A-Za-z0-9_-]{20,}/g, REDACTED)
    .replace(/gh[pousr]_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{22,}/g, REDACTED)
    .replace(/(?<![A-Za-z0-9])AIza[A-Za-z0-9_-]{35,}/g, REDACTED)
    .replace(/(?<![A-Za-z0-9])(?:AKIA|ASIA)[A-Z0-9]{16,}/g, REDACTED)
    .replace(/Bearer +[A-Za-z0-9._~+\/-]{20,}=*/gi, REDACTED)
    .replace(/(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9_-]+/g, REDACTED)
    // Split each run once rather than retrying every eyJ prefix in a failed JWT.
    .replace(/[A-Za-z0-9_.-]+/g, run => {
      const segments = run.split(".");
      const result: string[] = [];
      for (let i = 0; i < segments.length; i++) {
        const start = segments[i].indexOf("eyJ");
        if (start >= 0 && segments[i].length - start >= 13 &&
          (segments[i + 1]?.length ?? 0) >= 10 && (segments[i + 2]?.length ?? 0) >= 10) {
          result.push(segments[i].slice(0, start) + REDACTED);
          i += 2;
        } else result.push(segments[i]);
      }
      return result.join(".");
    });
}
