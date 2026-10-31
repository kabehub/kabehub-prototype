const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Execute the real callback, including catches/finally, with controlled asynchronous I/O.
function extractCallback(ast, name, context) {
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) {
      expression = (ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer).getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!expression) throw new Error(`Missing callback ${name}`);
  const compiled = ts.transpileModule(`globalThis.handler = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2018 },
  }).outputText;
  vm.runInNewContext(compiled, context);
  return context.handler;
}
const GUARDED_PAGE_CALLBACKS = new Set(['handleSubmit', 'handleRegenerate', 'handleEditAndRegenerate']);
function pageCallback(name, context) {
  if (GUARDED_PAGE_CALLBACKS.has(name)) {
    for (const key of ['resolveRichDisplay', 'richDisplayPreference']) {
      if (!Object.hasOwn(context, key)) throw new Error(`Missing VM context: ${key} for ${name}`);
    }
  }
  return extractCallback(ast, name, context);
}
function fileCallback(relativePath, name, context) {
  const file = path.join(__dirname, '..', relativePath);
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return extractCallback(ast, name, context);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
module.exports = { pageCallback, fileCallback, deferred, tick, source };
