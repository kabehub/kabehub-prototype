const assert = require("node:assert/strict");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

installTsLoader();
installAliasResolver();

const { deleteOwnedMessage } = require("../lib/messages/delete.ts");

const USER_ID = "user-1";
const MESSAGE_ID = "message-1";
const THREAD_ID = "thread-1";
const STORAGE_PATH = `${USER_ID}/${THREAD_ID}/image.png`;

function createFakeSupabase(options = {}) {
  const history = [];
  const existing = Object.prototype.hasOwnProperty.call(options, "existing")
    ? options.existing
    : { metadata: { storagePath: STORAGE_PATH } };

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.operation = undefined;
      this.payload = undefined;
      this.filters = [];
    }

    select(columns) {
      this.operation = "select";
      this.payload = columns;
      return this;
    }

    update(values) {
      this.operation = "archive";
      this.payload = values;
      return this;
    }

    delete() {
      this.operation = "delete";
      return this;
    }

    eq(column, value) {
      this.filters.push([column, value]);
      return this;
    }

    maybeSingle() {
      history.push({
        operation: "select",
        table: this.table,
        payload: this.payload,
        filters: [...this.filters],
      });
      return Promise.resolve({
        data: existing,
        error: options.selectError ?? null,
      });
    }

    then(resolve, reject) {
      history.push({
        operation: this.operation,
        table: this.table,
        payload: this.payload,
        filters: [...this.filters],
      });

      const error =
        this.operation === "archive"
          ? options.archiveError ?? null
          : options.deleteError ?? null;
      return Promise.resolve({ error }).then(resolve, reject);
    }
  }

  return {
    history,
    supabase: {
      from(table) {
        return new QueryBuilder(table);
      },
      storage: {
        from(bucket) {
          assert.equal(bucket, "generated-images");
          return {
            async remove(paths) {
              history.push({
                operation: "storage cleanup",
                bucket,
                paths: [...paths],
              });
              return { data: null, error: options.storageError ?? null };
            },
          };
        },
      },
    },
  };
}

async function captureWarnings(fn) {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const result = await fn();
    return { result, warnings };
  } finally {
    console.warn = originalWarn;
  }
}

function operation(history, name) {
  return history.find((entry) => entry.operation === name);
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("unscoped select, archive, and delete use only message and user scope", async () => {
  const { supabase, history } = createFakeSupabase({
    existing: { metadata: {} },
  });

  const result = await deleteOwnedMessage({
    supabase,
    userId: USER_ID,
    messageId: MESSAGE_ID,
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(operation(history, "select").filters, [
    ["id", MESSAGE_ID],
    ["user_id", USER_ID],
  ]);
  assert.deepEqual(operation(history, "archive").filters, [
    ["source_message_id", MESSAGE_ID],
    ["user_id", USER_ID],
    ["is_pinned", false],
  ]);
  assert.deepEqual(operation(history, "delete").filters, [
    ["id", MESSAGE_ID],
    ["user_id", USER_ID],
  ]);
});

test("nested select, archive, and delete all include thread scope", async () => {
  const { supabase, history } = createFakeSupabase({
    existing: { metadata: {} },
  });

  const result = await deleteOwnedMessage({
    supabase,
    userId: USER_ID,
    messageId: MESSAGE_ID,
    threadId: THREAD_ID,
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(operation(history, "select").filters, [
    ["id", MESSAGE_ID],
    ["user_id", USER_ID],
    ["thread_id", THREAD_ID],
  ]);
  assert.deepEqual(operation(history, "archive").filters, [
    ["source_message_id", MESSAGE_ID],
    ["user_id", USER_ID],
    ["is_pinned", false],
    ["source_thread_id", THREAD_ID],
  ]);
  assert.deepEqual(operation(history, "delete").filters, [
    ["id", MESSAGE_ID],
    ["user_id", USER_ID],
    ["thread_id", THREAD_ID],
  ]);
});

test("nested missing message succeeds without archive, delete, or cleanup", async () => {
  const { supabase, history } = createFakeSupabase({ existing: null });

  const result = await deleteOwnedMessage({
    supabase,
    userId: USER_ID,
    messageId: MESSAGE_ID,
    threadId: THREAD_ID,
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(
    history.map((entry) => entry.operation),
    ["select"]
  );
});

test("unscoped missing message still archives and deletes", async () => {
  const { supabase, history } = createFakeSupabase({ existing: null });

  const result = await deleteOwnedMessage({
    supabase,
    userId: USER_ID,
    messageId: MESSAGE_ID,
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(
    history.map((entry) => entry.operation),
    ["select", "archive", "delete"]
  );
});

test("metadata select failure returns its message and stops all later work", async () => {
  const selectError = { message: "select failed", code: "select-code" };
  const { supabase, history } = createFakeSupabase({ selectError });

  const result = await deleteOwnedMessage({
    supabase,
    userId: USER_ID,
    messageId: MESSAGE_ID,
  });

  assert.deepEqual(result, { ok: false, error: "select failed" });
  assert.deepEqual(
    history.map((entry) => entry.operation),
    ["select"]
  );
});

test("archive failure warns with the existing text and continues deletion", async () => {
  const archiveError = { message: "archive failed" };
  const { supabase, history } = createFakeSupabase({
    existing: { metadata: {} },
    archiveError,
  });

  const { result, warnings } = await captureWarnings(() =>
    deleteOwnedMessage({
      supabase,
      userId: USER_ID,
      messageId: MESSAGE_ID,
    })
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(warnings, [
    [
      "Failed to archive lore_embeddings for deleted message:",
      "archive failed",
    ],
  ]);
  assert.deepEqual(
    history.map((entry) => entry.operation),
    ["select", "archive", "delete"]
  );
});

test("delete failure returns the same error object and skips cleanup", async () => {
  const deleteError = { message: "delete failed", code: "delete-code" };
  const { supabase, history } = createFakeSupabase({ deleteError });

  const result = await deleteOwnedMessage({
    supabase,
    userId: USER_ID,
    messageId: MESSAGE_ID,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, deleteError);
  assert.deepEqual(
    history.map((entry) => entry.operation),
    ["select", "archive", "delete"]
  );
});

test("work runs in select, archive, delete, storage cleanup order", async () => {
  const { supabase, history } = createFakeSupabase();

  const result = await deleteOwnedMessage({
    supabase,
    userId: USER_ID,
    messageId: MESSAGE_ID,
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(
    history.map((entry) => entry.operation),
    ["select", "archive", "delete", "storage cleanup"]
  );
  assert.deepEqual(operation(history, "storage cleanup").paths, [STORAGE_PATH]);
});

test("cleanup failure uses the unscoped and nested warning prefixes", async () => {
  const storageError = { statusCode: "storage-failed" };
  const unscoped = createFakeSupabase({ storageError });
  const nested = createFakeSupabase({ storageError });

  const { warnings } = await captureWarnings(async () => {
    await deleteOwnedMessage({
      supabase: unscoped.supabase,
      userId: USER_ID,
      messageId: MESSAGE_ID,
    });
    await deleteOwnedMessage({
      supabase: nested.supabase,
      userId: USER_ID,
      messageId: MESSAGE_ID,
      threadId: THREAD_ID,
    });
  });

  assert.deepEqual(warnings, [
    [
      "[messages-delete] storage cleanup incomplete",
      {
        scope: "message",
        attemptedCount: 1,
        failedCount: 1,
      },
    ],
    [
      "[thread-message-delete] storage cleanup incomplete",
      {
        scope: "message",
        attemptedCount: 1,
        failedCount: 1,
      },
    ],
  ]);
});

async function run() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  }
  console.log(`${tests.length} message delete tests passed`);
}

run().catch(() => {
  process.exitCode = 1;
});
