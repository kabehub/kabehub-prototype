import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "jvarrlsqttfjiysaedlg";
const DUMMY_EMBEDDING = [1, ...Array.from({ length: 1535 }, () => 0)];

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

function pass(label, details = {}) {
  console.log(`[PASS] ${label} ${JSON.stringify(details)}`);
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

function expectRpcError(error, code, messagePart, context) {
  assert.ok(error, `${context}: RPC should fail`);
  assert.equal(error.code, code, `${context}: SQLSTATE`);
  if (messagePart) assert.match(error.message, new RegExp(messagePart));
  pass(context, { code: error.code, message: error.message });
}

async function fetchAll(client, table, columns, configure = (query) => query) {
  const pageSize = 1000;
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const query = configure(client.from(table).select(columns)).range(
      start,
      start + pageSize - 1,
    );
    const { data, error } = await query;
    expectNoError(error, `fetch rows from ${table}`);
    rows.push(...data);
    if (data.length < pageSize) {
      return rows.sort((left, right) =>
        String(left.id).localeCompare(String(right.id)),
      );
    }
  }
}

async function selectById(client, table, id, columns) {
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq("id", id)
    .maybeSingle();
  expectNoError(error, `select ${table}/${id}`);
  return data;
}

async function countById(client, table, id) {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("id", id);
  expectNoError(error, `count ${table}/${id}`);
  return count;
}

loadEnvFile(resolve(process.env.VERIFY_DELETE_ENV_FILE ?? ".env.local.test.bak"));

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

assert.equal(
  new URL(supabaseUrl).hostname.split(".")[0],
  TEST_PROJECT_REF,
  `Refusing to run outside test project ${TEST_PROJECT_REF}`,
);

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `VerifyDelete-${randomUUID()}-aA1!`;
const createdUserIds = [];

async function createTestUser(label) {
  const safeLabel = label.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const email = `project-delete-${safeLabel}-${suffix}@example.invalid`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expectNoError(error, `create ${label} test user`);
  assert.ok(data.user?.id, `create ${label} test user: user id`);
  createdUserIds.push(data.user.id);

  const signInClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signInError } =
    await signInClient.auth.signInWithPassword({ email, password });
  expectNoError(signInError, `sign in ${label} test user`);
  const accessToken = signIn.session?.access_token;
  assert.ok(accessToken, `sign in ${label} test user: access token`);

  const authenticated = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { id: data.user.id, email, accessToken, authenticated };
}

async function createProject(user, label) {
  const name = `project-delete-${label}-${suffix}`;
  const { data, error } = await user.authenticated.rpc(
    "get_or_create_project",
    { p_user_id: user.id, p_name: name },
  );
  expectNoError(error, `get_or_create_project(${label})`);
  assert.match(data, /^[0-9a-f-]{36}$/i, `project id for ${label}`);
  return { id: data, name };
}

async function insertThread(userId, project, label) {
  const { data, error } = await service
    .from("threads")
    .insert({
      user_id: userId,
      title: `Project delete ${label}`,
      folder_name: project.name,
      project_id: project.id,
    })
    .select("id")
    .single();
  expectNoError(error, `insert thread fixture (${label})`);
  return data;
}

async function insertProjectSettings(userId, project, label) {
  const { data, error } = await service
    .from("project_settings")
    .insert({
      user_id: userId,
      folder_name: project.name,
      project_id: project.id,
      system_prompt: `Project delete verification ${label}`,
      pinned_github_files: [],
    })
    .select("id")
    .single();
  expectNoError(error, `insert project_settings fixture (${label})`);
  return data;
}

async function insertLore(userId, project, label) {
  const { data, error } = await service
    .from("lore_embeddings")
    .insert({
      user_id: userId,
      folder_name: project.name,
      project_id: project.id,
      chunk_text: `Existing lore ${label}`,
      embedding: DUMMY_EMBEDDING,
      memory_kind: "fact",
      temporal_status: "current",
      extraction_version: "temporal_v1",
      source_type: "project_delete_verification",
      tags: [],
      is_pinned: false,
      is_archived: false,
    })
    .select("id")
    .single();
  expectNoError(error, `insert lore fixture (${label})`);
  return data;
}

async function createTopic(user, projectId, topicKey, contentMd) {
  const { data, error } = await user.authenticated.rpc(
    "create_project_memory_topic",
    {
      p_user_id: user.id,
      p_project_id: projectId,
      p_topic_key: topicKey,
      p_content_md: contentMd,
      p_source_refs: [],
    },
  );
  expectNoError(error, `create topic ${topicKey}`);
  const topic = Array.isArray(data) ? data[0] : data;
  assert.ok(topic?.topic_id, `create topic ${topicKey}: topic id`);
  return {
    id: topic.topic_id,
    topicKey,
    contentMd: topic.content_md,
    revision: topic.revision,
  };
}

async function updateTopic(user, topicId, expectedRevision, contentMd) {
  const { data, error } = await user.authenticated.rpc(
    "update_project_memory_topic",
    {
      p_user_id: user.id,
      p_topic_id: topicId,
      p_expected_revision: expectedRevision,
      p_edit_kind: "full",
      p_new_content_md: contentMd,
      p_old_text: null,
      p_new_text: null,
      p_source_refs: [],
    },
  );
  expectNoError(error, `update topic ${topicId}`);
  const topic = Array.isArray(data) ? data[0] : data;
  assert.equal(topic?.revision, expectedRevision + 1);
  return topic;
}

async function callDeleteRpc(user, projectId, promoteToLore, promotions) {
  return user.authenticated.rpc("delete_project_preserving_contents", {
    p_user_id: user.id,
    p_project_id: projectId,
    p_promote_to_lore: promoteToLore,
    p_lore_promotions: promotions,
  });
}

function promotionFor(topic, expectedRevision = topic.revision) {
  return {
    topic_id: topic.id,
    expected_revision: expectedRevision,
    embedding: DUMMY_EMBEDDING,
  };
}

async function snapshotUsers(userIds) {
  const tableSpecs = {
    projects: "id, user_id, name, created_at, updated_at",
    threads: "id, user_id, title, folder_name, project_id, updated_at",
    project_settings:
      "id, user_id, folder_name, project_id, system_prompt, folder_type, pinned_github_files",
    lore_embeddings:
      "id, user_id, folder_name, project_id, chunk_text, memory_kind, temporal_status, extraction_version, source_type, metadata",
    project_memory_topics:
      "id, user_id, project_id, topic_key, content_md, revision, updated_at",
  };

  const snapshot = {};
  for (const [table, columns] of Object.entries(tableSpecs)) {
    snapshot[table] = await fetchAll(
      service,
      table,
      columns,
      (query) => query.in("user_id", userIds),
    );
  }

  const topicIds = snapshot.project_memory_topics.map((topic) => topic.id);
  snapshot.project_memory_revisions = topicIds.length
    ? await fetchAll(
        service,
        "project_memory_revisions",
        "id, topic_id, revision, content_md, edit_kind, source_refs, created_at",
        (query) => query.in("topic_id", topicIds),
      )
    : [];

  return snapshot;
}

async function assertSnapshotUnchanged(before, userIds, context) {
  const after = await snapshotUsers(userIds);
  assert.deepEqual(after, before, `${context}: database rows changed`);
}

async function createRollbackFixture(label) {
  const user = await createTestUser(label);
  const project = await createProject(user, label);
  const thread = await insertThread(user.id, project, label);
  const settings = await insertProjectSettings(user.id, project, label);
  const lore = await insertLore(user.id, project, label);
  return { user, project, thread, settings, lore };
}

async function scenario1PreserveWithoutPromotion() {
  const label = "scenario-1";
  const fixture = await createRollbackFixture(label);
  const topic = await createTopic(
    fixture.user,
    fixture.project.id,
    "overview",
    "Non-empty Project Memory",
  );
  const revisionsBefore = await fetchAll(
    service,
    "project_memory_revisions",
    "id, topic_id, revision, content_md, edit_kind, source_refs, created_at",
    (query) => query.eq("topic_id", topic.id),
  );

  const { error } = await callDeleteRpc(
    fixture.user,
    fixture.project.id,
    false,
    [],
  );
  expectNoError(error, "scenario 1 delete RPC");

  const thread = await selectById(
    service,
    "threads",
    fixture.thread.id,
    "id, project_id, folder_name",
  );
  assert.ok(thread);
  assert.equal(thread.project_id, null);
  assert.equal(thread.folder_name, null);

  const lore = await selectById(
    service,
    "lore_embeddings",
    fixture.lore.id,
    "id, project_id, folder_name, source_type",
  );
  assert.ok(lore);
  assert.equal(lore.project_id, null);
  assert.equal(lore.folder_name, null);

  const orphanedTopic = await selectById(
    service,
    "project_memory_topics",
    topic.id,
    "id, user_id, project_id, topic_key, content_md, revision",
  );
  assert.ok(orphanedTopic);
  assert.equal(orphanedTopic.project_id, null);
  assert.equal(orphanedTopic.user_id, fixture.user.id);

  assert.equal(
    await countById(service, "project_settings", fixture.settings.id),
    0,
  );
  assert.equal(await countById(service, "projects", fixture.project.id), 0);

  const loreRows = await fetchAll(
    service,
    "lore_embeddings",
    "id, source_type",
    (query) => query.eq("user_id", fixture.user.id),
  );
  assert.deepEqual(loreRows, [
    { id: fixture.lore.id, source_type: "project_delete_verification" },
  ]);

  const revisionsAfter = await fetchAll(
    service,
    "project_memory_revisions",
    "id, topic_id, revision, content_md, edit_kind, source_refs, created_at",
    (query) => query.eq("topic_id", topic.id),
  );
  assert.deepEqual(revisionsAfter, revisionsBefore);

  pass("① promote_to_lore=false preserves contents and cascades settings", {
    project_id: fixture.project.id,
    thread_id: fixture.thread.id,
    lore_id: fixture.lore.id,
    topic_id: topic.id,
  });
}

async function scenario2PromoteToLore() {
  const label = "scenario-2";
  const user = await createTestUser(label);
  const project = await createProject(user, label);
  const topics = [
    await createTopic(user, project.id, "overview", "Overview content"),
    await createTopic(user, project.id, "principles", "Principles content"),
  ];
  const emptyTopic = await createTopic(
    user,
    project.id,
    "empty-topic",
    "   ",
  );

  const { error } = await callDeleteRpc(
    user,
    project.id,
    true,
    topics.map((topic) => promotionFor(topic)),
  );
  expectNoError(error, "scenario 2 delete RPC");

  const promoted = await fetchAll(
    service,
    "lore_embeddings",
    "id, user_id, chunk_text, memory_kind, temporal_status, extraction_version, source_type, project_id, folder_name, metadata",
    (query) =>
      query
        .eq("user_id", user.id)
        .eq("source_type", "project_memory_promotion"),
  );
  assert.equal(promoted.length, topics.length);

  const expectedById = new Map(topics.map((topic) => [topic.id, topic]));
  for (const row of promoted) {
    assert.equal(row.user_id, user.id);
    assert.equal(row.memory_kind, "project");
    assert.equal(row.temporal_status, "current");
    assert.equal(row.extraction_version, "user_created");
    assert.equal(row.source_type, "project_memory_promotion");
    assert.equal(row.project_id, null);
    assert.equal(row.folder_name, null);
    assert.equal(row.metadata?.source_project_id, project.id);

    const sourceTopic = expectedById.get(row.metadata?.source_topic_id);
    assert.ok(sourceTopic, `unexpected source_topic_id ${row.metadata?.source_topic_id}`);
    assert.equal(row.metadata.source_topic_key, sourceTopic.topicKey);
    assert.equal(row.chunk_text, sourceTopic.contentMd);
  }
  assert.equal(
    promoted.some(
      (row) => row.metadata?.source_topic_id === emptyTopic.id,
    ),
    false,
  );

  for (const topic of [...topics, emptyTopic]) {
    const row = await selectById(
      service,
      "project_memory_topics",
      topic.id,
      "id, project_id",
    );
    assert.ok(row);
    assert.equal(row.project_id, null);
  }
  assert.equal(await countById(service, "projects", project.id), 0);

  pass("② promote_to_lore=true promotes non-empty topics with metadata", {
    project_id: project.id,
    promoted: promoted.length,
    empty_topic_id: emptyTopic.id,
  });
}

async function scenario3OtherUserProject() {
  const label = "scenario-3";
  const ownerFixture = await createRollbackFixture(`${label}-owner`);
  const topic = await createTopic(
    ownerFixture.user,
    ownerFixture.project.id,
    "overview",
    "Owner content",
  );
  const caller = await createTestUser(`${label}-caller`);
  const before = await snapshotUsers([ownerFixture.user.id, caller.id]);

  const { error } = await caller.authenticated.rpc(
    "delete_project_preserving_contents",
    {
      p_user_id: caller.id,
      p_project_id: ownerFixture.project.id,
      p_promote_to_lore: false,
      p_lore_promotions: [],
    },
  );
  expectRpcError(
    error,
    "P0001",
    "project not found",
    "scenario 3 other-user project",
  );
  await assertSnapshotUnchanged(
    before,
    [ownerFixture.user.id, caller.id],
    "scenario 3",
  );

  assert.ok(await selectById(service, "projects", ownerFixture.project.id, "id"));
  assert.ok(await selectById(service, "threads", ownerFixture.thread.id, "id"));
  assert.ok(await selectById(service, "lore_embeddings", ownerFixture.lore.id, "id"));
  assert.ok(await selectById(service, "project_memory_topics", topic.id, "id"));
  pass("③ other user cannot delete a project and changes nothing", {
    project_id: ownerFixture.project.id,
  });
}

async function scenario4RevisionMismatch() {
  const label = "scenario-4";
  const fixture = await createRollbackFixture(label);
  const topic = await createTopic(
    fixture.user,
    fixture.project.id,
    "overview",
    "Revision one",
  );
  await updateTopic(fixture.user, topic.id, topic.revision, "Revision two");
  const before = await snapshotUsers([fixture.user.id]);

  const { error } = await callDeleteRpc(
    fixture.user,
    fixture.project.id,
    true,
    [promotionFor(topic, topic.revision)],
  );
  expectRpcError(
    error,
    "P0001",
    "topic changed during promotion",
    "scenario 4 expected_revision mismatch",
  );
  await assertSnapshotUnchanged(before, [fixture.user.id], "scenario 4");
  pass("④ stale expected_revision rolls back every database change", {
    project_id: fixture.project.id,
    topic_id: topic.id,
  });
}

async function scenario5TopicSetMismatch() {
  const label = "scenario-5";
  const fixture = await createRollbackFixture(label);
  const firstTopic = await createTopic(
    fixture.user,
    fixture.project.id,
    "overview",
    "First content",
  );
  const promotions = [promotionFor(firstTopic)];
  await createTopic(
    fixture.user,
    fixture.project.id,
    "late-topic",
    "Added after promotion payload was prepared",
  );
  const before = await snapshotUsers([fixture.user.id]);

  const { error } = await callDeleteRpc(
    fixture.user,
    fixture.project.id,
    true,
    promotions,
  );
  expectRpcError(
    error,
    "P0001",
    "topic changed during promotion",
    "scenario 5 topic set mismatch",
  );
  await assertSnapshotUnchanged(before, [fixture.user.id], "scenario 5");
  pass("⑤ a newly added non-empty topic causes a full rollback", {
    project_id: fixture.project.id,
  });
}

async function scenario6FalseWithPromotions() {
  const label = "scenario-6";
  const user = await createTestUser(label);
  const project = await createProject(user, label);
  const topic = await createTopic(
    user,
    project.id,
    "overview",
    "Promotion must be rejected",
  );
  const before = await snapshotUsers([user.id]);

  const { error } = await callDeleteRpc(
    user,
    project.id,
    false,
    [promotionFor(topic)],
  );
  expectRpcError(
    error,
    "P0001",
    "lore_promotions must be empty when promote_to_lore is false",
    "scenario 6 false with non-empty promotions",
  );
  await assertSnapshotUnchanged(before, [user.id], "scenario 6");
  pass("⑥ promote=false rejects non-empty promotions without changes", {
    project_id: project.id,
  });
}

async function scenario7InvalidPromotionElements() {
  const cases = [
    {
      label: "missing-topic-id",
      build: (topic) => ({
        expected_revision: topic.revision,
        embedding: DUMMY_EMBEDDING,
      }),
    },
    {
      label: "missing-expected-revision",
      build: (topic) => ({
        topic_id: topic.id,
        embedding: DUMMY_EMBEDDING,
      }),
    },
    {
      label: "embedding-not-array",
      build: (topic) => ({
        topic_id: topic.id,
        expected_revision: topic.revision,
        embedding: "not-an-array",
      }),
    },
  ];

  for (const testCase of cases) {
    const label = `scenario-7-${testCase.label}`;
    const user = await createTestUser(label);
    const project = await createProject(user, label);
    const topic = await createTopic(
      user,
      project.id,
      "overview",
      "Invalid payload target",
    );
    const before = await snapshotUsers([user.id]);

    const { error } = await callDeleteRpc(
      user,
      project.id,
      true,
      [testCase.build(topic)],
    );
    expectRpcError(
      error,
      "P0001",
      "invalid lore promotion element",
      `scenario 7 ${testCase.label}`,
    );
    await assertSnapshotUnchanged(before, [user.id], label);
  }

  pass("⑦ invalid promotion elements fail closed without changes", {
    cases: cases.map((testCase) => testCase.label),
  });
}

async function scenario8DuplicateTopicId() {
  const label = "scenario-8";
  const user = await createTestUser(label);
  const project = await createProject(user, label);
  const topic = await createTopic(
    user,
    project.id,
    "overview",
    "Duplicate promotion target",
  );
  const promotion = promotionFor(topic);
  const before = await snapshotUsers([user.id]);

  const { error } = await callDeleteRpc(
    user,
    project.id,
    true,
    [promotion, { ...promotion }],
  );
  expectRpcError(
    error,
    "P0001",
    "duplicate topic_id in lore_promotions",
    "scenario 8 duplicate topic_id",
  );
  await assertSnapshotUnchanged(before, [user.id], "scenario 8");
  pass("⑧ duplicate topic_id fails closed without changes", {
    project_id: project.id,
    topic_id: topic.id,
  });
}

async function run() {
  await scenario1PreserveWithoutPromotion();
  await scenario2PromoteToLore();
  await scenario3OtherUserProject();
  await scenario4RevisionMismatch();
  await scenario5TopicSetMismatch();
  await scenario6FalseWithPromotions();
  await scenario7InvalidPromotionElements();
  await scenario8DuplicateTopicId();
  pass("Project delete integration verification complete", { scenarios: 8 });
}

let exitCode = 0;
try {
  await run();
} catch (error) {
  exitCode = 1;
  fail("Project delete verification", error);
} finally {
  for (const userId of createdUserIds.reverse()) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) {
      exitCode = 1;
      fail(`cleanup user ${userId}`, error);
    } else {
      console.log(`[CLEANUP] deleted test user ${userId}`);
    }
  }
}

process.exitCode = exitCode;
