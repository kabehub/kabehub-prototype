const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

// Deliberately a query-chain scanner, not a TS/JS AST parser. Each assertion is
// bound to a specific SELECT and its consuming branch, never a file-wide token.
function closeParen(source, start) {
  let depth = 0, quote = null;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if ('"\'`'.includes(c)) quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i + 1;
  }
  assert.fail("unclosed query method");
}
function queries(source, table) {
  const found = [];
  const from = /\.from\(\s*(?:(["'])([^"']+)\1|(config\.table|table))\s*\)/g;
  for (const match of source.matchAll(from)) {
    if ((match[2] ?? match[3]) !== table) continue;
    const methods = [];
    let end = match.index + match[0].length;
    while (true) {
      const next = /^\s*\.([a-zA-Z]+)\(/.exec(source.slice(end));
      if (!next) break;
      const start = end + next[0].length - 1;
      end = closeParen(source, start);
      methods.push({ name: next[1], args: source.slice(start + 1, end - 1), end });
    }
    if (methods[0]?.name === "select") found.push({ start: match.index, end, methods, text: source.slice(match.index, end) });
  }
  return found;
}
function method(query, name, args) {
  assert.ok(query, `missing SELECT for ${name}`);
  return query.methods.find(m => m.name === name && (!args || args.test(m.args)));
}
function live(query, joined = false) {
  const column = joined ? "threads\\.deleted_at" : "deleted_at";
  assert.ok(method(query, "is", new RegExp(`^["']${column}["']\\s*,\\s*null$`)), `unguarded SELECT: ${query?.text}`);
  if (joined) assert.match(query.methods[0].args, /threads!inner\(deleted_at\)/);
}
function before(query, first, last) {
  assert.ok(method(query, first)?.end < method(query, last)?.end, `${first} must precede ${last}: ${query.text}`);
}
function section(source, start, end) {
  const at = source.indexOf(start);
  assert.ok(at >= 0, `section exists: ${start}`);
  const stop = end ? source.indexOf(end, at + start.length) : source.length;
  assert.ok(stop >= at, `section ends: ${end}`);
  return source.slice(at, stop);
}
function get(file) {
  return read(file).split(/export async function (?:POST|PATCH|DELETE)\(/)[0];
}
function parentGate(source, table, variable, id, missing, childId = id) {
  const parents = queries(source, "threads");
  assert.equal(parents.length, 1);
  const parent = parents[0];
  live(parent);
  assert.ok(method(parent, "eq", new RegExp(`^["']id["']\\s*,\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)));
  const children = queries(source, table);
  assert.ok(children.length > 0, `child SELECT exists: ${table}`);
  for (const child of children) {
    assert.ok(parent.end < child.start);
    assert.ok(method(child, "eq", new RegExp(`^["']thread_id["']\\s*,\\s*${childId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)));
    const gate = source.slice(parent.end, child.start);
    assert.match(gate, new RegExp(`if \\([^\\n]*!${variable}\\b[^\\n]*\\)`));
    assert.ok(gate.includes(missing), "existing missing-ID response precedes child read");
  }
}

for (const file of ["app/api/threads/route.ts", "app/api/calendar/route.ts", "app/api/mcp/threads/route.ts"]) {
  test(`${file}: GET thread SELECT is live before ordering/limit`, () => {
    const selected = queries(get(file), "threads");
    assert.equal(selected.length, 1);
    live(selected[0]);
    before(selected[0], "is", "order");
  });
}

test("search: empty, both, title, message and final hydration are independently guarded", () => {
  const source = get("app/api/search/route.ts");
  const empty = section(source, "if (!query)", "const pattern");
  const both = section(source, 'if (target === "both")', '} else if (target === "title")');
  const title = section(source, '} else if (target === "title")', '} else if (target === "message")');
  const message = section(source, '} else if (target === "message")', "if (threadIds.size === 0)");
  const final = section(source, "if (threadIds.size === 0)");
  for (const branch of [empty, both, title, final]) {
    const q = queries(branch, "threads");
    assert.equal(q.length, 1);
    live(q[0]);
  }
  for (const branch of [both, message]) {
    const q = queries(branch, "messages");
    assert.equal(q.length, 1);
    live(q[0], true);
  }
  assert.match(final, /\.in\("id", Array\.from\(threadIds\)\)/);
  assert.match(final, /matchedMessageIds: matchedMsgMap\.get\(t\.id\)/);
});

test("summary input candidates are live; provenance reads remain unfiltered", () => {
  const bootstrap = section(read("lib/project-memory/auto-summary.ts"), "export async function selectAutoSummaryInput");
  const update = section(read("lib/project-memory/auto-summary-update.ts"), "export async function selectAutoSummaryUpdateInput", "export const AUTO_SUMMARY_UPDATE_SYSTEM_PROMPT");
  for (const source of [bootstrap, update]) {
    const q = queries(source, "threads");
    assert.equal(q.length, 1);
    live(q[0]);
    assert.match(source, /targetMessages\(db, userId, (?:thread\.id|state\.thread\.id)/);
    assert.match(source, /threads\.slice\(offset, offset \+ PREFLIGHT_CONCURRENCY\)/);
  }
  const provenance = section(read("lib/project-memory/auto-summary-update.ts"), "export async function loadAutoSummaryUpdateTopics", "type InputThread");
  assert.doesNotMatch(provenance, /deleted_at/);
  assert.equal(queries(provenance, "threads").length, 1);
  assert.match(provenance, /\.select\("id, project_id, user_id"\)/);
});

test("popular/trending service-role SELECT filters before limit; enrichments use its IDs", () => {
  const source = get("app/api/explore/route.ts");
  const popular = section(source, 'if (sort === "popular" || sort === "trending")', 'let dbQuery = supabase');
  const q = queries(popular, "threads");
  assert.equal(q.length, 1);
  live(q[0]);
  before(q[0], "is", "limit");
  assert.match(popular, /serviceRoleClient\(\)/);
  assert.match(source, /threadIds = items\.map\(\(t\) => t\.id\)/);
  for (const table of ["messages", "thread_tags", "likes"]) {
    const children = queries(source, table);
    assert.equal(children.length, 1);
    assert.ok(method(children[0], "in", /^"thread_id", threadIds$/));
  }
});

for (const [file, table, id, variable, missing, childId] of [
  ["app/api/threads/[id]/messages/route.ts", "messages", "params.id", "thread", "return finalizeJson([]);"],
  ["app/api/threads/[id]/tags/route.ts", "thread_tags", "params.id", "thread", "return finalizeJson([]);"],
  ["lib/threadResourceCrud.ts", "config.table", "params.id", "thread", "return finalizeJson([]);"],
  ["app/api/extract-settings/route.ts", "novel_settings", "thread_id", "thread", "return finalizeJson({ characters: [], factions: [], glossary: [] })"],
  ["app/api/mcp/threads/[id]/messages/route.ts", "messages", "params.id", "thread", "return NextResponse.json({ error: 'Not found' }, { status: 404 })"],
  ["app/api/threads/[id]/copy/route.ts", "messages", "sourceThreadId", "sourceThread", "return finalizeJson({ error: 'Thread not found' }, { status: 404 })"],
  ["app/api/threads/[id]/branch-to/route.ts", "messages", "sourceThreadId", "sourceThread", "return finalizeJson({ error: 'Thread not found' }, { status: 404 })"],
]) {
  test(`${file}: live parent gates the child SELECT with the existing missing response`, () => {
    parentGate(file.includes("copy/") || file.includes("branch-to/") ? read(file) : get(file), table, variable, id, missing, childId);
  });
}

test("share and fork gate every source messages SELECT before returning/copying", () => {
  for (const file of ["app/api/share/[token]/route.ts", "app/api/share/[token]/fork/route.ts"]) {
    const source = read(file);
    const parent = queries(source, "threads");
    assert.equal(parent.length, 1);
    live(parent[0]);
    assert.ok(method(parent[0], "eq", /^"share_token", params\.token$/));
    const children = queries(source, "messages");
    assert.equal(children.length, file.includes("fork/") ? 2 : 1);
    for (const child of children) {
      assert.ok(parent[0].end < child.start);
      assert.match(source.slice(parent[0].end, child.start), /if \(threadError \|\| !(?:sourceThread|thread) \|\| !(?:sourceThread|thread)\.is_public\)/);
      assert.match(source.slice(parent[0].end, child.start), /\{ error: "Not Found" \}, \{ status: 404 \}/);
      assert.ok(method(child, "eq", /^"thread_id", (?:sourceThread|thread)\.id$/));
    }
  }
});

test("all threadResourceCrud callers export its protected GET", () => {
  const callers = [];
  function walk(dir) {
    for (const item of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = `${dir}/${item.name}`;
      if (item.isDirectory()) walk(file);
      else if (item.name === "route.ts" && read(file).includes("createThreadResourceHandlers")) callers.push(file);
    }
  }
  walk("app/api");
  assert.deepEqual(callers.sort(), ["drafts", "message-notes", "notes"].map(name => `app/api/threads/[id]/${name}/route.ts`).sort());
  for (const [name, table] of [["notes", "thread_notes"], ["message-notes", "message_notes"], ["drafts", "drafts"]]) {
    const source = read(`app/api/threads/[id]/${name}/route.ts`);
    assert.match(source, new RegExp(`createThreadResourceHandlers\\(\\{\\s*table: "${table}"`));
    assert.match(source, /export const GET = handlers\.GET;/);
  }
});

test("tags retain public live-parent fallback despite owner-only raw threads RLS", () => {
  const source = get("app/api/threads/[id]/tags/route.ts");
  const fallback = section(source, "if (!thread) {", 'const { data, error } = await supabase');
  const q = queries(fallback, "public_threads_view");
  assert.equal(q.length, 1);
  assert.ok(method(q[0], "eq", /^"id", params\.id$/));
  assert.match(fallback, /if \(!publicThread\) return finalizeJson\(\[\]\);/);
  assert.match(fallback, /if \(publicError\) return finalizeJson\(\{ error: publicError\.message \}, \{ status: 500 \}\)/);
});

function albumGuard(source) {
  const q = queries(source, "messages");
  assert.equal(q.length, 1);
  live(q[0], true);
  before(q[0], "is", "range");
  assert.match(q[0].methods[0].args, /count: "exact"/);
  assert.ok(q[0].end < source.indexOf(".createSignedUrls("));
  assert.match(source, /const \{ threads: _thread, \.\.\.message \} = m;/);
  assert.match(source, /return \{\s*\.\.\.message,/);
  assert.doesNotMatch(source, /\.\.\.m,/);
}
test("album filters the counted/paginated SELECT and signs only those rows; no join field escapes", () => {
  albumGuard(get("app/api/album/route.ts"));
  assert.match(read("docs/schema.sql"), /create table if not exists messages\s*\([\s\S]*?thread_id\s+uuid not null references threads\(id\)/);
});

test("batch-train inputs use a live-parent join before limit", () => {
  const source = section(read("lib/lore/batchTrain.ts"), "async function fetchTargetMessages", "async function fetchCorrectionExamples");
  const q = queries(source, "messages");
  assert.equal(q.length, 1);
  live(q[0], true);
  before(q[0], "is", "limit");
});

test("additional reuse inputs are guarded at their individual SELECTs", () => {
  for (const [file, expected] of [["app/api/chat/route.ts", 4], ["app/api/image-gen/route.ts", 1]]) {
    const q = queries(read(file), "messages").filter(q => q.methods[0].args.includes("threads!inner"));
    assert.equal(q.length, expected);
    const columns = file.includes("chat/") ? ["id, content, model_id", "id, content", "role, content, provider", "content, metadata"] : ["metadata"];
    for (const column of columns) {
      const query = q.find(q => q.methods[0].args.slice(1).startsWith(`${column}, threads!inner`));
      live(query, true);
    }
  }
  const like = read("app/api/lore/like/route.ts");
  const parent = queries(like, "threads");
  assert.equal(parent.length, 1);
  live(parent[0]);
  assert.ok(method(parent[0], "eq", /^"id", message\.thread_id$/));
  const embedding = like.indexOf("embedding = await createEmbedding");
  assert.ok(parent[0].end < embedding);
  assert.match(like.slice(parent[0].end, embedding), /if \(!thread\)\s*return finalizeJson\(\{ error: "Message not found" \}, \{ status: 404 \}\)/);
});

test("bulk export establishes all live owned IDs, then scopes and pages every child table", () => {
  const source = section(read("app/settings/page.tsx"), "const handleBulkExport =", "const dateStr = exportedAt");
  const parents = queries(source, "threads");
  assert.equal(parents.length, 1);
  live(parents[0]);
  before(parents[0], "is", "range");
  assert.match(source, /if \(threadsError\) throw new Error\(threadsError\.message\)/);
  assert.match(source, /liveThreadIds = threads\.map\(thread => thread\.id\)/);
  const children = queries(source, "table");
  assert.equal(children.length, 1);
  assert.ok(method(children[0], "in", /^"thread_id", ids$/));
  before(children[0], "in", "range");
  assert.match(source, /offset < liveThreadIds\.length; offset \+= 100/);
  assert.match(source, /ids = liveThreadIds\.slice\(offset, offset \+ 100\)/);
  for (const [table, key] of [["messages", "messages"], ["thread_tags", "tags"], ["thread_notes", "notes"], ["message_notes", "messageNotes"], ["drafts", "drafts"]]) {
    assert.ok(source.includes(`readChildren<BulkExportRawData["${key}"][number]>("${table}")`));
    assert.equal(queries(source, table).length, 0, "no independent unscoped child SELECT");
  }
  assert.match(source, /const pageSize = 500/);
  assert.match(source, /for \(let from = 0; ; from \+= pageSize\)/);
  assert.match(source, /await query\(from, from \+ pageSize - 1\)/);
  assert.match(source, /data\.push\(\.\.\.\(page\.data \?\? \[\]\)\)/);
  assert.match(source, /if \(\(page\.data\?\.length \?\? 0\) < pageSize\) return/);
  assert.match(source, /supabase\.from\("profiles"\)\.select\("\*"\)\.eq\("id", userId\)/);
  // Likes on other people's public threads must survive; all fetched likes and
  // the public-ID lookup are paged before this response-only filter is applied.
  const likes = queries(source, "likes");
  assert.equal(likes.length, 1);
  assert.ok(method(likes[0], "range"));
  assert.ok(!method(likes[0], "in"), "not restricted to owned thread IDs");
  const publicIds = queries(source, "public_threads_view");
  assert.equal(publicIds.length, 1);
  assert.ok(method(publicIds[0], "in", /^"id", ids$/));
  assert.ok(method(publicIds[0], "range"));
  assert.match(source, /liveLikedThreadIds = new Set\(liveThreadIds\)/);
  assert.match(source, /likedThreadIds = \[\.\.\.new Set\(likes\.map\(like => like\.thread_id\)\)\]/);
  assert.match(source, /visible\.data\.forEach\(thread => liveLikedThreadIds\.add\(thread\.id\)\)/);
  assert.match(source, /liveLikes = likes\.filter\(like => liveLikedThreadIds\.has\(like\.thread_id\)\)/);
  assert.match(source, /likes: liveLikes,/);
});

// Route AND reason are explicit: never exempt a whole file that also has inputs.
const exemptions = [
  { file: "lib/project-memory/auto-summary-update.ts", route: "loadAutoSummaryUpdateTopics: historical provenance SELECTs", reason: "Preserve historical project/user consistency; trash alone must not cause provenance_mismatch." },
  { file: "app/api/stats/route.ts", route: "GET /api/stats: messages + ai_usage_events", reason: "Retain usage and billing history together, including legacy fallback." },
  { file: "app/api/arena/route.ts", route: "POST /api/arena: ensureArenaThread lookup + conflict recheck", reason: "Phase 2b must reject trash explicitly without attempting same-ID INSERT." },
];
test("exemptions are scoped to their read purpose, not entire filenames", () => {
  for (const entry of exemptions) assert.ok(entry.file && entry.route && entry.reason);
  const stats = get(exemptions[1].file);
  assert.equal(queries(stats, "messages").length, 1);
  assert.equal(queries(stats, "ai_usage_events").length, 1);
  assert.doesNotMatch(stats, /deleted_at|threads!inner/);
  const arena = section(read(exemptions[2].file), "async function ensureArenaThread", "async function compensateCreatedArenaThread");
  assert.equal(queries(arena, "threads").length, 2);
  assert.doesNotMatch(arena, /deleted_at/);
});

test("arena display/history/metadata entrances use protected thread/share reads", () => {
  const arena = read("app/arena/[token]/page.tsx");
  assert.match(arena, /fetch\(`\$\{baseUrl\}\/api\/share\/\$\{token\}`/);
  assert.equal((arena.match(/await fetchArenaData\(params\.token\)/g) ?? []).length, 2);
  assert.match(read("app/threads/[id]/tree/page.tsx"), /\/api\/threads\/\$\{encodeURIComponent\(threadId\)\}\/messages/);
  assert.equal(queries(read("app/arena/page.tsx"), "messages").length, 0);
});

test("negative fixtures detect removed/misplaced guards, both quote styles and unrelated guards", () => {
  for (const quote of ['"', "'"]) {
    const guarded = `db.from(${quote}threads${quote}).select(${quote}id${quote}).is(${quote}deleted_at${quote}, null).limit(20)`;
    live(queries(guarded, "threads")[0]);
    assert.throws(() => live(queries(guarded.replace(/\.is\([^)]*\)/, ""), "threads")[0]));
    const decoy = `${guarded}; db.from(${quote}threads${quote}).select(${quote}title${quote}).limit(20)`;
    assert.throws(() => queries(decoy, "threads").forEach(q => live(q)));
  }
  const album = get("app/api/album/route.ts");
  assert.throws(() => albumGuard(album.replace('.is("threads.deleted_at", null)', "")));
  assert.throws(() => albumGuard(album.replace('.is("threads.deleted_at", null)', "").replace('.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)', '.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1).is("threads.deleted_at", null)')));
  assert.throws(() => albumGuard(album.replace("...message,", "...m,")));
  const child = get("app/api/threads/[id]/messages/route.ts");
  assert.throws(() => parentGate(child.replace("if (!thread) return finalizeJson([]);", ""), "messages", "thread", "params.id", "return finalizeJson([]);"));
  assert.throws(() => parentGate(child.replace('.is("deleted_at", null)', ""), "messages", "thread", "params.id", "return finalizeJson([]);"));
});
