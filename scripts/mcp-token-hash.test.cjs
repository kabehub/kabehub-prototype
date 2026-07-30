const assert = require("node:assert/strict");
const { installTsLoader } = require("./testBootstrap.cjs");

installTsLoader();

const { hashMcpToken } = require("../lib/mcp-token-hash.ts");

async function main() {
  const abcHash = await hashMcpToken("abc");
  const japaneseHash = await hashMcpToken("壁打ち");

  assert.equal(
    abcHash,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
  assert.equal(
    japaneseHash,
    "29660fa6d83ce60ea1391c649161247957229d9d2ccd3c7d1e9589b989e67e32"
  );
  assert.match(abcHash, /^[0-9a-f]{64}$/);
  assert.match(japaneseHash, /^[0-9a-f]{64}$/);

  console.log("mcp-token-hash tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
