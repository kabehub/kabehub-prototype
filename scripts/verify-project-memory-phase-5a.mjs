// Default: test only. Catalog checks require PHASE_5A_SUPABASE_ACCESS_TOKEN
// (or SUPABASE_ACCESS_TOKEN); missing credentials fail rather than skip ACLs.
// node scripts/verify-project-memory-phase-5a.mjs --print-postflight
// Production catalog only: set PHASE_5A_ENV_FILE and PHASE_5A_EXPECTED_PROJECT_REF,
// then run with --postflight-only. This mode never creates fixtures.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "jvarrlsqttfjiysaedlg";
const EMBEDDING = [1, ...Array.from({ length: 1535 }, () => 0)];
const RPCS = [
  {
    name: "consolidate_dreaming_batch_by_project",
    legacy: "consolidate_dreaming_batch",
    types: "uuid,uuid,uuid,text,vector,text,text,double precision,double precision",
    legacyTypes: "uuid,uuid,uuid,text,vector,text,text,text,double precision,double precision",
    count: 2,
    protected: ["user_edited", "user_created", "liked_ai", "liked_ai_cleaned"],
  },
  {
    name: "consolidate_dreaming_batch_multi_by_project",
    legacy: "consolidate_dreaming_batch_multi",
    types: "uuid,uuid[],text,vector,text,text,double precision,double precision",
    legacyTypes: "uuid,uuid[],text,vector,text,text,text,double precision,double precision",
    count: 3,
    protected: ["user_edited", "user_created", "liked_ai", "liked_ai_cleaned"],
  },
  {
    name: "merge_user_edited_lore_pair_by_project",
    legacy: "merge_user_edited_lore_pair",
    types: "uuid,uuid,uuid,text,vector,text,text",
    legacyTypes: "uuid,uuid,uuid,text,vector,text,text",
    count: 2,
    protected: ["user_edited", "user_created"],
    merge: true,
  },
];

const CATALOG_QUERY = `
select rpc.signature, rpc.is_new,
  to_regprocedure(rpc.signature)::text as regprocedure,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
  has_function_privilege('public', p.oid, 'EXECUTE') as public,
  p.prosecdef as security_definer,
  coalesce('search_path=""' = any(p.proconfig), false) as empty_search_path,
  p.proargnames as argument_names,
  md5(pg_get_functiondef(p.oid)) as definition_md5
from (values
${RPCS.flatMap((rpc) => [
  `  ('public.${rpc.name}(${rpc.types})', true)`,
  `  ('public.${rpc.legacy}(${rpc.legacyTypes})', false)`,
]).join(",\n")}
) as rpc(signature, is_new)
left join pg_proc p on p.oid = to_regprocedure(rpc.signature)
order by rpc.signature;
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
    ) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

let passed = 0;
let failures = 0;
function pass(label, details = {}) {
  passed++;
  console.log(`[PASS] ${label} ${JSON.stringify(details)}`);
}

function fail(label, error) {
  failures++;
  console.error(`[FAIL] ${label} ${JSON.stringify({
    message: error instanceof Error ? error.message : String(error),
  })}`);
}

function expectNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.code ?? "unknown"} ${error.message}`);
}

async function checkCatalog(projectRef) {
  const accessToken = process.env.PHASE_5A_SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN;
  assert.ok(accessToken, "PHASE_5A_SUPABASE_ACCESS_TOKEN or SUPABASE_ACCESS_TOKEN is required for live catalog/ACL verification");
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ query: CATALOG_QUERY }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  assert.ok(response.ok, `Management SQL HTTP ${response.status}`);
  const result = await response.json();
  const rows = Array.isArray(result) ? result : result?.data;
  assert.equal(rows?.length, 6, "catalog: all six signatures");
  for (const row of rows) {
    assert.ok(row.regprocedure, `${row.signature}: missing function`);
    assert.equal(row.authenticated, true, `${row.signature}: authenticated EXECUTE`);
    if (row.is_new) {
      assert.equal(row.anon, false, `${row.signature}: anon EXECUTE`);
      assert.equal(row.public, false, `${row.signature}: PUBLIC EXECUTE`);
      assert.equal(row.security_definer, false, `${row.signature}: security invoker`);
      assert.equal(row.empty_search_path, true, `${row.signature}: empty search_path`);
      assert.equal(row.argument_names.includes("p_folder_name"), false);
    }
    pass(`catalog ${row.signature}`, row);
  }
  return rows;
}

function rpcArgs(rpc, userId, ids, text, legacyFolder) {
  const args = {
    p_user_id: userId,
    p_merged_text: text,
    p_embedding: EMBEDDING,
    p_memory_kind: "fact",
    p_temporal_status: "current",
    ...(rpc.count === 3
      ? { p_source_ids: ids }
      : { p_lore_id_a: ids[0], p_lore_id_b: ids[1] }),
    ...(!rpc.merge ? { p_importance: 0.6, p_confidence: 0.8 } : {}),
  };
  if (!rpc.merge && legacyFolder !== undefined) args.p_folder_name = legacyFolder;
  return args;
}

async function verifyFixtures(supabaseUrl) {
  const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const service = createClient(supabaseUrl, required("SUPABASE_SERVICE_ROLE_KEY"), options);
  const anonymous = createClient(supabaseUrl, anonKey, options);
  const createdUserIds = [];
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `Phase5A-${randomUUID()}-aA1!`;

  async function createUser(label) {
    const email = `phase-5a-${label}-${suffix}@example.invalid`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expectNoError(error, `create user ${label}`);
    createdUserIds.push(data.user.id);
    return { id: data.user.id, email };
  }

  async function project(userId, name) {
    const { data, error } = await service.from("projects").insert({ user_id: userId, name }).select("id").single();
    expectNoError(error, "insert project");
    return { id: data.id, name };
  }

  async function insertLore(userId, rows) {
    // Always service-role: includes deliberately broken ownership fixtures.
    const payload = rows.map((row, index) => ({
      id: randomUUID(), user_id: userId, project_id: null, folder_name: null,
      chunk_text: `phase-5a-source-${suffix}-${index}`, embedding: EMBEDDING,
      memory_kind: "fact", temporal_status: "current", tags: [],
      importance_score: 0.5, confidence_score: 0.8,
      is_pinned: false, is_archived: false, superseded_by: null,
      extraction_version: "temporal_v1", source_type: "phase_5a_verification",
      ...row,
    }));
    const { error } = await service.from("lore_embeddings").insert(payload);
    expectNoError(error, "insert lore fixtures via service-role");
    return payload.map((row) => row.id);
  }

  async function sources(ids) {
    const { data, error } = await service.from("lore_embeddings")
      .select("id,user_id,project_id,folder_name,is_archived,is_pinned,superseded_by,extraction_version,tags,updated_at")
      .in("id", [...new Set(ids.filter(Boolean))]).order("id");
    expectNoError(error, "read sources");
    return data;
  }

  async function resultRow(id) {
    const { data, error } = await service.from("lore_embeddings")
      .select("id,user_id,project_id,folder_name,tags,extraction_version,importance_score,confidence_score,memory_kind,temporal_status")
      .eq("id", id).single();
    expectNoError(error, "read RPC result");
    return data;
  }

  async function checkCase(label, callback) {
    try { await callback(); } catch (error) { fail(label, error); }
  }

  try {
    const userA = await createUser("a");
    const userB = await createUser("b");
    const signIn = createClient(supabaseUrl, anonKey, options);
    const { data, error } = await signIn.auth.signInWithPassword({ email: userA.email, password });
    expectNoError(error, "sign in user A");
    assert.ok(data.session?.access_token);
    const authenticated = createClient(supabaseUrl, anonKey, {
      ...options, global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    });
    const projectA = await project(userA.id, `phase-5a-a-${suffix}`);
    const projectA2 = await project(userA.id, `phase-5a-a2-${suffix}`);
    const projectB = await project(userB.id, `phase-5a-b-${suffix}`);
    const [supersedingId] = await insertLore(userA.id, [{ project_id: projectA.id }]);

    for (const rpc of RPCS) {
      function rows(overrides = {}) {
        return Array.from({ length: rpc.count }, () => ({ project_id: projectA.id, ...overrides }));
      }

      async function success(label, fixtureRows, expectedProject, { legacy = false, defaults = false } = {}) {
        const ids = await insertLore(userA.id, fixtureRows);
        const name = legacy ? rpc.legacy : rpc.name;
        // Reversed input exercises UUID normalization and deterministic locking.
        const args = rpcArgs(rpc, userA.id, [...ids].reverse(), `${name}-${label}-${suffix}`, legacy ? projectA.name : undefined);
        if (defaults) { delete args.p_memory_kind; delete args.p_temporal_status; }
        const { data: mergedId, error: rpcError } = await authenticated.rpc(name, args);
        expectNoError(rpcError, `${name}: ${label}`);
        assert.match(mergedId, /^[0-9a-f-]{36}$/i);
        const merged = await resultRow(mergedId);
        assert.equal(merged.user_id, userA.id);
        assert.equal(merged.project_id, expectedProject?.id ?? null);
        assert.equal(merged.folder_name, expectedProject?.name ?? null);
        assert.equal(merged.extraction_version, rpc.merge ? "user_edited" : "dreaming_batch");
        assert.equal(merged.memory_kind, "fact");
        assert.equal(merged.temporal_status, "current");
        const sourceRows = await sources(ids);
        assert.equal(sourceRows.length, rpc.count);
        for (const row of sourceRows) {
          assert.equal(row.is_archived, true);
          assert.equal(row.superseded_by, mergedId);
        }
        if (fixtureRows.some((row) => row.tags?.length)) {
          const expectedTags = [...new Set(sourceRows.flatMap((row) => row.tags ?? []).filter((tag) => tag !== null))];
          if (rpc.merge) assert.deepEqual(merged.tags, expectedTags, "merge tags: UUID order, first occurrence, no nulls");
          else assert.deepEqual([...merged.tags].sort(), [...expectedTags].sort());
        }
        if (rpc.merge) {
          assert.equal(merged.importance_score, Math.max(...fixtureRows.map((row) => row.importance_score ?? 0.5)));
          const expectedConfidence = fixtureRows.reduce((sum, row) => sum + (row.confidence_score ?? 0.8), 0) / rpc.count;
          assert.ok(Math.abs(merged.confidence_score - expectedConfidence) < 1e-12);
        }
        pass(`${name}: ${label}`, { mergedId, project_id: merged.project_id, folder_name: merged.folder_name });
      }

      async function rejected(label, fixtureRows, { message, changeIds, owner = userA.id, client = authenticated, code = "P0001" } = {}) {
        const ids = await insertLore(userA.id, fixtureRows);
        const callIds = changeIds ? await changeIds(ids) : ids;
        const before = await sources(callIds);
        const text = `${rpc.name}-${label}-${randomUUID()}`;
        const { error: rpcError } = await client.rpc(rpc.name, rpcArgs(rpc, owner, callIds, text));
        assert.ok(rpcError, `${label}: RPC must fail`);
        assert.equal(rpcError.code, code, `${label}: SQLSTATE (${rpcError.message})`);
        if (message) assert.ok(rpcError.message.includes(message), `${label}: ${rpcError.message}`);
        assert.deepEqual(await sources(callIds), before, `${label}: failed RPC leaves sources unchanged`);
        const { count, error: countError } = await service.from("lore_embeddings")
          .select("id", { count: "exact", head: true }).eq("user_id", userA.id).eq("chunk_text", text);
        expectNoError(countError, "check failed RPC did not insert");
        assert.equal(count, 0);
        pass(`${rpc.name}: ${label}`, { code: rpcError.code, message: rpcError.message });
      }

      await checkCase(`${rpc.name}: same project`, () => success("same project; distinct stale folder names", rows().map((row, i) => ({
        ...row, folder_name: `stale-${i}-${suffix}`, tags: i === 0 ? ["shared", "first", "shared"] : ["second", "shared"],
        importance_score: i === 0 ? 0.4 : 0.9, confidence_score: i === 0 ? 0.6 : 0.8,
        created_at: i === 0 ? "2026-01-01T00:00:00Z" : "2026-01-02T00:00:00Z",
      })), projectA));
      await checkCase(`${rpc.name}: null project`, () => success("NULL/NULL project; folder_name becomes NULL", rows({ project_id: null })
        .map((row, i) => ({ ...row, folder_name: `stale-null-${i}-${suffix}` })), null));
      await checkCase(`${rpc.name}: null extraction`, () => success("NULL extraction_version is allowed", rows({ extraction_version: null }), projectA));

      for (const differingProject of [projectA2.id, null]) {
        await checkCase(`${rpc.name}: project mismatch`, () => rejected(`different projects (${differingProject === null ? "NULL/non-NULL" : "non-NULL/non-NULL"})`,
          rows().map((row, i) => ({ ...row, folder_name: projectA.name, ...(i === 0 ? { project_id: differingProject } : {}) })),
          { message: "different projects" }));
      }
      for (const version of rpc.protected) {
        for (let index = 0; index < rpc.count; index++) {
          await checkCase(`${rpc.name}: ${version} source ${index}`, () => rejected(`protected ${version} source ${index}`,
            rows().map((row, i) => ({ ...row, ...(i === index ? { extraction_version: version } : {}) }))));
        }
      }
      for (const [label, patch] of [
        ["pinned", { is_pinned: true }], ["archived", { is_archived: true }],
        ["superseded", { superseded_by: supersedingId }],
        ["NULL is_pinned", { is_pinned: null }], ["NULL is_archived", { is_archived: null }],
      ]) {
        for (let index = 0; index < rpc.count; index++) {
          await checkCase(`${rpc.name}: ${label} source ${index}`, () => rejected(`${label} source ${index}`,
            rows().map((row, i) => ({ ...row, ...(i === index ? patch : {}) }))));
        }
      }
      await checkCase(`${rpc.name}: duplicate IDs`, () => rejected("duplicate IDs", rows(),
        { changeIds: (ids) => ids.map((id, i) => i === 1 ? ids[0] : id) }));
      await checkCase(`${rpc.name}: missing ID`, () => rejected("missing ID", rows(),
        { changeIds: (ids) => ids.map((id, i) => i === 0 ? randomUUID() : id) }));
      await checkCase(`${rpc.name}: cross-user source`, () => rejected("cross-user source", rows(), {
        changeIds: async (ids) => {
          // Valid B-owned row: RLS/user_id filtering must hide it before project checks.
          const [foreignId] = await insertLore(userB.id, [{ project_id: projectB.id }]);
          const { data: visible, error: visibilityError } = await authenticated.from("lore_embeddings").select("id").eq("id", foreignId);
          expectNoError(visibilityError, "cross-user RLS visibility");
          assert.deepEqual(visible, [], "RLS must hide the other user's source");
          return ids.map((id, i) => i === 0 ? foreignId : id);
        },
      }));
      await checkCase(`${rpc.name}: broken ownership`, () => rejected("broken ownership via service-role", rows({ project_id: projectB.id }),
        { message: "project not found" }));
      await checkCase(`${rpc.name}: wrong p_user_id`, () => rejected("wrong p_user_id", rows(), { owner: userB.id, code: "42501" }));
      await checkCase(`${rpc.name}: anon EXECUTE denied`, () => rejected("anon EXECUTE denied", rows(), { client: anonymous, code: "42501" }));
      await checkCase(`${rpc.legacy}: old signature`, () => success("legacy signature remains callable", rows({ folder_name: projectA.name }), projectA, { legacy: true }));
      if (rpc.merge) {
        for (const version of ["liked_ai", "liked_ai_cleaned"]) {
          await checkCase(`${rpc.name}: allow ${version}`, () => success(`allow ${version}`, rows({ extraction_version: version }), projectA));
        }
        await checkCase(`${rpc.name}: merge defaults`, () => success("default memory_kind/temporal_status; null and duplicate tags", rows().map((row, i) => ({
          ...row, tags: i === 0 ? [null, "shared", "a", "shared"] : ["b", null, "shared"],
        })), projectA, { defaults: true }));
      }
    }
  } finally {
    // User deletion cascades every fixture, including archived results and broken ownership.
    for (const userId of createdUserIds) {
      try {
        const { error } = await service.auth.admin.deleteUser(userId);
        expectNoError(error, "delete test user");
        console.log(`[CLEANUP] deleted test user ${userId}`);
      } catch (error) { fail(`cleanup user ${userId}`, error); }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.every((arg) => ["--print-postflight", "--postflight-only"].includes(arg)), "unknown argument");
  if (args.includes("--print-postflight")) { console.log(CATALOG_QUERY.trim()); return; }
  loadEnvFile(resolve(process.env.PHASE_5A_ENV_FILE ?? ".env.local.test.bak"));
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const postflightOnly = args.includes("--postflight-only");
  // Only read-only postflight may target production. Fixture mode is always test-only.
  const expectedRef = postflightOnly ? (process.env.PHASE_5A_EXPECTED_PROJECT_REF ?? TEST_PROJECT_REF) : TEST_PROJECT_REF;
  assert.equal(projectRef, expectedRef, `Refusing project ${projectRef}; expected ${expectedRef}`);
  const catalogBefore = await checkCatalog(projectRef);
  if (!postflightOnly) {
    await verifyFixtures(supabaseUrl);
    const catalogAfter = await checkCatalog(projectRef);
    assert.deepEqual(catalogAfter, catalogBefore, "all six RPC definitions/ACLs remain unchanged during verification");
    pass("all six RPC definitions/ACLs unchanged");
  }
}

try { await main(); } catch (error) { fail("Phase 5A verification", error); }
if (!process.argv.includes("--print-postflight")) console.log(`[RESULT] passed=${passed} failed=${failures}`);
process.exitCode = failures ? 1 : 0;
