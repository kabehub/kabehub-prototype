const assert = require("node:assert/strict");
const test = require("node:test");

const { installMock, sourcePath } = require("./testModules.cjs");

const storedValues = new Map();
const calls = {
  get: [],
  set: [],
  remove: [],
};

let getImplementation;
let setImplementation;
let removeImplementation;

const secureStorageAdapter = {
  async getItem(key) {
    calls.get.push(key);
    return getImplementation(key);
  },
  async setItem(key, value) {
    calls.set.push([key, value]);
    return setImplementation(key, value);
  },
  async removeItem(key) {
    calls.remove.push(key);
    return removeImplementation(key);
  },
};

installMock(sourcePath("lib/secureStorage.ts"), { secureStorageAdapter });

const { mobileApiKeyStore } = require(sourcePath("lib/apiKeyStore.ts"));

function resetStorage() {
  storedValues.clear();
  calls.get.length = 0;
  calls.set.length = 0;
  calls.remove.length = 0;
  getImplementation = async (key) =>
    storedValues.has(key) ? storedValues.get(key) : null;
  setImplementation = async (key, value) => {
    storedValues.set(key, value);
  };
  removeImplementation = async (key) => {
    storedValues.delete(key);
  };
}

test.beforeEach(resetStorage);

test("getKey returns null when a provider key is not set", async () => {
  assert.equal(await mobileApiKeyStore.getKey("claude"), null);
});

test("setKey stores a value that getKey can read", async () => {
  await mobileApiKeyStore.setKey("claude", "claude-secret");
  assert.equal(await mobileApiKeyStore.getKey("claude"), "claude-secret");
});

test("removeKey makes a saved key missing", async () => {
  await mobileApiKeyStore.setKey("claude", "claude-secret");
  await mobileApiKeyStore.removeKey("claude");
  assert.equal(await mobileApiKeyStore.getKey("claude"), null);
});

test("all providers map to kabehub_apikey_{provider}", async () => {
  const providers = [
    "claude",
    "gemini",
    "openai",
    "ideogram",
    "openrouter",
  ];

  for (const provider of providers) {
    await mobileApiKeyStore.setKey(provider, `${provider}-value`);
    await mobileApiKeyStore.getKey(provider);
    await mobileApiKeyStore.removeKey(provider);
  }

  assert.deepEqual(
    calls.set,
    providers.map((provider) => [
      `kabehub_apikey_${provider}`,
      `${provider}-value`,
    ])
  );
  assert.deepEqual(
    calls.get,
    providers.map((provider) => `kabehub_apikey_${provider}`)
  );
  assert.deepEqual(
    calls.remove,
    providers.map((provider) => `kabehub_apikey_${provider}`)
  );
});

test("StorageError propagates unchanged from every store method", async () => {
  class StorageError extends Error {}

  const getError = new StorageError("get failed");
  getImplementation = async () => {
    throw getError;
  };
  await assert.rejects(
    mobileApiKeyStore.getKey("claude"),
    (error) => error === getError
  );

  const setError = new StorageError("set failed");
  setImplementation = async () => {
    throw setError;
  };
  await assert.rejects(
    mobileApiKeyStore.setKey("claude", "secret"),
    (error) => error === setError
  );

  const removeError = new StorageError("remove failed");
  removeImplementation = async () => {
    throw removeError;
  };
  await assert.rejects(
    mobileApiKeyStore.removeKey("claude"),
    (error) => error === removeError
  );
});
