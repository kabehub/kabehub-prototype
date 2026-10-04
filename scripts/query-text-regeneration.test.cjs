const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
require("./testBootstrap.cjs").installTsLoader();
const { createQueryTextRetention } = require("../lib/queryTextRetention.ts");
const { buildMessageWithTextFiles, replaceQueryText } = require("../lib/attachmentContent.ts");
const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const page = read("app/page.tsx");
const panel = read("components/ChatPanel.tsx");
const bubble = read("components/MessageBubble.tsx");
const files = [{ name: "a.csv", content: "a,b\r\n1,2" }, { name: "b.md", content: "```\n前回の話" }];

// Execute the actual page callback with mocked I/O, rather than duplicating its logic.
function callback(name, context) {
  const start = page.indexOf(`const ${name} = useCallback(`);
  assert.ok(start >= 0);
  const end = page.indexOf("}, [", start);
  const source = page.slice(start, end + 1).replace(`const ${name} = useCallback(`, "globalThis.handler = ") + ";";
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2018 } }).outputText, context);
  return context.handler;
}
function setup(query = "raw", options = {}) {
  const user = { id: "u", role: "user", provider: "user", content: buildMessageWithTextFiles(query, files).content };
  const assistant = { id: "a", role: "assistant", provider: "claude", content: "answer" };
  const retention = createQueryTextRetention();
  if (!options.missing) retention.remember(user.id, query, user.content);
  if (options.changed) user.content += " masked";
  const events = [];
  const bodies = [];
  let returnedUser;
  const context = {
    retention, replaceQueryText, isLoading: false, activeThreadId: "t", activeThread: {}, messages: [user, assistant],
    crypto: { randomUUID: () => "branch" }, uuidv4: () => "new-thread", provider: "claude", isTemporary: false,
    isImagePinned: false, imageContextId: null, loadModel: () => "model", temporaryMessages: [],
    setIsLoading() {}, setStreamingContent() {}, setGithubProgressMessages() {}, setThinkingContents() {},
    setInputValue() {}, setImageContextId() {}, setMessages() {}, fetchThreads: async () => {},
    getApiKeyHeaders: async () => ({}), console: { error() {} },
    showToast: (text) => events.push(["toast", text]),
    fetch: async (url, init) => {
      events.push([init?.method ?? "GET", url]);
      return { ok: true, json: async () => [user, assistant] };
    },
    fetchWithStreaming: async (url, headers, body) => {
      events.push(["stream", url]);
      const parsed = JSON.parse(body);
      bodies.push(parsed);
      if (options.throw) throw new Error("stream failure");
      returnedUser = { ...user, id: options.noId ? "" : "returned-u", content: options.mismatch ? "mismatch" : parsed.userContent };
      return { userMessage: returnedUser, assistantMessage: assistant, aborted: options.aborted ?? false };
    },
  };
  return { context, retention, user, assistant, events, bodies, returned: () => returnedUser };
}

test("resolver is page-owned and wired to ChatPanel; callback signatures forward raw edits", () => {
  assert.match(page, /useState\(\(\) => createQueryTextRetention\(\)\)/);
  assert.match(page, /getRetainedQueryText = useCallback\(\(m: Message\) => retention\.get\(m\), \[\]\)/);
  assert.match(page, /getRetainedQueryText=\{getRetainedQueryText\}/);
  assert.match(panel, /getRetainedQueryText\?: \(message: Message\) => string \| null/);
  assert.match(panel, /onEditAndRegenerate\(assistantOrUserMsg, editedContent, targetProvider, modelId, editedQueryText\)/);
  assert.match(panel, /onEditAndRegenerate\(visibleMessages\[i\], editedContent, targetProvider, modelId, editedQueryText\)/);
  for (const p of [panel, bubble, read("components/RoleplayBubble.tsx")]) {
    assert.match(p, /editedUserContent\?: string,\s*editedQueryText\?: string/);
  }
  assert.match(page, /typeof queryTextToSend === "string" \? \{ queryText: queryTextToSend \} : \{\}/);
  assert.doesNotMatch(read("lib/queryTextRetention.ts"), /localStorage|sessionStorage|console\.|react/);
});

for (const mode of ["branch", "light"]) {
  for (const query of ["raw ", ""]) {
    for (const button of [false, true]) {
      test(`normal ${mode} regeneration keeps ${JSON.stringify(query)} from ${button ? "latest DB button" : "message/menu"}`, async () => {
        const s = setup(query, { aborted: true });
        await callback("handleRegenerate", s.context)("claude", button ? undefined : s.assistant, undefined, mode);
        assert.equal(s.bodies[0].queryText, query);
        assert.equal(s.retention.get(s.user), query);
      });
    }
  }
  for (const reason of ["missing", "changed", "attachment-free"]) {
    test(`${mode} regeneration omits queryText for ${reason}`, async () => {
      const s = setup("raw", { [reason]: true });
      if (reason === "attachment-free") {
        s.user.content = "raw";
        s.retention.remember(s.user.id, "raw", s.user.content);
      }
      await callback("handleRegenerate", s.context)("claude", s.assistant, undefined, mode);
      assert.equal(Object.hasOwn(s.bodies[0], "queryText"), false);
    });
  }
}

test("full-content edits omit queryText even with retained input", async () => {
  let s = setup();
  await callback("handleRegenerate", s.context)("claude", s.assistant, undefined, "light", "full edit");
  assert.equal(s.bodies[0].userContent, "full edit");
  assert.equal(Object.hasOwn(s.bodies[0], "queryText"), false);
  s = setup();
  await callback("handleEditAndRegenerate", s.context)(s.user, "full edit", "claude");
  assert.equal(s.bodies[0].userContent, "full edit");
  assert.equal(Object.hasOwn(s.bodies[0], "queryText"), false);
});

for (const aborted of [false, true]) {
  for (const edited of ["edited", ""]) {
    test(`light raw edit reconstructs and retains, aborted=${aborted}, edited=${JSON.stringify(edited)}`, async () => {
      const s = setup("raw", { aborted });
      await callback("handleRegenerate", s.context)("claude", s.assistant, undefined, "light", "ignored full content", edited);
      const expected = buildMessageWithTextFiles(edited, files).content;
      assert.equal(s.bodies[0].userContent, expected);
      assert.equal(s.bodies[0].queryText, edited);
      assert.equal(s.retention.get({ ...s.user, content: expected }), edited);
    });
    test(`branch raw edit reconstructs and retains committed user, aborted=${aborted}, edited=${JSON.stringify(edited)}`, async () => {
      const s = setup("raw", { aborted });
      await callback("handleEditAndRegenerate", s.context)(s.user, "ignored", "claude", undefined, edited);
      assert.equal(s.bodies[0].userContent, buildMessageWithTextFiles(edited, files).content);
      assert.equal(s.bodies[0].queryText, edited);
      assert.equal(s.retention.get(s.returned()), edited);
    });
  }
}

for (const reason of ["missing", "changed", "invalid-fence"]) {
  for (const kind of ["regenerate", "branch-edit"]) {
    test(`${kind} raw edit fails before PATCH/stream/RPC for ${reason}`, async () => {
      const s = setup("raw", { [reason]: true });
      if (reason === "invalid-fence") {
        s.user.content = "raw\n\nnot fenced";
        s.retention.remember(s.user.id, "raw", s.user.content);
      }
      if (kind === "regenerate") await callback("handleRegenerate", s.context)("claude", s.assistant, undefined, "branch", undefined, "edit");
      else await callback("handleEditAndRegenerate", s.context)(s.user, "", "claude", undefined, "edit");
      assert.deepEqual(s.events, [["toast", "編集内容を適用できませんでした"]]);
      assert.equal(s.bodies.length, 0);
    });
  }
}

for (const reason of ["throw", "mismatch", "noId"]) {
  test(`branch edit does not remember ${reason} result`, async () => {
    const s = setup("raw", { [reason]: true });
    await callback("handleEditAndRegenerate", s.context)(s.user, "", "claude", undefined, "edit");
    assert.equal(s.retention.get({ id: "returned-u", content: buildMessageWithTextFiles("edit", files).content }), null);
    assert.equal(s.retention.get(s.user), "raw");
  });
}

for (const aborted of [false, true]) {
  test(`normal submit retains only non-aborted input, aborted=${aborted}`, async () => {
    const s = setup("raw", { missing: true, aborted });
    await callback("handleSubmit", s.context)(s.user.content, undefined, undefined, false, "raw");
    assert.equal(s.retention.get(s.returned()), aborted ? null : "raw");
    assert.equal(s.bodies[0].queryText, "raw");
  });
}

test("light and branch resolve different users with intervening memo; user bubble resolves itself", () => {
  const retained = createQueryTextRetention();
  const user = { id: "u", role: "user", provider: "user", content: buildMessageWithTextFiles("user", files).content };
  const memo = { id: "m", role: "user", provider: "memo", content: buildMessageWithTextFiles("memo", files).content };
  const assistant = { id: "a", role: "assistant" };
  retained.remember(user.id, "user", user.content);
  retained.remember(memo.id, "memo", memo.content);
  const resolve = (prop, msg) => {
    const start = panel.indexOf(`${prop}={(() => {`);
    const end = panel.indexOf("})()}", start);
    const expression = panel.slice(start + prop.length + 2, end + 4);
    return vm.runInNewContext(expression, { msg, orderedMessages: [user, memo, assistant], visibleMessages: [user, memo, assistant], getRetainedQueryText: (m) => retained.get(m) });
  };
  assert.equal(resolve("lightEditQueryText", assistant), "memo");
  assert.equal(resolve("branchEditQueryText", assistant), "user");
  assert.equal(resolve("branchEditQueryText", user), "user");
  assert.equal(resolve("lightEditQueryText", user), null);
});

test("modal uses mode-specific raw input, permits empty raw edits and trims only edits", () => {
  assert.match(bubble, /mode === "light" \? lightEditQueryText : branchEditQueryText/);
  assert.match(bubble, /setEditRegenRawMode\(typeof queryText === "string"\)/);
  assert.match(bubble, /setEditRegenContent\(typeof queryText === "string" \? queryText : initialContent\)/);
  assert.match(bubble, /if \(!editRegenRawMode && !editRegenContent\.trim\(\)\) return/);
  assert.match(bubble, /disabled=\{!editRegenRawMode && !editRegenContent\.trim\(\)\}/);
  assert.match(bubble, /onRegenerate\(editRegenProvider, message, editRegenModelId, "light", undefined, editRegenContent\.trim\(\)\)/);
  assert.match(bubble, /onEditAndRegenerate\(target, "", editRegenProvider, editRegenModelId, editRegenContent\.trim\(\)\)/);
  assert.equal(bubble.split("添付テキストファイルの内容はそのまま引き継がれます").length - 1, 1);
});
