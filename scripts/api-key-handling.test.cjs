const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), "utf8");

function listFilesRecursive(relativeDir) {
  const absoluteDir = path.join(rootDir, relativeDir);
  return fs.readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name);
    return entry.isDirectory() ? listFilesRecursive(relativePath) : [relativePath];
  });
}

const settingsSource = read("app/settings/page.tsx");
assert.equal(
  settingsSource.includes("KabeHubのサーバーには送信されません"),
  false,
  "settings must not claim that API keys are never sent to KabeHub",
);

for (const relativePath of listFilesRecursive("app/api").filter((file) => file.endsWith(".ts"))) {
  const source = read(relativePath);
  assert.equal(
    /\?key=\$\{[^}]+\}/.test(source),
    false,
    `${relativePath} must not put a Gemini API key in a URL query`,
  );
}

const imageGenSource = read("app/api/image-gen/route.ts");
assert.equal(
  /await\s+(?:res|response)\.text\(\)/.test(imageGenSource),
  false,
  "image-gen must not read and return raw provider error bodies",
);
assert.ok(
  imageGenSource.includes("APIへのリクエストに失敗しました"),
  "image-gen must use a fixed provider error message",
);

const extractSettingsSource = read("app/api/extract-settings/route.ts");
assert.equal(
  /errText|console\.(?:log|error|warn)\([^)]*cleanText/s.test(extractSettingsSource),
  false,
  "extract-settings must not log raw provider error or generated response bodies",
);

const inventory = read("docs/api-key-flow-inventory.md");
for (const storageKey of [
  "kabehub_anthropic_key",
  "kabehub_gemini_key",
  "kabehub_openai_key",
  "kabehub_ideogram_key",
  "kabehub_openrouter_key",
]) {
  assert.ok(inventory.includes(storageKey), `inventory must contain ${storageKey}`);
}
for (const headerName of [
  "x-anthropic-api-key",
  "x-gemini-api-key",
  "x-openai-api-key",
  "x-ideogram-api-key",
  "x-openrouter-api-key",
]) {
  assert.ok(inventory.includes(headerName), `inventory must contain ${headerName}`);
}

console.log("api-key handling tests passed");
