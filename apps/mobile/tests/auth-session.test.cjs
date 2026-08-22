const assert = require("node:assert/strict");
const test = require("node:test");

const { installMock, sourcePath } = require("./testModules.cjs");

const AUTH_STORAGE_KEY = "kabehub-mobile-auth";
const EXPECTED_AUTH_STORAGE_KEYS = [
  AUTH_STORAGE_KEY,
  `${AUTH_STORAGE_KEY}-code-verifier`,
  `${AUTH_STORAGE_KEY}-user`,
];

let currentSession = null;
let getSessionError = null;
let signOutImplementation;
let removeImplementation;

const removedKeys = [];
const supabase = {
  auth: {
    async getSession() {
      return {
        data: { session: currentSession },
        error: getSessionError,
      };
    },
    async signOut() {
      return signOutImplementation();
    },
  },
};
const secureStorageAdapter = {
  async getItem() {
    return null;
  },
  async setItem() {},
  async removeItem(key) {
    removedKeys.push(key);
    return removeImplementation(key);
  },
};

installMock(sourcePath("lib/supabase/client.ts"), { supabase });
installMock(sourcePath("lib/secureStorage.ts"), { secureStorageAdapter });

const { mobileAccessTokenProvider } = require(
  sourcePath("lib/accessTokenProvider.ts")
);
const { cleanupMobileAuthStorage, signOutMobile } = require(
  sourcePath("lib/auth/session.ts")
);

function resetAuthState() {
  currentSession = null;
  getSessionError = null;
  removedKeys.length = 0;
  signOutImplementation = async () => {
    currentSession = null;
    return { error: null };
  };
  removeImplementation = async () => {};
}

test.beforeEach(resetAuthState);

test("AccessTokenProvider returns null while signed out", async () => {
  assert.equal(await mobileAccessTokenProvider(), null);
});

test("AccessTokenProvider returns null when session lookup fails", async () => {
  getSessionError = new Error("session lookup failed");
  assert.equal(await mobileAccessTokenProvider(), null);
});

test("AccessTokenProvider returns the current session access token", async () => {
  currentSession = { access_token: "mobile-access-token" };
  assert.equal(await mobileAccessTokenProvider(), "mobile-access-token");
});

test("AccessTokenProvider returns null after signOutMobile", async () => {
  currentSession = { access_token: "mobile-access-token" };
  await signOutMobile();
  assert.equal(await mobileAccessTokenProvider(), null);
});

test("signOutMobile surfaces a Supabase sign-out error", async () => {
  const signOutError = new Error("sign-out failed");
  signOutImplementation = async () => ({ error: signOutError });
  await assert.rejects(signOutMobile(), signOutError);
  assert.deepEqual(removedKeys, []);
});

test("account cleanup removes all three keys when signOut throws", async (t) => {
  t.mock.method(console, "error", () => {});
  signOutImplementation = async () => {
    throw new Error("network failure");
  };

  await cleanupMobileAuthStorage();

  assert.deepEqual(removedKeys, EXPECTED_AUTH_STORAGE_KEYS);
});

test("account cleanup attempts every key and surfaces removal failures", async (t) => {
  t.mock.method(console, "error", () => {});
  removeImplementation = async (key) => {
    if (key.endsWith("-code-verifier")) {
      throw new Error("secure storage unavailable");
    }
  };

  await assert.rejects(
    cleanupMobileAuthStorage(),
    /fail-safe cleanup failed for 1 key\(s\)/
  );
  assert.deepEqual(removedKeys, EXPECTED_AUTH_STORAGE_KEYS);
});
