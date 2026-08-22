const assert = require("node:assert/strict");
const test = require("node:test");

const { installMock, sourcePath } = require("./testModules.cjs");

let signInResult;
let exchangeImplementation;
const openedUrls = [];
const exchangedCodes = [];

const supabase = {
  auth: {
    async signInWithOAuth(options) {
      return signInResult(options);
    },
    async exchangeCodeForSession(code) {
      exchangedCodes.push(code);
      return exchangeImplementation(code);
    },
  },
};
const externalBrowser = {
  async open(url) {
    openedUrls.push(url);
  },
};

installMock(sourcePath("lib/supabase/client.ts"), { supabase });
installMock(sourcePath("lib/externalBrowser.ts"), { externalBrowser });

const { handleAuthCallbackUrl, startGoogleSignIn } = require(
  sourcePath("lib/auth/oauth.ts")
);

test.beforeEach(() => {
  openedUrls.length = 0;
  exchangedCodes.length = 0;
  signInResult = async () => ({
    data: { url: "https://accounts.google.test/authorize" },
    error: null,
  });
  exchangeImplementation = async () => ({ error: null });
});

test("Google sign-in uses PKCE callback options and the external browser", async () => {
  let receivedOptions;
  signInResult = async (options) => {
    receivedOptions = options;
    return {
      data: { url: "https://accounts.google.test/authorize" },
      error: null,
    };
  };

  await startGoogleSignIn();

  assert.deepEqual(receivedOptions, {
    provider: "google",
    options: {
      skipBrowserRedirect: true,
      redirectTo: "https://www.kabehub.com/mobile/auth/callback",
    },
  });
  assert.deepEqual(openedUrls, ["https://accounts.google.test/authorize"]);
});

test("Google sign-in fails fast when no authorization URL is returned", async () => {
  signInResult = async () => ({ data: { url: null }, error: null });
  await assert.rejects(startGoogleSignIn(), /authorization URL was not returned/);
  assert.deepEqual(openedUrls, []);
});

test("Google sign-in surfaces a Supabase OAuth error", async () => {
  const oauthError = new Error("OAuth start failed");
  signInResult = async () => ({ data: { url: null }, error: oauthError });
  await assert.rejects(startGoogleSignIn(), oauthError);
  assert.deepEqual(openedUrls, []);
});

test("callback handler ignores malformed and non-matching URLs", async (t) => {
  t.mock.method(console, "error", () => {});
  await Promise.all([
    handleAuthCallbackUrl("not a URL"),
    handleAuthCallbackUrl("https://evil.example/mobile/auth/callback?code=a"),
    handleAuthCallbackUrl("https://www.kabehub.com/other?code=b"),
    handleAuthCallbackUrl(
      "https://www.kabehub.com/mobile/auth/callback?error=access_denied&error_description=no"
    ),
  ]);
  assert.deepEqual(exchangedCodes, []);
});

test("callback handler deduplicates in-flight and completed codes", async () => {
  let resolveExchange;
  exchangeImplementation = () =>
    new Promise((resolve) => {
      resolveExchange = resolve;
    });
  const callbackUrl =
    "https://www.kabehub.com/mobile/auth/callback?code=dedupe-code";

  const first = handleAuthCallbackUrl(callbackUrl);
  const second = handleAuthCallbackUrl(callbackUrl);
  assert.deepEqual(exchangedCodes, ["dedupe-code"]);

  resolveExchange({ error: null });
  await Promise.all([first, second]);
  await handleAuthCallbackUrl(callbackUrl);

  assert.deepEqual(exchangedCodes, ["dedupe-code"]);
});

test("callback handler allows retry after a failed exchange", async (t) => {
  t.mock.method(console, "error", () => {});
  let attempt = 0;
  exchangeImplementation = async () => {
    attempt += 1;
    return attempt === 1
      ? { error: new Error("temporary failure") }
      : { error: null };
  };
  const callbackUrl =
    "https://www.kabehub.com/mobile/auth/callback?code=retry-code";

  await handleAuthCallbackUrl(callbackUrl);
  await handleAuthCallbackUrl(callbackUrl);

  assert.deepEqual(exchangedCodes, ["retry-code", "retry-code"]);
});

test("callback handler allows retry after an exchange throws", async () => {
  let attempt = 0;
  exchangeImplementation = async () => {
    attempt += 1;
    if (attempt === 1) throw new Error("network failure");
    return { error: null };
  };
  const callbackUrl =
    "https://www.kabehub.com/mobile/auth/callback?code=throw-retry-code";

  await assert.rejects(handleAuthCallbackUrl(callbackUrl), /network failure/);
  await handleAuthCallbackUrl(callbackUrl);

  assert.deepEqual(exchangedCodes, ["throw-retry-code", "throw-retry-code"]);
});
