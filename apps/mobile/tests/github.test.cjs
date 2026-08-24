const assert = require("node:assert/strict");
const test = require("node:test");

const { installMock, sourcePath } = require("./testModules.cjs");

const openedUrls = [];
const externalBrowser = {
  async open(url) {
    openedUrls.push(url);
  },
};

installMock(sourcePath("lib/externalBrowser.ts"), { externalBrowser });

const { parseGithubCallbackUrl, startGithubConnect } = require(
  sourcePath("lib/auth/github.ts")
);

test.beforeEach(() => {
  openedUrls.length = 0;
});

test("GitHub connect requests an authorization URL and opens it", async () => {
  const calls = [];
  const apiClient = {
    async request(path, init) {
      calls.push({ path, init });
      return Response.json({ url: "https://github.com/login/oauth/authorize" });
    },
  };

  await startGithubConnect(apiClient);

  assert.deepEqual(calls, [
    { path: "/api/auth/github", init: { method: "GET" } },
  ]);
  assert.deepEqual(openedUrls, ["https://github.com/login/oauth/authorize"]);
});

test("GitHub connect rejects a failed API response", async () => {
  const apiClient = {
    async request() {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    },
  };

  await assert.rejects(
    startGithubConnect(apiClient),
    /Failed to start GitHub OAuth/
  );
  assert.deepEqual(openedUrls, []);
});

test("GitHub connect rejects a response without an authorization URL", async () => {
  const apiClient = {
    async request() {
      return Response.json({});
    },
  };

  await assert.rejects(
    startGithubConnect(apiClient),
    /Failed to start GitHub OAuth/
  );
  assert.deepEqual(openedUrls, []);
});

test("GitHub callback parser returns only supported completion statuses", () => {
  assert.equal(
    parseGithubCallbackUrl(
      "https://www.kabehub.com/mobile/auth/github/callback?status=connected"
    ),
    "connected"
  );
  assert.equal(
    parseGithubCallbackUrl(
      "https://www.kabehub.com/mobile/auth/github/callback?status=error"
    ),
    "error"
  );
  assert.equal(
    parseGithubCallbackUrl(
      "https://www.kabehub.com/mobile/auth/github/callback?status=unknown"
    ),
    null
  );
  assert.equal(
    parseGithubCallbackUrl(
      "https://www.kabehub.com/mobile/auth/github/callback"
    ),
    null
  );
});

test("GitHub callback parser ignores malformed and non-matching URLs", () => {
  for (const rawUrl of [
    "not a URL",
    "https://evil.example/mobile/auth/github/callback?status=connected",
    "https://www.kabehub.com/mobile/auth/github/callback/?status=connected",
    "https://www.kabehub.com/mobile/auth/callback?status=connected",
  ]) {
    assert.equal(parseGithubCallbackUrl(rawUrl), null);
  }
});
