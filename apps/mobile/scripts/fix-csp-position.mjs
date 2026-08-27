import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mobileDirectory = path.resolve(scriptDirectory, "..");
const outDirectory = path.join(mobileDirectory, "out");

const headOpenPattern = /<head\b[^>]*>/gi;
const headClosePattern = /<\/head\s*>/gi;
const metaPattern = /<meta\b[^>]*>/gi;
const charsetPattern = /\bcharset\s*=/i;
const cspPattern =
  /\bhttp-equiv\s*=\s*(?:"Content-Security-Policy"|'Content-Security-Policy'|Content-Security-Policy)(?=[\s/>])/i;
const resourcePattern = /<(?:link|script)\b/i;

function collectMatches(content, pattern) {
  return [...content.matchAll(pattern)].map((match) => ({
    end: match.index + match[0].length,
    index: match.index,
    value: match[0],
  }));
}

function displayPath(filePath) {
  return path.relative(mobileDirectory, filePath).split(path.sep).join("/");
}

function assertCount(filePath, label, matches, expectedCount) {
  if (matches.length !== expectedCount) {
    throw new Error(
      `${displayPath(filePath)}: expected exactly ${expectedCount} ${label}, found ${matches.length}`,
    );
  }
}

function inspectDocument(filePath, content) {
  const headOpenMatches = collectMatches(content, headOpenPattern);
  const headCloseMatches = collectMatches(content, headClosePattern);
  assertCount(filePath, "<head> opening tag", headOpenMatches, 1);
  assertCount(filePath, "</head> closing tag", headCloseMatches, 1);

  const headOpen = headOpenMatches[0];
  const headClose = headCloseMatches[0];
  if (headOpen.end > headClose.index) {
    throw new Error(`${displayPath(filePath)}: <head> tags are not in a valid order`);
  }

  const metaTags = collectMatches(content, metaPattern);
  const charsetTags = metaTags.filter((tag) => charsetPattern.test(tag.value));
  const cspTags = metaTags.filter((tag) => cspPattern.test(tag.value));
  assertCount(filePath, "charset meta tag", charsetTags, 1);
  assertCount(filePath, "CSP meta tag", cspTags, 1);

  return {
    charset: charsetTags[0],
    csp: cspTags[0],
    headClose,
    headOpen,
  };
}

function assertTransformedDocument(filePath, content, originalCspTag) {
  const inspection = inspectDocument(filePath, content);
  const { charset, csp, headClose, headOpen } = inspection;
  const firstResourceMatch = resourcePattern.exec(content);
  const firstResourceIndex = firstResourceMatch?.index ?? -1;
  const inHead = csp.index >= headOpen.end && csp.end <= headClose.index;
  const beforeResource =
    firstResourceIndex === -1 || csp.index < firstResourceIndex;
  const unchanged = csp.value === originalCspTag;
  const directlyAfterCharset = csp.index === charset.end;

  if (!inHead) {
    throw new Error(`${displayPath(filePath)}: CSP meta tag is not inside <head>`);
  }
  if (!beforeResource) {
    throw new Error(
      `${displayPath(filePath)}: CSP meta tag is not before the first <link> or <script>`,
    );
  }
  if (!unchanged) {
    throw new Error(`${displayPath(filePath)}: CSP meta tag changed during postbuild`);
  }
  if (!directlyAfterCharset) {
    throw new Error(
      `${displayPath(filePath)}: CSP meta tag is not directly after the charset meta tag`,
    );
  }

  return {
    beforeResource,
    cspCount: 1,
    cspIndex: csp.index,
    firstResourceIndex,
    headCloseIndex: headClose.index,
    headOpenIndex: headOpen.index,
    inHead,
    unchanged,
  };
}

function transformDocument(filePath, content) {
  const { charset, csp, headClose, headOpen } = inspectDocument(filePath, content);

  if (
    charset.index < headOpen.end ||
    charset.end > headClose.index ||
    csp.index < headOpen.end ||
    csp.end > headClose.index
  ) {
    throw new Error(
      `${displayPath(filePath)}: charset and CSP meta tags must both be inside <head>`,
    );
  }

  const originalCspTag = csp.value;
  const withoutCsp = content.slice(0, csp.index) + content.slice(csp.end);
  const charsetTagsAfterRemoval = collectMatches(withoutCsp, metaPattern).filter(
    (tag) => charsetPattern.test(tag.value),
  );
  assertCount(
    filePath,
    "charset meta tag after CSP removal",
    charsetTagsAfterRemoval,
    1,
  );

  const insertionIndex = charsetTagsAfterRemoval[0].end;
  const transformed =
    withoutCsp.slice(0, insertionIndex) +
    originalCspTag +
    withoutCsp.slice(insertionIndex);

  assertTransformedDocument(filePath, transformed, originalCspTag);

  return { content: transformed, filePath, originalCspTag };
}

async function findHtmlFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return findHtmlFiles(entryPath);
      }
      return entry.isFile() && entry.name.toLowerCase().endsWith(".html")
        ? [entryPath]
        : [];
    }),
  );

  return nestedFiles.flat().sort((left, right) => left.localeCompare(right));
}

async function main() {
  const htmlFiles = await findHtmlFiles(outDirectory);
  if (htmlFiles.length === 0) {
    throw new Error("out/**/*.html: expected at least one HTML file, found 0");
  }

  // Validate and transform every file in memory before writing any file.
  const transformedFiles = await Promise.all(
    htmlFiles.map(async (filePath) =>
      transformDocument(filePath, await readFile(filePath, "utf8")),
    ),
  );

  await Promise.all(
    transformedFiles.map(({ content, filePath }) =>
      writeFile(filePath, content, "utf8"),
    ),
  );

  // Re-read every file and assert the persisted output.
  const verificationResults = await Promise.all(
    transformedFiles.map(async ({ filePath, originalCspTag }) => ({
      filePath,
      result: assertTransformedDocument(
        filePath,
        await readFile(filePath, "utf8"),
        originalCspTag,
      ),
    })),
  );

  console.log(`[fix-csp-position] HTML_COUNT=${verificationResults.length}`);
  for (const { filePath, result } of verificationResults) {
    console.log(
      [
        `[fix-csp-position] FILE=${displayPath(filePath)}`,
        `CSP_COUNT=${result.cspCount}`,
        `HEAD_OPEN=${result.headOpenIndex}`,
        `CSP_INDEX=${result.cspIndex}`,
        `FIRST_RESOURCE_INDEX=${result.firstResourceIndex}`,
        `HEAD_CLOSE=${result.headCloseIndex}`,
        `IN_HEAD=${result.inHead}`,
        `BEFORE_RESOURCE=${result.beforeResource}`,
        `UNCHANGED=${result.unchanged}`,
      ].join(" "),
    );
  }
}

main().catch((error) => {
  console.error(`[fix-csp-position] ERROR: ${error.message}`);
  process.exitCode = 1;
});
