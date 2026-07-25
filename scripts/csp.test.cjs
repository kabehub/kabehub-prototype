const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(
  request,
  parent,
  isMain,
  options
) {
  if (request.startsWith("@/")) {
    request = path.join(__dirname, "..", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2018,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const {
  buildCspHeaderValue,
  parseCspReportBody,
  sanitizeReportUrl,
} = require(path.join(__dirname, "..", "lib", "csp.ts"));
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const { POST: postCspReport } = require(
  path.join(__dirname, "..", "app", "api", "csp-report", "route.ts")
);

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function buildCsp(overrides = {}) {
  return buildCspHeaderValue({
    nonce: "nonce-value",
    isDev: false,
    supabaseHttpOrigin: "https://project.supabase.co",
    supabaseWsOrigin: "wss://project.supabase.co",
    reportEndpointConfigured: false,
    ...overrides,
  });
}

test("buildCspHeaderValue embeds nonce and required directives", () => {
  const csp = buildCsp();

  assert.match(
    csp,
    /script-src 'self' 'nonce-nonce-value' 'strict-dynamic'/
  );
  assert.match(
    csp,
    /img-src 'self' data: blob: https:\/\/project\.supabase\.co/
  );
  assert.match(
    csp,
    /connect-src 'self' https:\/\/project\.supabase\.co wss:\/\/project\.supabase\.co/
  );
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /report-uri \/api\/csp-report/);
  assert.doesNotMatch(csp, /'unsafe-eval'/);
  assert.doesNotMatch(csp, /report-to csp-endpoint/);
});

test("buildCspHeaderValue adds unsafe-eval only in development", () => {
  assert.match(buildCsp({ isDev: true }), /'unsafe-eval'/);
  assert.doesNotMatch(buildCsp({ isDev: false }), /'unsafe-eval'/);
});

test("buildCspHeaderValue adds report-to only when configured", () => {
  assert.match(
    buildCsp({ reportEndpointConfigured: true }),
    /report-to csp-endpoint/
  );
  assert.doesNotMatch(
    buildCsp({ reportEndpointConfigured: false }),
    /report-to csp-endpoint/
  );
});

test("buildCspHeaderValue omits empty Supabase origins", () => {
  const csp = buildCsp({
    supabaseHttpOrigin: "",
    supabaseWsOrigin: "",
  });
  assert.match(csp, /img-src 'self' data: blob:/);
  assert.match(csp, /connect-src 'self'/);
  assert.doesNotMatch(csp, /undefined/);
});

test("parseCspReportBody parses application/csp-report", () => {
  const result = parseCspReportBody(
    "application/csp-report; charset=utf-8",
    JSON.stringify({
      "csp-report": {
        "document-uri": "https://www.kabehub.com/explore?secret=1",
        "blocked-uri": "inline",
        "violated-directive": "script-src-elem",
      },
    })
  );

  assert.deepEqual(result, {
    documentUri: "https://www.kabehub.com/explore?secret=1",
    blockedUri: "inline",
    violatedDirective: "script-src-elem",
  });
});

test("parseCspReportBody parses application/reports+json", () => {
  const result = parseCspReportBody(
    "application/reports+json",
    JSON.stringify([
      { type: "deprecation", body: { id: "other" } },
      {
        type: "csp-violation",
        body: {
          documentURL: "https://www.kabehub.com/",
          blockedURL: "https://cdn.example.com/script.js?token=secret",
          effectiveDirective: "script-src-elem",
        },
      },
    ])
  );

  assert.deepEqual(result, {
    documentUri: "https://www.kabehub.com/",
    blockedUri: "https://cdn.example.com/script.js?token=secret",
    violatedDirective: "script-src-elem",
  });
});

test("parseCspReportBody rejects malformed and unsupported input", () => {
  assert.equal(
    parseCspReportBody("application/csp-report", "{not-json"),
    null
  );
  assert.equal(parseCspReportBody("application/json", "{}"), null);
  assert.equal(
    parseCspReportBody(
      "application/reports+json",
      JSON.stringify([{ type: "deprecation", body: {} }])
    ),
    null
  );
});

test("sanitizeReportUrl preserves CSP non-URL values", () => {
  for (const value of ["inline", "eval", "data", "data:", "blob", "blob:"]) {
    assert.equal(sanitizeReportUrl(value), value);
  }
});

test("sanitizeReportUrl removes query and fragment from first-party URLs", () => {
  assert.equal(
    sanitizeReportUrl("https://www.kabehub.com/legal?token=secret#section"),
    "https://www.kabehub.com/legal"
  );
  assert.equal(
    sanitizeReportUrl("http://localhost:3000/explore?token=secret#section"),
    "http://localhost:3000/explore"
  );
});

test("sanitizeReportUrl redacts share and arena tokens", () => {
  assert.equal(
    sanitizeReportUrl(
      "https://www.kabehub.com/share/private-token?key=secret#fragment"
    ),
    "https://www.kabehub.com/share/[redacted]"
  );
  assert.equal(
    sanitizeReportUrl(
      "https://www.kabehub.com/arena/private-token/results?key=secret"
    ),
    "https://www.kabehub.com/arena/[redacted]/results"
  );
});

test("sanitizeReportUrl reduces external URLs to their origin", () => {
  assert.equal(
    sanitizeReportUrl("https://cdn.example.com/private/path?key=secret"),
    "https://cdn.example.com"
  );
  assert.equal(sanitizeReportUrl("not a URL"), undefined);
});

test("CSP report route returns 204 for malformed JSON", async () => {
  const response = await postCspReport(
    new Request("https://www.kabehub.com/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/csp-report" },
      body: "{not-json",
    })
  );

  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
});

test("CSP report route rejects declared oversized bodies without reading", async () => {
  let bodyWasRead = false;
  const response = await postCspReport({
    headers: new Headers({
      "content-length": String(32 * 1024 + 1),
      "content-type": "application/csp-report",
    }),
    async text() {
      bodyWasRead = true;
      return "{}";
    },
  });

  assert.equal(response.status, 204);
  assert.equal(bodyWasRead, false);
});

test("CSP report route logs only sanitized summary fields", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const response = await postCspReport(
      new Request("https://www.kabehub.com/api/csp-report", {
        method: "POST",
        headers: { "content-type": "application/csp-report" },
        body: JSON.stringify({
          "csp-report": {
            "document-uri":
              "https://www.kabehub.com/share/private-token?secret=1",
            "blocked-uri":
              "https://cdn.example.com/private/file.js?secret=1",
            "violated-directive": "script-src-elem",
            "original-policy": "must-not-be-logged",
          },
        }),
      })
    );

    assert.equal(response.status, 204);
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(warnings, [
    [
      "CSP violation",
      {
        documentUri: "https://www.kabehub.com/share/[redacted]",
        blockedUri: "https://cdn.example.com",
        violatedDirective: "script-src-elem",
      },
    ],
  ]);
});

pendingTests
  .reduce(
    (previous, { name, fn }) =>
      previous
        .then(fn)
        .then(() => console.log(`ok - ${name}`))
        .catch((error) => {
          console.error(`not ok - ${name}`);
          throw error;
        }),
    Promise.resolve()
  )
  .then(() => console.log(`${pendingTests.length} CSP tests passed`))
  .catch(() => {
    process.exitCode = 1;
  });
