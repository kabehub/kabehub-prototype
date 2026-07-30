const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const rootDir = path.resolve(__dirname, "..");

function installAliasResolver() {
  const originalResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function resolveFilename(
    request,
    parent,
    isMain,
    options
  ) {
    if (request.startsWith("@/")) {
      request = path.join(rootDir, request.slice(2));
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}

function installTsLoader(options = {}) {
  const { jsx = false, transformOutput } = options;

  function compileTypescript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    let output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2018,
        esModuleInterop: true,
        ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
      },
      fileName: filename,
    }).outputText;

    if (transformOutput) {
      output = transformOutput(output, filename);
    }
    module._compile(output, filename);
  }

  require.extensions[".ts"] = compileTypescript;
  if (jsx) {
    require.extensions[".tsx"] = compileTypescript;
  }
}

module.exports = { installAliasResolver, installTsLoader };
