const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { installTsLoader } = require("./testBootstrap.cjs");

installTsLoader();

const {
  API_AUTH_CLASSIFICATIONS,
  classifyApi,
  isBearerCapableApi,
  isCorsEligibleApi,
  parseBearerAuthorization,
} = require(path.join(__dirname, "..", "lib", "proxy-paths.ts"));

const apiRoot = path.join(__dirname, "..", "app", "api");
const methodExportPattern =
  /export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;

function findRouteFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...findRouteFiles(absolutePath));
    } else if (entry.isFile() && entry.name === "route.ts") {
      files.push(absolutePath);
    }
  }
  return files;
}

function pathnameForRouteFile(file) {
  const relativeDirectory = path.relative(apiRoot, path.dirname(file));
  const segments = relativeDirectory === ""
    ? []
    : relativeDirectory.split(path.sep).map((segment) => {
        const dynamicMatch = segment.match(/^\[(.+)\]$/);
        return dynamicMatch ? `__${dynamicMatch[1]}__` : segment;
      });
  return `/api${segments.length > 0 ? `/${segments.join("/")}` : ""}`;
}

function exportedMethods(file) {
  const source = fs.readFileSync(file, "utf8");
  const methods = new Set();
  methodExportPattern.lastIndex = 0;
  for (const match of source.matchAll(methodExportPattern)) {
    methods.add(match[1]);
  }
  assert.ok(
    methods.size > 0,
    `${path.relative(apiRoot, file)}: no exported HTTP method was detected`
  );
  return methods;
}

const routes = findRouteFiles(apiRoot).map((file) => ({
  file,
  pathname: pathnameForRouteFile(file),
  methods: exportedMethods(file),
}));

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

test("every real route×method has exactly one manifest classification", () => {
  for (const route of routes) {
    for (const method of route.methods) {
      const matches = API_AUTH_CLASSIFICATIONS.filter(
        (rule) =>
          rule.pattern.test(route.pathname) && rule.methods.includes(method)
      );
      assert.equal(
        matches.length,
        1,
        `${method} ${route.pathname}: expected exactly one manifest rule`
      );
      assert.equal(
        classifyApi(route.pathname, method),
        matches[0].classification,
        `${method} ${route.pathname}: classifyApi result`
      );
    }
  }
});

test("every manifest rule×method maps to a real exported route method", () => {
  for (const rule of API_AUTH_CLASSIFICATIONS) {
    const matchingRoutes = routes.filter((route) =>
      rule.pattern.test(route.pathname)
    );
    assert.equal(
      matchingRoutes.length,
      1,
      `${rule.pattern}: expected exactly one corresponding route.ts`
    );
    for (const method of rule.methods) {
      assert.equal(
        matchingRoutes[0].methods.has(method),
        true,
        `${method} ${matchingRoutes[0].pathname}: manifest method is not exported`
      );
    }
  }
});

test("classification helpers are fail-closed and keep auth modes separate", () => {
  assert.equal(classifyApi("/api/chat", "POST"), "bearer");
  assert.equal(classifyApi("/api/share/token", "GET"), "public");
  assert.equal(classifyApi("/api/mcp/threads", "GET"), "mcp");
  assert.equal(
    classifyApi("/api/cron/storage-cleanup", "GET"),
    "internal"
  );
  assert.equal(classifyApi("/api/chat", "GET"), null);
  assert.equal(classifyApi("/api/unknown", "POST"), null);
  assert.equal(classifyApi("/api/lore/embed", "PATCH"), null);
  assert.equal(
    classifyApi("/api/threads/id/messages/restore-branch", "DELETE"),
    null
  );
  assert.equal(isBearerCapableApi("/api/chat", "POST"), true);
  assert.equal(isBearerCapableApi("/api/share/token", "GET"), false);
  assert.equal(isCorsEligibleApi("/api/share/token", "GET"), true);
  assert.equal(isCorsEligibleApi("/api/mcp/threads", "GET"), false);
});

test("Bearer parser distinguishes absent, empty, and populated credentials", () => {
  assert.deepEqual(parseBearerAuthorization(null), { present: false });
  assert.deepEqual(parseBearerAuthorization("Basic value"), { present: false });
  assert.deepEqual(parseBearerAuthorization("Bearer"), {
    present: true,
    token: null,
  });
  assert.deepEqual(parseBearerAuthorization("bEaReR    "), {
    present: true,
    token: null,
  });
  assert.deepEqual(parseBearerAuthorization("Bearer token-value"), {
    present: true,
    token: "token-value",
  });
});

for (const { name, fn } of pendingTests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const routeMethodCount = routes.reduce(
  (count, route) => count + route.methods.size,
  0
);
console.log(
  `${pendingTests.length} proxy path tests passed (${routes.length} routes, ${routeMethodCount} methods)`
);
