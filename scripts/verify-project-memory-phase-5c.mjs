// Default: test only. Requires PHASE_5C_SUPABASE_ACCESS_TOKEN
// (or SUPABASE_ACCESS_TOKEN) for catalog and ACL verification.
// Production catalog only: set PHASE_5C_ENV_FILE and
// PHASE_5C_EXPECTED_PROJECT_REF, then run with --postflight-only.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "jvarrlsqttfjiysaedlg";
const EMBEDDING = [1, ...Array.from({ length: 1535 }, () => 0)];

const NEW_RPCS = [
  {
    name: "consolidate_dreaming_batch_by_project",
    types: "uuid,uuid,uuid,text,vector,text,text,double precision,double precision",
    argumentNames: [
      "p_user_id", "p_lore_id_a", "p_lore_id_b", "p_merged_text",
      "p_embedding", "p_memory_kind", "p_temporal_status",
      "p_importance", "p_confidence",
    ],
    count: 2,
  },
  {
    name: "consolidate_dreaming_batch_multi_by_project",
    types: "uuid,uuid[],text,vector,text,text,double precision,double precision",
    argumentNames: [
      "p_user_id", "p_source_ids", "p_merged_text", "p_embedding",
      "p_memory_kind", "p_temporal_status", "p_importance", "p_confidence",
    ],
    count: 3,
  },
  {
    name: "merge_user_edited_lore_pair_by_project",
    types: "uuid,uuid,uuid,text,vector,text,text",
    argumentNames: [
      "p_user_id", "p_lore_id_a", "p_lore_id_b", "p_merged_text",
      "p_embedding", "p_memory_kind", "p_temporal_status",
    ],
    count: 2,
    merge: true,
  },
];

const CATALOG_FUNCTIONS = [
  ...NEW_RPCS.map((rpc) => ({ ...rpc, state: "new", securityDefiner: false })),
  {
    name: "consolidate_dreaming_batch",
    types: "uuid,uuid,uuid,text,vector,text,text,text,double precision,double precision",
    state: "legacy",
  },
  {
    name: "consolidate_dreaming_batch_multi",
    types: "uuid,uuid[],text,vector,text,text,text,double precision,double precision",
    state: "legacy",
  },
  {
    name: "merge_user_edited_lore_pair",
    types: "uuid,uuid,uuid,text,vector,text,text",
    state: "legacy",
  },
  {
    name: "rollback_dreaming_batch_multi",
    types: "uuid,uuid",
    argumentNames: ["p_user_id", "p_consolidated_id"],
    state: "active",
    securityDefiner: true,
  },
  {
    name: "rename_project",
    types: "uuid,uuid,text",
    argumentNames: ["p_user_id", "p_project_id", "p_new_name"],
    state: "active",
    securityDefiner: true,
  },
  {
    name: "delete_project_preserving_contents",
    types: "uuid,uuid,boolean,jsonb",
    argumentNames: [
      "p_user_id", "p_project_id", "p_promote_to_lore", "p_lore_promotions",
    ],
    state: "active",
    securityDefiner: true,
  },
];

const functionValues = CATALOG_FUNCTIONS.map(
  (rpc) => `  ('public.${rpc.name}(${rpc.types})', '${rpc.state}')`,
).join(",\n");

const CATALOG_QUERY = `
with function_catalog as (
  select
    'function'::text as kind,
    rpc.signature as object_name,
    rpc.expected_state,
    to_regprocedure(rpc.signature)::text as catalog_identity,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
    has_function_privilege('public', p.oid, 'EXECUTE') as public,
    p.prosecdef as security_definer,
    coalesce('search_path=""' = any(p.proconfig), false) as empty_search_path,
    p.proargnames as argument_names,
    case when p.oid is null then null
      else position('folder_name' in pg_get_functiondef(p.oid)) > 0
    end as uses_folder_name,
    case when p.oid is null then null
      else md5(pg_get_functiondef(p.oid))
    end as definition_md5
  from (values
${functionValues}
  ) as rpc(signature, expected_state)
  left join pg_proc p on p.oid = to_regprocedure(rpc.signature)
), schema_catalog as (
  select
    'column'::text as kind,
    'public.lore_embeddings.folder_name'::text as object_name,
    'absent'::text as expected_state,
    case when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'lore_embeddings'
        and column_name = 'folder_name'
    ) then 'public.lore_embeddings.folder_name' end as catalog_identity,
    null::boolean as authenticated,
    null::boolean as anon,
    null::boolean as public,
    null::boolean as security_definer,
    null::boolean as empty_search_path,
    null::text[] as argument_names,
    null::boolean as uses_folder_name,
    null::text as definition_md5
  union all
  select
    'index',
    'public.idx_lore_embeddings_user_folder',
    'absent',
    to_regclass('public.idx_lore_embeddings_user_folder')::text,
    null::boolean,
    null::boolean,
    null::boolean,
    null::boolean,
    null::boolean,
    null::text[],
    null::boolean,
    null::text
)
select * from function_catalog
union all
select * from schema_catalog
order by kind, object_name;
`;

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
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
  if (error) {
    throw new Error(`${context}: ${error.code ?? "unknown"} ${error.message}`);
  }
}

function normalizePgArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return value.slice(1, -1).split(",").filter(Boolean);
  }
  return value;
}

async function checkCatalog(projectRef) {
  const accessToken = process.env.PHASE_5C_SUPABASE_ACCESS_TOKEN
    ?? process.env.SUPABASE_ACCESS_TOKEN;
  assert.ok(
    accessToken,
    "PHASE_5C_SUPABASE_ACCESS_TOKEN or SUPABASE_ACCESS_TOKEN is required",
  );

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: CATALOG_QUERY }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  assert.ok(response.ok, `Management SQL HTTP ${response.status}`);
  const result = await response.json();
  const rows = Array.isArray(result) ? result : result?.data;
  assert.equal(
    rows?.length,
    CATALOG_FUNCTIONS.length + 2,
    "catalog returned every function and schema object",
  );

  const expectedBySignature = new Map(
    CATALOG_FUNCTIONS.map((rpc) => [
      `public.${rpc.name}(${rpc.types})`,
      rpc,
    ]),
  );

  for (const row of rows) {
    if (row.kind !== "function") {
      assert.equal(row.catalog_identity, null, `${row.object_name} must be absent`);
      pass(`catalog ${row.object_name} absent`);
      continue;
    }

    const expected = expectedBySignature.get(row.object_name);
    assert.ok(expected, `unexpected catalog row ${row.object_name}`);
    if (expected.state === "legacy") {
      assert.equal(row.catalog_identity, null, `${row.object_name} must be absent`);
      pass(`catalog ${row.object_name} absent`);
      continue;
    }

    assert.ok(row.catalog_identity, `${row.object_name} must exist`);
    assert.equal(row.authenticated, true, `${row.object_name}: authenticated EXECUTE`);
    assert.equal(row.anon, false, `${row.object_name}: anon EXECUTE`);
    assert.equal(row.public, false, `${row.object_name}: PUBLIC EXECUTE`);
    assert.equal(
      row.security_definer,
      expected.securityDefiner,
      `${row.object_name}: security mode`,
    );
    assert.equal(row.empty_search_path, true, `${row.object_name}: empty search_path`);
    assert.deepEqual(
      normalizePgArray(row.argument_names),
      expected.argumentNames,
      `${row.object_name}: argument names`,
    );
    if (expected.state === "new") {
      assert.equal(row.uses_folder_name, false, `${row.object_name}: folder_name-free`);
    }
    pass(`catalog ${row.object_name}`, {
      security_definer: row.security_definer,
      definition_md5: row.definition_md5,
    });
  }

  return rows;
}

function rpcArgs(rpc, userId, ids, text) {
  return {
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
}

async function verifyFixtures(supabaseUrl, envFile) {
  const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const service = createClient(supabaseUrl, serviceRoleKey, options);
  const createdUserIds = [];
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `Phase5C-${randomUUID()}-aA1!`;

  async function createUser(label) {
    const email = `phase-5c-${label}-${suffix}@example.invalid`;
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

  async function createProject(userId, name) {
    const { data, error } = await service
      .from("projects")
      .insert({ user_id: userId, name })
      .select("id,name")
      .single();
    expectNoError(error, `create project ${name}`);
    return data;
  }

  async function insertLore(userId, count, projectId = null) {
    const payload = Array.from({ length: count }, (_, index) => ({
      id: randomUUID(),
      user_id: userId,
      project_id: projectId,
      chunk_text: `phase-5c-${suffix}-${randomUUID()}-${index}`,
      embedding: EMBEDDING,
      memory_kind: "fact",
      temporal_status: "current",
      tags: [],
      importance_score: 0.5,
      confidence_score: 0.8,
      is_pinned: false,
      is_archived: false,
      superseded_by: null,
      extraction_version: "temporal_v1",
      source_type: "phase_5c_verification",
    }));
    const { error } = await service.from("lore_embeddings").insert(payload);
    expectNoError(error, "insert lore fixtures");
    return payload.map((row) => row.id);
  }

  async function readLore(ids) {
    const { data, error } = await service
      .from("lore_embeddings")
      .select("id,user_id,project_id,is_archived,superseded_by,extraction_version")
      .in("id", [...new Set(ids)])
      .order("id");
    expectNoError(error, "read lore fixtures");
    return data;
  }

  async function readOneLore(id) {
    const { data, error } = await service
      .from("lore_embeddings")
      .select("id,user_id,project_id,is_archived,superseded_by,extraction_version")
      .eq("id", id)
      .single();
    expectNoError(error, `read lore ${id}`);
    return data;
  }

  try {
    const userA = await createUser("a");
    const userB = await createUser("b");
    const signIn = createClient(supabaseUrl, anonKey, options);
    const { data: sessionData, error: signInError } =
      await signIn.auth.signInWithPassword({ email: userA.email, password });
    expectNoError(signInError, "sign in user A");
    assert.ok(sessionData.session?.access_token);

    const authenticated = createClient(supabaseUrl, anonKey, {
      ...options,
      global: {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      },
    });
    const projectA = await createProject(userA.id, `phase-5c-a-${suffix}`);
    const projectB = await createProject(userB.id, `phase-5c-b-${suffix}`);

    for (const rpc of NEW_RPCS) {
      const sourceIds = await insertLore(userA.id, rpc.count);
      const { data: mergedId, error } = await authenticated.rpc(
        rpc.name,
        rpcArgs(rpc, userA.id, [...sourceIds].reverse(), `${rpc.name}-${suffix}`),
      );
      expectNoError(error, `${rpc.name}: NULL project consolidation`);
      assert.match(mergedId, /^[0-9a-f-]{36}$/i);

      const merged = await readOneLore(mergedId);
      assert.equal(merged.project_id, null);
      assert.equal(
        merged.extraction_version,
        rpc.merge ? "user_edited" : "dreaming_batch",
      );
      const archivedSources = await readLore(sourceIds);
      assert.equal(archivedSources.length, rpc.count);
      for (const source of archivedSources) {
        assert.equal(source.is_archived, true);
        assert.equal(source.superseded_by, mergedId);
      }
      pass(`${rpc.name}: NULL project sources stay NULL`, { mergedId });

      if (rpc.name === "consolidate_dreaming_batch_multi_by_project") {
        const { error: rollbackError } = await authenticated.rpc(
          "rollback_dreaming_batch_multi",
          { p_user_id: userA.id, p_consolidated_id: mergedId },
        );
        expectNoError(rollbackError, "rollback_dreaming_batch_multi");
        const restoredSources = await readLore(sourceIds);
        for (const source of restoredSources) {
          assert.equal(source.is_archived, false);
          assert.equal(source.superseded_by, null);
        }
        assert.equal((await readOneLore(mergedId)).is_archived, true);
        pass("rollback restores sources and archives consolidation", { mergedId });
      }

      const brokenIds = await insertLore(userA.id, rpc.count, projectB.id);
      const before = await readLore(brokenIds);
      const { error: ownershipError } = await authenticated.rpc(
        rpc.name,
        rpcArgs(
          rpc,
          userA.id,
          brokenIds,
          `${rpc.name}-cross-user-project-${suffix}`,
        ),
      );
      assert.ok(ownershipError, `${rpc.name}: cross-user project must fail`);
      assert.equal(ownershipError.code, "P0001");
      assert.match(ownershipError.message, /project not found/);
      assert.deepEqual(await readLore(brokenIds), before);
      pass(`${rpc.name}: cross-user project rejected`, {
        code: ownershipError.code,
        message: ownershipError.message,
      });
    }

    const [renameLoreId] = await insertLore(userA.id, 1, projectA.id);
    const renamed = `${projectA.name}-renamed`;
    const { data: renameResult, error: renameError } = await authenticated.rpc(
      "rename_project",
      {
        p_user_id: userA.id,
        p_project_id: projectA.id,
        p_new_name: renamed,
      },
    );
    expectNoError(renameError, "rename_project");
    assert.equal(renameResult, renamed);
    const { data: renamedProject, error: projectError } = await service
      .from("projects")
      .select("id,name")
      .eq("id", projectA.id)
      .single();
    expectNoError(projectError, "read renamed project");
    assert.equal(renamedProject.name, renamed);
    assert.equal((await readOneLore(renameLoreId)).project_id, projectA.id);
    pass("rename_project preserves Lore project_id", {
      project_id: projectA.id,
      lore_id: renameLoreId,
    });
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

  const deleteVerification = spawnSync(
    process.execPath,
    [resolve("scripts/verify-project-delete.mjs")],
    {
      cwd: resolve("."),
      env: { ...process.env, VERIFY_DELETE_ENV_FILE: envFile },
      stdio: "inherit",
    },
  );
  assert.equal(
    deleteVerification.status,
    0,
    `verify-project-delete exited ${deleteVerification.status}`,
  );
  pass("verify-project-delete passes after v199");
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(
    args.every((arg) => ["--print-postflight", "--postflight-only"].includes(arg)),
    "unknown argument",
  );
  if (args.includes("--print-postflight")) {
    console.log(CATALOG_QUERY.trim());
    return;
  }

  const envFile = resolve(process.env.PHASE_5C_ENV_FILE ?? ".env.local.test.bak");
  loadEnvFile(envFile);
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const postflightOnly = args.includes("--postflight-only");
  const expectedRef = postflightOnly
    ? (process.env.PHASE_5C_EXPECTED_PROJECT_REF ?? TEST_PROJECT_REF)
    : TEST_PROJECT_REF;
  assert.equal(projectRef, expectedRef, `Refusing project ${projectRef}; expected ${expectedRef}`);

  const catalogBefore = await checkCatalog(projectRef);
  if (!postflightOnly) {
    await verifyFixtures(supabaseUrl, envFile);
    const catalogAfter = await checkCatalog(projectRef);
    assert.deepEqual(catalogAfter, catalogBefore, "catalog changed during verification");
    pass("catalog unchanged during fixture verification");
  }
}

try {
  await main();
} catch (error) {
  fail("Phase 5C verification", error);
}

if (!process.argv.includes("--print-postflight")) {
  console.log(`[RESULT] passed=${passed} failed=${failures}`);
}
process.exitCode = failures ? 1 : 0;
