const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Execute the real callback, including catches/finally, with controlled asynchronous I/O.
function pageCallback(name, context) {
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && ts.isCallExpression(node.initializer)) {
      expression = node.initializer.arguments[0].getText(ast);
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
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
module.exports = { pageCallback, deferred, tick, source };
