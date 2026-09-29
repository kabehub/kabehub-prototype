const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

const USER = "user-1";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const TOPIC = "22222222-2222-4222-8222-222222222222";
const metadata = { source_topic_id: TOPIC, source_topic_key: "notes", source_project_id: PROJECT, source_revision: 2 };
let authenticated;
let loreRows;
let projects;
let projectsError;
let calls;

function query(table) {
  const state = { table, select: null, eq: [], is: [], in: [], order: [] };
  calls.push(state);
  const q = {
    select(value) { state.select = value; return q; },
    eq(key, value) { state.eq.push([key, value]); return q; },
    is(key, value) { state.is.push([key, value]); return q; },
    in(key, value) { state.in.push([key, value]); return q; },
    order(key, value) { state.order.push([key, value]); return q; },
    then(resolve, reject) {
      const result = table === "lore_embeddings"
        ? { data: loreRows.filter((row) => state.eq.every(([key, value]) => row[key] === value) && state.is.every(([key, value]) => row[key] === value)).map(({ id, metadata }) => ({ id, metadata })), error: null }
        : { data: projects.filter((project) => project.user_id === USER && state.in[0][1].includes(project.id)).map(({ id, name }) => ({ id, name })), error: projectsError };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return q;
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@/lib/supabase/route-auth") return {
    async requireRouteUser() {
      if (!authenticated) return { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
      return { ok: true, user: { id: USER }, supabase: { from: query }, finalizeJson: (payload, init) => Response.json(payload, init) };
    },
  };
  return originalLoad.call(this, request, parent, isMain);
};
installTsLoader();
installAliasResolver();
const route = require(path.join(__dirname, "..", "app", "api", "lore", "promotions", "route.ts"));
Module._load = originalLoad;

function reset() {
  authenticated = true;
  loreRows = [{ id: "lore-1", metadata, user_id: USER, source_type: "project_memory_promotion", superseded_by: null, is_archived: false }];
  projects = [{ id: PROJECT, name: "Project", user_id: USER }];
  projectsError = null;
  calls = [];
}
async function invoke() {
  const response = await route.GET(new Request("http://localhost/api/lore/promotions"));
  return { status: response.status, body: await response.json() };
}

test("requires authentication", async () => {
  reset(); authenticated = false;
  assert.equal((await invoke()).status, 401);
  assert.equal(calls.length, 0);
});

test("returns six fields, archived rows, ordered and scoped queries", async () => {
  reset(); loreRows[0].is_archived = true;
  const result = await invoke();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { promotions: [{ lore_id: "lore-1", ...metadata, project_name: "Project" }] });
  assert.equal(Object.keys(result.body.promotions[0]).length, 6);
  assert.deepEqual(calls[0].eq, [["user_id", USER], ["source_type", "project_memory_promotion"]]);
  assert.deepEqual(calls[0].is, [["superseded_by", null]]);
  assert.deepEqual(calls[0].order, [["created_at", { ascending: false }]]);
  assert.equal(calls[0].select, "id, metadata");
  assert.equal(calls[0].eq.some(([key]) => key === "is_archived"), false);
  assert.deepEqual(calls[1].eq, [["user_id", USER]]);
  assert.deepEqual(calls[1].in, [["id", [PROJECT]]]);
});

test("skips malformed metadata, foreign user and invalid project UUID", async () => {
  reset();
  loreRows.push({ ...loreRows[0], id: "bad", metadata: { ...metadata, source_project_id: "invalid" } });
  loreRows.push({ ...loreRows[0], id: "foreign", user_id: "other" });
  const result = await invoke();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.promotions.map((row) => row.lore_id), ["lore-1"]);
  assert.deepEqual(calls[1].in[0][1], [PROJECT]);
});

test("missing project has null name", async () => {
  reset(); projects = [];
  assert.equal((await invoke()).body.promotions[0].project_name, null);
});

test("zero valid rows skips projects query", async () => {
  reset(); loreRows = [];
  assert.deepEqual((await invoke()).body, { promotions: [] });
  assert.equal(calls.length, 1);
});

test("projects query error returns 500", async () => {
  reset(); projectsError = { message: "projects failed" };
  const result = await invoke();
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: "projects failed" });
});
