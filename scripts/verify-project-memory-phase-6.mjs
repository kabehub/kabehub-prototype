// Default: test only. Run against a server containing the current route code.
// Catalog checks require PHASE_6_SUPABASE_ACCESS_TOKEN (or SUPABASE_ACCESS_TOKEN).
// Fixture checks require PHASE_6_API_BASE_URL (or API_BASE_URL) and OPENAI_API_KEY.
// Production catalog only: set PHASE_6_ENV_FILE and PHASE_6_EXPECTED_PROJECT_REF,
// then run with --postflight-only. Fixture modes are always test-only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "jvarrlsqttfjiysaedlg";
const EMBEDDING = [1, ...Array.from({ length: 1535 }, () => 0)];

const POSTFLIGHT_QUERY = `
with function_rows as (
  select
    'function'::text as kind,
    p.proname::text as object_name,
    pg_get_function_identity_arguments(p.oid)::text as args,
    p.prosecdef,
    p.proconfig,
    has_function_privilege(
      'authenticated',
      p.oid,
      'EXECUTE'
    ) as authenticated_ok,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_ok,
    null::text as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'promote_project_memory_topic_to_lore',
      'match_lore_embeddings_by_project'
    )
), index_rows as (
  select
    'index'::text as kind,
    indexrelid::regclass::text as object_name,
    null::text as args,
    null::boolean as prosecdef,
    null::text[] as proconfig,
    null::boolean as authenticated_ok,
    null::boolean as anon_ok,
    pg_get_indexdef(indexrelid)::text as definition
  from pg_index
  where indexrelid in (
    'public.idx_lore_embeddings_promotion_source_revision'::regclass,
    'public.idx_lore_embeddings_promotion_active_by_topic'::regclass
  )
)
select * from function_rows
union all
select * from index_rows
order by kind, object_name;
`;

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizeSql(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function expectNoError(error, context) {
  if (error) {
    throw new Error(`${context}: ${error.code ?? "unknown"} ${error.message}`);
  }
}

let passed = 0;
let failures = 0;
function pass(label, details = {}) {
  passed += 1;
  console.log(`[PASS] ${label} ${JSON.stringify(details)}`);
}

function fail(label, error) {
  failures += 1;
  console.error(`[FAIL] ${label} ${JSON.stringify({
    message: error instanceof Error ? error.message : String(error),
  })}`);
}

async function checkPostflight(projectRef) {
  const accessToken =
    process.env.PHASE_6_SUPABASE_ACCESS_TOKEN ??
    process.env.SUPABASE_ACCESS_TOKEN;
  assert.ok(
    accessToken,
    "PHASE_6_SUPABASE_ACCESS_TOKEN or SUPABASE_ACCESS_TOKEN is required",
  );

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: POSTFLIGHT_QUERY }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  assert.ok(response.ok, `Management SQL HTTP ${response.status}`);
  const result = await response.json();
  const rows = Array.isArray(result) ? result : result?.data;
  console.log(`[RAW POSTFLIGHT] ${JSON.stringify(rows)}`);
  assert.equal(rows?.length, 4, "postflight must return two functions and two indexes");

  const promotion = rows.find(
    (row) => row.kind === "function" &&
      row.object_name === "promote_project_memory_topic_to_lore",
  );
  assert.ok(promotion, "promotion RPC catalog row");
  assert.equal(promotion.args, "p_user_id uuid, p_topic_id uuid, p_expected_revision integer, p_embedding vector");
  assert.equal(promotion.prosecdef, true);
  assert.ok(
    promotion.proconfig?.includes("search_path=\"\"") ||
      promotion.proconfig?.includes("search_path="),
    "promotion RPC must have empty search_path",
  );
  assert.equal(promotion.authenticated_ok, true);
  assert.equal(promotion.anon_ok, false);
  pass("promotion RPC signature, SECURITY DEFINER, search_path and ACL", promotion);

  const search = rows.find(
    (row) => row.kind === "function" &&
      row.object_name === "match_lore_embeddings_by_project",
  );
  assert.ok(search, "Lore Book search catalog row");
  assert.equal(search.args, "query_embedding vector, match_project_id uuid, match_user_id uuid, match_count integer");
  assert.equal(search.authenticated_ok, true);
  assert.equal(search.anon_ok, false);
  pass("Lore Book search signature and ACL", search);

  const uniqueIndex = normalizeSql(rows.find(
    (row) => row.object_name.endsWith("idx_lore_embeddings_promotion_source_revision"),
  )?.definition ?? "");
  assert.match(uniqueIndex, /^create unique index/);
  assert.match(uniqueIndex, /user_id/);
  assert.match(uniqueIndex, /\(metadata ->> 'source_topic_id'/);
  assert.match(uniqueIndex, /\(metadata ->> 'source_revision'/);
  assert.match(uniqueIndex, /where \(source_type = 'project_memory_promotion'/);
  pass("promotion source/revision index definition", { definition: uniqueIndex });

  const activeIndex = normalizeSql(rows.find(
    (row) => row.object_name.endsWith("idx_lore_embeddings_promotion_active_by_topic"),
  )?.definition ?? "");
  assert.match(activeIndex, /^create index/);
  assert.doesNotMatch(activeIndex, /^create unique index/);
  assert.match(activeIndex, /\(metadata ->> 'source_topic_id'/);
  assert.match(activeIndex, /source_type = 'project_memory_promotion'/);
  assert.match(activeIndex, /is_archived = false/);
  assert.match(activeIndex, /superseded_by is null/);
  pass("promotion active-by-topic index definition", { definition: activeIndex });

  return rows;
}

async function verifyFixtures(supabaseUrl) {
  const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const openaiKey = required("OPENAI_API_KEY");
  const apiBase = (
    process.env.PHASE_6_API_BASE_URL ?? required("API_BASE_URL")
  ).replace(/\/$/, "");
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const service = createClient(supabaseUrl, serviceRoleKey, options);
  const createdUserIds = [];
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `Phase6-${randomUUID()}-aA1!`;

  async function createUser(label) {
    const email = `phase-6-${label}-${suffix}@example.invalid`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expectNoError(error, `create user ${label}`);
    assert.ok(data.user?.id);
    createdUserIds.push(data.user.id);
    return { id: data.user.id, email };
  }

  async function signIn(user) {
    const client = createClient(supabaseUrl, anonKey, options);
    const { data, error } = await client.auth.signInWithPassword({
      email: user.email,
      password,
    });
    expectNoError(error, `sign in ${user.email}`);
    assert.ok(data.session?.access_token);
    return {
      token: data.session.access_token,
      client: createClient(supabaseUrl, anonKey, {
        ...options,
        global: {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        },
      }),
    };
  }

  async function createProject(userId, label) {
    const { data, error } = await service
      .from("projects")
      .insert({ user_id: userId, name: `phase-6-${label}-${suffix}` })
      .select("id")
      .single();
    expectNoError(error, `create project ${label}`);
    return data.id;
  }

  async function createTopic(client, userId, projectId, key, content) {
    const { data, error } = await client
      .rpc("create_project_memory_topic", {
        p_user_id: userId,
        p_project_id: projectId,
        p_topic_key: `${key}-${suffix}`,
        p_content_md: content,
        p_source_refs: [],
      })
      .single();
    expectNoError(error, `create topic ${key}`);
    return { id: data.topic_id, revision: data.revision };
  }

  async function requestJson(path, token, openaiApiKey, body, method = "POST") {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-openai-api-key": openaiApiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await response.json();
    console.log(`[RAW HTTP] ${method} ${path} ${response.status} ${JSON.stringify(payload)}`);
    return { status: response.status, payload };
  }

  async function promote(projectId, topicId, token, revision, key = openaiKey) {
    return requestJson(
      `/api/projects/${projectId}/memory/topics/${topicId}/promote`,
      token,
      key,
      { expected_revision: revision },
    );
  }

  async function promotionRows(userId, topicId) {
    const { data, error } = await service
      .from("lore_embeddings")
      .select("id,user_id,project_id,chunk_text,is_archived,superseded_by,source_type,metadata")
      .eq("user_id", userId)
      .eq("source_type", "project_memory_promotion")
      .contains("metadata", { source_topic_id: topicId })
      .order("created_at", { ascending: true });
    expectNoError(error, `read promotion rows ${topicId}`);
    console.log(`[RAW LORE] ${JSON.stringify(data)}`);
    return data;
  }

  try {
    const userA = await createUser("a");
    const userB = await createUser("b");
    const authA = await signIn(userA);
    const authB = await signIn(userB);
    const projectA = await createProject(userA.id, "a");
    const projectB = await createProject(userB.id, "b");

    const oldContent = `phase-6-old-${suffix}`;
    const topic = await createTopic(
      authA.client,
      userA.id,
      projectA,
      "sequential",
      oldContent,
    );
    const first = await promote(projectA, topic.id, authA.token, 1);
    const second = await promote(projectA, topic.id, authA.token, 1);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.payload.created, true);
    assert.equal(second.payload.created, false);
    assert.equal(second.payload.lore_id, first.payload.lore_id);
    assert.equal((await promotionRows(userA.id, topic.id)).length, 1);
    pass("sequential POST idempotency", { lore_id: first.payload.lore_id });

    const [metadataRow] = await promotionRows(userA.id, topic.id);
    assert.equal(metadataRow.project_id, projectA);
    assert.deepEqual(metadataRow.metadata, {
      source_topic_id: topic.id,
      source_topic_key: `sequential-${suffix}`,
      source_project_id: projectA,
      source_revision: 1,
    });
    pass("promotion metadata provenance", metadataRow.metadata);

    const parallelTopic = await createTopic(
      authA.client,
      userA.id,
      projectA,
      "parallel",
      `phase-6-parallel-${suffix}`,
    );
    const parallelArgs = {
      p_user_id: userA.id,
      p_topic_id: parallelTopic.id,
      p_expected_revision: 1,
      p_embedding: EMBEDDING,
    };
    const parallel = await Promise.all([
      authA.client.rpc("promote_project_memory_topic_to_lore", parallelArgs).single(),
      authA.client.rpc("promote_project_memory_topic_to_lore", parallelArgs).single(),
    ]);
    console.log(`[RAW PARALLEL RPC] ${JSON.stringify(parallel)}`);
    for (const result of parallel) expectNoError(result.error, "parallel promotion");
    assert.equal(parallel[0].data.lore_id, parallel[1].data.lore_id);
    assert.deepEqual(
      parallel.map((result) => result.data.created).sort(),
      [false, true],
    );
    assert.equal((await promotionRows(userA.id, parallelTopic.id)).length, 1);
    pass("parallel RPC idempotency", { lore_id: parallel[0].data.lore_id });

    const newContent = `phase-6-new-${suffix}`;
    const patched = await requestJson(
      `/api/projects/${projectA}/memory/topics/${topic.id}`,
      authA.token,
      openaiKey,
      {
        expected_revision: 1,
        edit_kind: "full",
        new_content_md: newContent,
      },
      "PATCH",
    );
    assert.equal(patched.status, 200);
    assert.equal(patched.payload.topic.revision, 2);
    const promotedV2 = await promote(projectA, topic.id, authA.token, 2);
    assert.equal(promotedV2.status, 200);
    assert.equal(promotedV2.payload.created, true);

    const supersededRows = await promotionRows(userA.id, topic.id);
    assert.equal(supersededRows.length, 2);
    const oldRow = supersededRows.find((row) => row.id === first.payload.lore_id);
    const newRow = supersededRows.find((row) => row.id === promotedV2.payload.lore_id);
    assert.equal(oldRow.is_archived, true);
    assert.equal(oldRow.superseded_by, newRow.id);
    assert.equal(newRow.is_archived, false);
    assert.equal(newRow.superseded_by, null);
    pass("new revision supersedes old promotion", {
      old_id: oldRow.id,
      new_id: newRow.id,
    });

    const { data: legacySearch, error: legacySearchError } = await authA.client.rpc(
      "match_lore_embeddings_by_project",
      {
        query_embedding: EMBEDDING,
        match_project_id: projectA,
        match_user_id: userA.id,
        match_count: 100,
      },
    );
    expectNoError(legacySearchError, "legacy Lore Book search");
    console.log(`[RAW LEGACY SEARCH] ${JSON.stringify(legacySearch)}`);
    assert.equal(legacySearch.some((row) => row.chunk_text === oldContent), false);
    assert.equal(legacySearch.some((row) => row.chunk_text === newContent), true);

    const { data: v2Search, error: v2SearchError } = await authA.client.rpc(
      "match_lore_embeddings_v2_by_project",
      {
        query_embedding: EMBEDDING,
        f_user_id: userA.id,
        f_project_id: projectA,
        match_count: 100,
        match_threshold: -1,
      },
    );
    expectNoError(v2SearchError, "v2 Lore Book search");
    console.log(`[RAW V2 SEARCH] ${JSON.stringify(v2Search)}`);
    assert.equal(v2Search.some((row) => row.id === oldRow.id), false);
    assert.equal(v2Search.some((row) => row.id === newRow.id), true);
    pass("superseded promotion is excluded from both Lore Book searches");

    const archivedContent = `phase-6-ordinary-archived-${suffix}`;
    const ordinaryId = randomUUID();
    const { error: ordinaryInsertError } = await service
      .from("lore_embeddings")
      .insert({
        id: ordinaryId,
        user_id: userA.id,
        project_id: projectA,
        chunk_text: archivedContent,
        embedding: EMBEDDING,
        memory_kind: "fact",
        temporal_status: "current",
        extraction_version: "user_created",
        source_type: "manual",
        is_archived: true,
      });
    expectNoError(ordinaryInsertError, "insert ordinary archived Lore");
    const { data: afterArchive, error: afterArchiveError } = await authA.client.rpc(
      "match_lore_embeddings_by_project",
      {
        query_embedding: EMBEDDING,
        match_project_id: projectA,
        match_user_id: userA.id,
        match_count: 100,
      },
    );
    expectNoError(afterArchiveError, "search after ordinary archive");
    console.log(`[RAW ARCHIVED SEARCH] ${JSON.stringify(afterArchive)}`);
    assert.equal(afterArchive.some((row) => row.chunk_text === archivedContent), false);
    pass("ordinary archived Lore is excluded from legacy Lore Book search");

    const stale = await promote(projectA, topic.id, authA.token, 1, "invalid-key");
    assert.equal(stale.status, 409);
    assert.deepEqual(stale.payload, { error: "Revision conflict" });
    pass("stale route revision rejects before OpenAI", stale.payload);

    const emptyTopic = await createTopic(
      authA.client,
      userA.id,
      projectA,
      "empty",
      " \n\t ",
    );
    const empty = await promote(projectA, emptyTopic.id, authA.token, 1, "invalid-key");
    assert.equal(empty.status, 400);
    assert.deepEqual(empty.payload, { error: "Topic is empty" });
    pass("empty topic rejects before OpenAI", empty.payload);

    const foreignTopic = await createTopic(
      authB.client,
      userB.id,
      projectB,
      "foreign",
      `phase-6-foreign-${suffix}`,
    );
    const foreign = await promote(
      projectB,
      foreignTopic.id,
      authA.token,
      1,
      "invalid-key",
    );
    assert.equal(foreign.status, 404);
    assert.deepEqual(foreign.payload, { error: "Project not found" });
    pass("cross-user route promotion is hidden as 404", foreign.payload);
  } finally {
    for (const userId of createdUserIds.reverse()) {
      try {
        const { error } = await service.auth.admin.deleteUser(userId);
        expectNoError(error, `delete test user ${userId}`);
        console.log(`[CLEANUP] deleted test user ${userId}`);
      } catch (error) {
        fail(`cleanup user ${userId}`, error);
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(
    args.every((arg) =>
      ["--print-postflight", "--postflight-only", "--fixtures-only"].includes(arg)
    ),
    "unknown argument",
  );
  assert.equal(
    args.includes("--postflight-only") && args.includes("--fixtures-only"),
    false,
    "postflight-only and fixtures-only are mutually exclusive",
  );
  if (args.includes("--print-postflight")) {
    console.log(POSTFLIGHT_QUERY.trim());
    return;
  }

  const envFile = resolve(process.env.PHASE_6_ENV_FILE ?? ".env.local.test.bak");
  loadEnvFile(envFile);
  loadEnvFile(resolve(".env.test.local"));
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const postflightOnly = args.includes("--postflight-only");
  const fixturesOnly = args.includes("--fixtures-only");
  const expectedRef = postflightOnly
    ? (process.env.PHASE_6_EXPECTED_PROJECT_REF ?? TEST_PROJECT_REF)
    : TEST_PROJECT_REF;
  assert.equal(projectRef, expectedRef, `Refusing project ${projectRef}; expected ${expectedRef}`);

  if (!fixturesOnly) await checkPostflight(projectRef);
  if (!postflightOnly) await verifyFixtures(supabaseUrl);
}

try {
  await main();
} catch (error) {
  fail("Phase 6 verification", error);
}

if (!process.argv.includes("--print-postflight")) {
  console.log(`[RESULT] passed=${passed} failed=${failures}`);
}
process.exitCode = failures ? 1 : 0;
