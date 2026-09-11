import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "jvarrlsqttfjiysaedlg";
const VECTOR_DIMENSIONS = 1536;

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

function pass(number, label, details = {}) {
  console.log(`[PASS] ${number}. ${label} ${JSON.stringify(details)}`);
}

function fail(label, error) {
  console.error(`[FAIL] ${label} ${JSON.stringify({
    message: error instanceof Error ? error.message : String(error),
  })}`);
}

function expectNoError(error, context) {
  if (error) {
    throw new Error(`${context}: ${error.code ?? "unknown"} ${error.message}`);
  }
}

function vectorWithCosine(similarity) {
  assert.ok(similarity >= 0 && similarity <= 1);
  return [
    similarity,
    Math.sqrt(1 - similarity ** 2),
    ...Array.from({ length: VECTOR_DIMENSIONS - 2 }, () => 0),
  ];
}

const UNIT_VECTOR = vectorWithCosine(1);
const NEAR_VECTOR = vectorWithCosine(0.99);
const MID_VECTOR = vectorWithCosine(0.95);
const LOW_VECTOR = vectorWithCosine(0);

function pairKey(idA, idB) {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

function resultPairKey(row) {
  return pairKey(row.id_a, row.id_b);
}

function assertSortedBySimilarity(rows, context) {
  for (let index = 1; index < rows.length; index++) {
    assert.ok(
      Number(rows[index - 1].similarity) >= Number(rows[index].similarity),
      `${context}: similarity must be descending at index ${index}`,
    );
  }
}

function assertEquivalentPairs(oldRows, newRows, context) {
  assert.deepEqual(
    oldRows.map(resultPairKey),
    newRows.map(resultPairKey),
    `${context}: ordered pair ids`,
  );
  assert.equal(oldRows.length, newRows.length, `${context}: row count`);
  for (let index = 0; index < oldRows.length; index++) {
    assert.ok(
      Math.abs(Number(oldRows[index].similarity) - Number(newRows[index].similarity)) < 1e-12,
      `${context}: similarity at index ${index}`,
    );
  }
}

async function rpcRows(client, name, args, context) {
  const { data, error } = await client.rpc(name, args);
  expectNoError(error, context);
  assert.ok(Array.isArray(data), `${context}: expected row array`);
  return data;
}

async function insertProject(client, userId, name) {
  const { data, error } = await client
    .from("projects")
    .insert({ user_id: userId, name })
    .select("id")
    .single();
  expectNoError(error, `insert project ${name}`);
  return data.id;
}

async function insertLore(client, userId, rows) {
  const payload = rows.map((row) => ({
    id: row.id ?? randomUUID(),
    user_id: userId,
    folder_name: row.folderName ?? null,
    project_id: row.projectId ?? null,
    chunk_text: row.text,
    embedding: Object.hasOwn(row, "embedding") ? row.embedding : UNIT_VECTOR,
    memory_kind: row.memoryKind ?? "fact",
    temporal_status: "current",
    importance_score: 0.5,
    confidence_score: 0.8,
    tags: [],
    is_pinned: row.isPinned ?? false,
    is_archived: row.isArchived ?? false,
    superseded_by: row.supersededBy ?? null,
    extraction_version: row.extractionVersion ?? "temporal_v1",
    source_type: "phase_e_verification",
  }));
  const { data, error } = await client
    .from("lore_embeddings")
    .insert(payload)
    .select("id");
  expectNoError(error, "insert Phase E lore fixtures");
  assert.equal(data.length, rows.length);
  return payload.map((row) => row.id);
}

loadEnvFile(resolve(process.env.PHASE_E_ENV_FILE ?? ".env.local.test.bak"));

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const expectedProjectRef = process.env.PHASE_E_EXPECTED_PROJECT_REF ?? TEST_PROJECT_REF;

assert.equal(
  projectRef,
  expectedProjectRef,
  `Refusing to run against project ${projectRef}; expected ${expectedProjectRef}`,
);

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonymous = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `PhaseE-${randomUUID()}-aA1!`;
let createdUserId = null;

async function run() {
  const email = `phase-e-${suffix}@example.invalid`;
  const { data: created, error: createUserError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expectNoError(createUserError, "create Phase E test user");
  createdUserId = created.user.id;

  const { data: signIn, error: signInError } = await anonymous.auth.signInWithPassword({
    email,
    password,
  });
  expectNoError(signInError, "sign in Phase E test user");
  const accessToken = signIn.session?.access_token;
  assert.ok(accessToken, "access token must be returned");

  const authenticated = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // v188の適用確認。専用ユーザーにはまだLoreが無いため読み取りのみで空配列になる。
  await rpcRows(
    authenticated,
    "find_similar_lore_pairs_by_project",
    { p_user_id: createdUserId, p_project_id: null, p_threshold: 1, p_limit: 1 },
    "preflight find_similar_lore_pairs_by_project",
  );
  await rpcRows(
    authenticated,
    "find_similar_lore_pairs_v2_by_project",
    { p_user_id: createdUserId, p_threshold: 1, p_limit: 1, p_k: 1, p_project_id: null },
    "preflight find_similar_lore_pairs_v2_by_project",
  );

  const folderA = `phase-e-a-${suffix}`;
  const folderB = `phase-e-b-${suffix}`;
  const projectA = await insertProject(service, createdUserId, folderA);
  const projectB = await insertProject(service, createdUserId, folderB);

  const eligibleA = randomUUID();
  const eligibleB = randomUUID();
  const eligibleC = randomUUID();
  await insertLore(service, createdUserId, [
    { id: eligibleA, folderName: folderA, projectId: projectA, text: "eligible-a", embedding: UNIT_VECTOR },
    { id: eligibleB, folderName: folderA, projectId: projectA, text: "eligible-b", embedding: NEAR_VECTOR },
    { id: eligibleC, folderName: folderA, projectId: projectA, text: "eligible-c", embedding: MID_VECTOR },
  ]);

  const excludedIds = await insertLore(service, createdUserId, [
    { folderName: folderA, projectId: projectA, text: "excluded-archived", isArchived: true },
    { folderName: folderA, projectId: projectA, text: "excluded-superseded", supersededBy: eligibleA },
    { folderName: folderA, projectId: projectA, text: "excluded-pinned", isPinned: true },
    { folderName: folderA, projectId: projectA, text: "excluded-no-embedding", embedding: null },
    { folderName: folderA, projectId: projectA, text: "excluded-user-edited", extractionVersion: "user_edited" },
    { folderName: folderA, projectId: projectA, text: "excluded-user-created", extractionVersion: "user_created" },
    { folderName: folderA, projectId: projectA, text: "excluded-liked-ai", extractionVersion: "liked_ai" },
    { folderName: folderA, projectId: projectA, text: "excluded-liked-ai-cleaned", extractionVersion: "liked_ai_cleaned" },
    { folderName: folderA, projectId: projectA, text: "excluded-memory-kind", memoryKind: "plan" },
    { folderName: folderA, projectId: projectA, text: "excluded-threshold", embedding: LOW_VECTOR },
  ]);

  const [dismissalA, dismissalB] = eligibleA < eligibleB
    ? [eligibleA, eligibleB]
    : [eligibleB, eligibleA];
  const { error: dismissalError } = await service
    .from("lore_consolidation_dismissals")
    .insert({
      user_id: createdUserId,
      lore_id_a: dismissalA,
      lore_id_b: dismissalB,
    });
  expectNoError(dismissalError, "insert dismissal fixture");

  const expectedFullPairs = [
    pairKey(eligibleB, eligibleC),
    pairKey(eligibleA, eligibleC),
  ];
  const excludedIdSet = new Set(excludedIds);
  const semanticResults = {};

  for (const variant of ["plain", "v2"]) {
    const isV2 = variant === "v2";
    const oldName = isV2 ? "find_similar_lore_pairs_v2" : "find_similar_lore_pairs";
    const newName = isV2
      ? "find_similar_lore_pairs_v2_by_project"
      : "find_similar_lore_pairs_by_project";
    const oldArgs = isV2
      ? { p_user_id: createdUserId, p_threshold: 0.9, p_limit: 100, p_k: 50, p_folder_name: folderA }
      : { p_user_id: createdUserId, p_folder_name: folderA, p_threshold: 0.9, p_limit: 100 };
    const newArgs = isV2
      ? { p_user_id: createdUserId, p_threshold: 0.9, p_limit: 100, p_k: 50, p_project_id: projectA }
      : { p_user_id: createdUserId, p_project_id: projectA, p_threshold: 0.9, p_limit: 100 };

    const oldRows = await rpcRows(authenticated, oldName, oldArgs, `${variant} old semantic query`);
    const newRows = await rpcRows(authenticated, newName, newArgs, `${variant} new semantic query`);
    assertEquivalentPairs(oldRows, newRows, `${variant} semantic preservation`);
    assertSortedBySimilarity(oldRows, `${variant} old order`);
    assertSortedBySimilarity(newRows, `${variant} new order`);
    assert.deepEqual(newRows.map(resultPairKey), expectedFullPairs, `${variant}: expected eligible pairs`);
    assert.equal(
      newRows.some((row) => excludedIdSet.has(row.id_a) || excludedIdSet.has(row.id_b)),
      false,
      `${variant}: excluded fixture leaked`,
    );
    assert.equal(newRows.some((row) => resultPairKey(row) === pairKey(eligibleA, eligibleB)), false);

    const thresholdOldArgs = { ...oldArgs, p_threshold: 0.97 };
    const thresholdNewArgs = { ...newArgs, p_threshold: 0.97 };
    const thresholdOld = await rpcRows(authenticated, oldName, thresholdOldArgs, `${variant} old threshold`);
    const thresholdNew = await rpcRows(authenticated, newName, thresholdNewArgs, `${variant} new threshold`);
    assertEquivalentPairs(thresholdOld, thresholdNew, `${variant} threshold preservation`);
    assert.deepEqual(thresholdNew.map(resultPairKey), [pairKey(eligibleB, eligibleC)]);

    const limitOld = await rpcRows(authenticated, oldName, { ...oldArgs, p_limit: 1 }, `${variant} old limit`);
    const limitNew = await rpcRows(authenticated, newName, { ...newArgs, p_limit: 1 }, `${variant} new limit`);
    assertEquivalentPairs(limitOld, limitNew, `${variant} limit preservation`);
    assert.deepEqual(limitNew.map(resultPairKey), expectedFullPairs.slice(0, 1));

    semanticResults[variant] = {
      orderedPairs: newRows.map(resultPairKey),
      thresholdPairs: thresholdNew.map(resultPairKey),
      limitedPairs: limitNew.map(resultPairKey),
    };
  }

  pass(1, "新旧RPCで全除外条件・threshold・dismissal・order・limitが一致", {
    conditions: [
      "archived",
      "superseded",
      "pinned",
      "embedding",
      "extraction_version",
      "memory_kind",
      "threshold",
      "dismissal",
      "order",
      "limit",
    ],
    results: semanticResults,
  });

  const [crossProjectA, crossProjectB] = await insertLore(service, createdUserId, [
    {
      folderName: folderA,
      projectId: projectA,
      text: "cross-project-a",
      memoryKind: "decision",
      embedding: UNIT_VECTOR,
    },
    {
      folderName: folderB,
      projectId: projectB,
      text: "cross-project-b",
      memoryKind: "decision",
      embedding: UNIT_VECTOR,
    },
  ]);
  const crossProjectKey = pairKey(crossProjectA, crossProjectB);
  const oldUnscopedPlain = await rpcRows(
    authenticated,
    "find_similar_lore_pairs",
    { p_user_id: createdUserId, p_folder_name: null, p_threshold: 0.999, p_limit: 200 },
    "old unscoped plain cross-project query",
  );
  const newUnscopedPlain = await rpcRows(
    authenticated,
    "find_similar_lore_pairs_by_project",
    { p_user_id: createdUserId, p_project_id: null, p_threshold: 0.999, p_limit: 200 },
    "new unscoped plain cross-project query",
  );
  assert.ok(oldUnscopedPlain.some((row) => resultPairKey(row) === crossProjectKey));
  assert.equal(newUnscopedPlain.some((row) => resultPairKey(row) === crossProjectKey), false);
  const newScopedPlain = await rpcRows(
    authenticated,
    "find_similar_lore_pairs_by_project",
    { p_user_id: createdUserId, p_project_id: projectA, p_threshold: 0.999, p_limit: 200 },
    "new scoped plain cross-project query",
  );
  assert.equal(newScopedPlain.some((row) => resultPairKey(row) === crossProjectKey), false);
  pass(2, "無印新版はproject指定有無の両方でcross-projectペアを排除", {
    oldUnscopedContainsPair: true,
    newUnscopedContainsPair: false,
    newScopedContainsPair: false,
  });

  const [nullProjectA, nullProjectB] = await insertLore(service, createdUserId, [
    { folderName: null, projectId: null, text: "null-project-a", memoryKind: "todo", embedding: UNIT_VECTOR },
    { folderName: null, projectId: null, text: "null-project-b", memoryKind: "todo", embedding: UNIT_VECTOR },
  ]);
  const nullProjectKey = pairKey(nullProjectA, nullProjectB);
  const oldNullV2 = await rpcRows(
    authenticated,
    "find_similar_lore_pairs_v2",
    { p_user_id: createdUserId, p_threshold: 0.999, p_limit: 200, p_k: 50, p_folder_name: null },
    "old v2 null/null query",
  );
  const newNullV2 = await rpcRows(
    authenticated,
    "find_similar_lore_pairs_v2_by_project",
    { p_user_id: createdUserId, p_threshold: 0.999, p_limit: 200, p_k: 50, p_project_id: null },
    "new v2 null/null query",
  );
  assert.equal(oldNullV2.some((row) => resultPairKey(row) === nullProjectKey), false);
  assert.ok(newNullV2.some((row) => resultPairKey(row) === nullProjectKey));
  pass(3, "v2新版はp_project_id=nullでNULL/NULLペアを新規許可", {
    oldContainsPair: false,
    newContainsPair: true,
  });

  for (const [name, args] of [
    [
      "find_similar_lore_pairs_by_project",
      { p_user_id: createdUserId, p_project_id: projectA, p_threshold: 0.9, p_limit: 200 },
    ],
    [
      "find_similar_lore_pairs_v2_by_project",
      { p_user_id: createdUserId, p_threshold: 0.9, p_limit: 200, p_k: 50, p_project_id: projectA },
    ],
  ]) {
    const rows = await rpcRows(authenticated, name, args, `${name} project isolation`);
    assert.ok(rows.length > 0, `${name}: expected project A candidates`);
    for (const row of rows) {
      assert.equal(row.id_a === crossProjectB || row.id_b === crossProjectB, false);
      if (name.includes("v2")) {
        assert.equal(row.project_id_a, projectA);
        assert.equal(row.project_id_b, projectA);
      }
    }
  }
  pass(4, "p_project_id指定時は無印・v2とも他projectを混入させない", {
    projectId: projectA,
  });

  const { error: mergeGuardError } = await authenticated.rpc("merge_user_edited_lore_pair", {
    p_user_id: createdUserId,
    p_lore_id_a: crossProjectA,
    p_lore_id_b: crossProjectB,
    p_merged_text: "must fail across projects",
    p_embedding: UNIT_VECTOR,
    p_memory_kind: "decision",
    p_temporal_status: "current",
  });
  assert.ok(mergeGuardError, "cross-project merge should fail");
  assert.equal(mergeGuardError.code, "P0001");
  assert.match(mergeGuardError.message, /source records belong to different projects/);
  pass(5, "merge_user_edited_lore_pairは異project_id間をP0001で拒否", {
    code: mergeGuardError.code,
    message: mergeGuardError.message,
  });

  const { data: dreamingMergedId, error: dreamingError } = await authenticated.rpc(
    "consolidate_dreaming_batch",
    {
      p_user_id: createdUserId,
      p_lore_id_a: nullProjectA,
      p_lore_id_b: nullProjectB,
      p_merged_text: "Phase E null project pair merge",
      p_embedding: UNIT_VECTOR,
      p_memory_kind: "todo",
      p_temporal_status: "current",
      p_folder_name: null,
      p_importance: 0.5,
      p_confidence: 0.8,
    },
  );
  expectNoError(dreamingError, "consolidate_dreaming_batch NULL/NULL pair");
  assert.match(dreamingMergedId, /^[0-9a-f-]{36}$/i);

  const { data: mergedRow, error: mergedRowError } = await service
    .from("lore_embeddings")
    .select("id, folder_name, project_id, extraction_version")
    .eq("id", dreamingMergedId)
    .single();
  expectNoError(mergedRowError, "select NULL/NULL dreaming result");
  assert.equal(mergedRow.folder_name, null);
  assert.equal(mergedRow.project_id, null);
  assert.equal(mergedRow.extraction_version, "dreaming_batch");

  const { data: sourceRows, error: sourceRowsError } = await service
    .from("lore_embeddings")
    .select("id, is_archived, superseded_by")
    .in("id", [nullProjectA, nullProjectB]);
  expectNoError(sourceRowsError, "select NULL/NULL dreaming sources");
  assert.equal(sourceRows.length, 2);
  for (const row of sourceRows) {
    assert.equal(row.is_archived, true);
    assert.equal(row.superseded_by, dreamingMergedId);
  }
  pass(6, "2件版Dreamingでfolder_name/project_idがNULLのペアを実統合", {
    mergedId: dreamingMergedId,
    folderName: mergedRow.folder_name,
    projectId: mergedRow.project_id,
    archivedSourceCount: sourceRows.length,
  });
}

let exitCode = 0;
try {
  await run();
} catch (error) {
  exitCode = 1;
  fail("Phase E side-by-side verification", error);
} finally {
  if (createdUserId) {
    const { error } = await service.auth.admin.deleteUser(createdUserId);
    if (error) {
      exitCode = 1;
      fail(`cleanup user ${createdUserId}`, error);
    } else {
      console.log(`[CLEANUP] deleted test user ${createdUserId}`);
    }
  }
}

process.exitCode = exitCode;
