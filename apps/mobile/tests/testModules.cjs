const Module = require("node:module");
const path = require("node:path");

const { installTsLoader } = require("../../../scripts/testBootstrap.cjs");

installTsLoader();

function sourcePath(relativePath) {
  return path.resolve(__dirname, "..", relativePath);
}

function installMock(filename, exports) {
  const mockedModule = new Module(filename, module);
  mockedModule.filename = filename;
  mockedModule.paths = Module._nodeModulePaths(path.dirname(filename));
  mockedModule.exports = exports;
  mockedModule.loaded = true;
  require.cache[filename] = mockedModule;
}

module.exports = { installMock, sourcePath };
