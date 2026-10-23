const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "docs/applied/migration_v207_thread_trash.sql"), "utf8");
const schema = fs.readFileSync(path.join(root, "docs/schema.sql"), "utf8");
// Keep the pre-v207 comparison anchored to immutable applied migrations.
const previousDefinitions = [
  "migration_v128_public_threads_projection.sql",
  "migration_v178_restore_message_branch.sql",
  "migration_v179_apply_branch_edit.sql",
  "migration_v123_rpc_hardening.sql",
].map(file => fs.readFileSync(path.join(root, "docs/applied", file), "utf8")).join("\n");
const normalize = source => source.replace(/--[^\r\n]*/g, " ").replace(/\s+/g, " ").trim();
const sql = normalize(migration);
function definition(source, name, withAcl = false) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `definition exists: ${name}`);
  const tail = source.slice(start);
  const delimiter = tail.match(/\bas (\$\w*\$)/)[1];
  const bodyEnd = tail.indexOf(`${delimiter};`) + delimiter.length + 1;
  if (!withAcl) return tail.slice(0, bodyEnd);
  const grant = tail.indexOf(`grant execute on function public.${name}(`, bodyEnd);
  assert.ok(grant >= 0, `grant exists: ${name}`);
  return tail.slice(0, tail.indexOf(";", grant) + 1);
}
const rpc = name => normalize(definition(migration, name));
const body = name => rpc(name).split("as $$")[1].split("$$;")[0].trim().replace(/^declare .*? begin /, "begin ");
const users = { soft_delete_thread: "uuid, uuid", restore_thread: "uuid, uuid", list_trashed_threads: "uuid" };
const services = { list_expired_trashed_threads: "integer", purge_expired_thread: "uuid" };

test("v207 adds nullable columns and partial index idempotently without backfill/default", () => {
  assert.match(sql, /^begin; alter table public\.threads add column if not exists deleted_at timestamptz;/);
  assert.match(sql, /create index if not exists idx_threads_deleted_at on public\.threads\(deleted_at\) where deleted_at is not null;/);
  assert.match(sql, /alter table public\.lore_embeddings add column if not exists archived_by_thread_delete_at timestamptz;/);
  assert.equal((sql.match(/alter table/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /\bdefault\b|\bnot null default\b/);
});

test("retention has a single immutable interval definition shared by all deadline operations", () => {
  assert.match(rpc("thread_trash_retention"), /returns interval language sql immutable security invoker set search_path = '' as \$\$ select interval '7 days'; \$\$;/);
  assert.equal((sql.match(/7\s*days/g) ?? []).length, 1);
  assert.equal((sql.match(/\binterval\s+'/g) ?? []).length, 1);
  for (const name of ["restore_thread", "list_trashed_threads", ...Object.keys(services)]) {
    assert.ok(body(name).includes("public.thread_trash_retention()"), name);
  }
});

test("user RPCs are invokers with empty search_path and auth validation before any access", () => {
  for (const name of Object.keys(users)) {
    assert.match(rpc(name), /language plpgsql security invoker set search_path = ''/);
    assert.match(body(name), /^begin if p_user_id is null or auth\.uid\(\) is distinct from p_user_id then raise exception 'Unauthorized' using errcode = '42501'; end if;/);
  }
  assert.match(rpc("soft_delete_thread"), /\(p_user_id uuid, p_thread_id uuid\) returns timestamptz/);
  assert.match(rpc("restore_thread"), /\(p_user_id uuid, p_thread_id uuid\) returns void/);
});

test("new RPC ACLs revoke default access and grant only the intended role", () => {
  for (const [entries, role] of [[users, "authenticated"], [services, "service_role"]]) {
    for (const [name, args] of Object.entries(entries)) {
      const signature = `public.${name}(${args})`;
      assert.ok(sql.includes(`revoke execute on function ${signature} from public, anon, authenticated; grant execute on function ${signature} to ${role};`));
      const grants = sql.match(new RegExp(`grant [^;]* on function public\\.${name}\\([^;]*;`, "g"));
      assert.deepEqual(grants, [`grant execute on function ${signature} to ${role};`]);
    }
  }
  assert.ok(sql.includes("grant execute on function public.thread_trash_retention() to authenticated, service_role;"));
  assert.ok(sql.includes("revoke execute on function public.guard_thread_not_trashed() from public, anon, authenticated;"));
  assert.doesNotMatch(sql, /grant [^;]*guard_thread_not_trashed/);
});

test("soft delete and restore lock the owned thread, and missing threads return P0001", () => {
  for (const name of ["soft_delete_thread", "restore_thread"]) {
    assert.match(body(name), /select t\.deleted_at, t\.forked_from_id into v_thread from public\.threads as t where t\.id = p_thread_id and t\.user_id = p_user_id for update; if not found then raise exception 'thread not found' using errcode = 'P0001';/);
    assert.match(body(name), /if v_thread\.forked_from_id is not null then perform public\.recalc_fork_count\(v_thread\.forked_from_id\); end if;/);
  }
});

test("soft delete reuses its timestamp and never extends an already trashed thread", () => {
  const b = body("soft_delete_thread");
  assert.match(b, /if v_thread\.deleted_at is not null then return v_thread\.deleted_at; end if; v_deleted_at := now\(\);/);
  assert.match(b, /update public\.threads set deleted_at = v_deleted_at where id = p_thread_id and user_id = p_user_id;/);
  assert.match(b, /set is_archived = true, archived_by_thread_delete_at = v_deleted_at/);
  assert.match(b, /return v_deleted_at; end;/);
});

test("soft delete archives only owned, unpinned, live, unsuperseded Lore for that thread", () => {
  assert.match(body("soft_delete_thread"), /where source_thread_id = p_thread_id and user_id = p_user_id and is_pinned = false and is_archived = false and superseded_by is null;/);
});

test("restore is idempotent, rejects the inclusive expiry boundary before updates", () => {
  const b = body("restore_thread");
  assert.match(b, /if v_thread\.deleted_at is null then return; end if; if now\(\) >= v_thread\.deleted_at \+ public\.thread_trash_retention\(\) then raise exception 'trash retention expired' using errcode = 'P0001'; end if; update public\.lore_embeddings/);
  assert.match(b, /update public\.threads set deleted_at = null where id = p_thread_id and user_id = p_user_id;/);
});

test("restore clears every matching marker but only unarchives unsuperseded Lore", () => {
  assert.match(body("restore_thread"), /update public\.lore_embeddings as le set archived_by_thread_delete_at = null, is_archived = case when le\.superseded_by is null then false else le\.is_archived end where le\.source_thread_id = p_thread_id and le\.user_id = p_user_id and le\.archived_by_thread_delete_at = v_thread\.deleted_at;/);
});

test("trash listing exposes the specified columns, ownership, expiry and newest first", () => {
  assert.match(rpc("list_trashed_threads"), /returns table\(id uuid, title text, deleted_at timestamptz, expires_at timestamptz, is_public boolean, project_id uuid\)/);
  assert.match(body("list_trashed_threads"), /select t\.id, t\.title, t\.deleted_at, t\.deleted_at \+ public\.thread_trash_retention\(\), t\.is_public, t\.project_id from public\.threads as t where t\.user_id = p_user_id and t\.deleted_at is not null order by t\.deleted_at desc;/);
});

test("service RPCs use definer security and expired listing enforces 1..200 and deterministic order", () => {
  for (const name of Object.keys(services)) assert.match(rpc(name), /language plpgsql security definer set search_path = ''/);
  assert.match(rpc("list_expired_trashed_threads"), /\(p_limit integer\) returns table\(id uuid, user_id uuid\)/);
  assert.match(body("list_expired_trashed_threads"), /if p_limit is null or p_limit < 1 or p_limit > 200 then raise exception 'limit must be between 1 and 200' using errcode = 'P0001';/);
  assert.match(body("list_expired_trashed_threads"), /where t\.deleted_at is not null and now\(\) >= t\.deleted_at \+ public\.thread_trash_retention\(\) order by t\.deleted_at asc, t\.id asc limit p_limit;/);
});

test("purge is one conditional DELETE RETURNING and returns FOUND without fork/storage work", () => {
  assert.match(rpc("purge_expired_thread"), /\(p_thread_id uuid\) returns boolean/);
  assert.equal(body("purge_expired_thread"), "begin delete from public.threads as t where t.id = p_thread_id and t.deleted_at is not null and t.deleted_at <= now() - public.thread_trash_retention() returning t.id into v_id; return found; end;");
});

test("INSERT guard uses a definer FOR SHARE lock, permits missing parents and raises P0001 for trash", () => {
  assert.match(rpc("guard_thread_not_trashed"), /returns trigger language plpgsql security definer set search_path = ''/);
  assert.equal(body("guard_thread_not_trashed"), "begin select t.deleted_at into v_deleted_at from public.threads as t where t.id = new.thread_id for share; if found and v_deleted_at is not null then raise exception 'thread is in trash' using errcode = 'P0001'; end if; return new; end;");
});

test("exactly five INSERT triggers are reapplicable and sort before message numbering", () => {
  const tables = ["messages", "thread_tags", "thread_notes", "message_notes", "drafts"];
  const triggers = [...sql.matchAll(/create trigger ([\s\S]*?);/g)].map(m => `create trigger ${m[1]};`);
  assert.deepEqual(triggers, tables.map(table => `create trigger trg_00_guard_thread_not_trashed before insert on public.${table} for each row execute function public.guard_thread_not_trashed();`));
  for (const table of tables) {
    assert.ok(sql.includes(`drop trigger if exists trg_00_guard_thread_not_trashed on public.${table}; create trigger`));
    const tableDefinition = schema.match(new RegExp(`create table if not exists ${table} \\([\\s\\S]*?\\);`))[0];
    assert.match(tableDefinition, /thread_id\s+uuid/);
  }
  assert.ok("trg_00_guard_thread_not_trashed" < "trg_set_message_number");
  assert.match(schema, /create trigger trg_set_message_number\s+before insert on messages/);
});

test("migration changes no RLS, views, UPDATE/DELETE triggers or Storage", () => {
  assert.doesNotMatch(sql, /(?:create|drop|alter) policy|row level security|(?:create|drop|alter) (?:or replace )?view|\bstorage\./);
  assert.doesNotMatch(sql, /(?:before|after|instead of) (?:insert or )?(?:update|delete)/);
  for (const name of ["ai_usage_events", "likes", "reports"]) assert.ok(migration.includes(name));
});

for (const name of ["get_public_threads_projection", "is_visible_public_message", "is_visible_public_thread_tag", "restore_message_branch", "apply_branch_edit", "recalc_fork_count"]) {
  test(`${name}: existing definition including ACL changes by exactly one specified predicate`, () => {
    const original = definition(previousDefinitions, name, true).replace(/\r\n/g, "\n");
    const actual = definition(migration, name, true).replace(/\r\n/g, "\n");
    const [from, to] = {
      get_public_threads_projection: ["where t.is_public = true;", "where t.is_public = true and t.deleted_at is null;"],
      is_visible_public_message: ["and t.is_public = true", "and t.is_public = true\n      and t.deleted_at is null"],
      is_visible_public_thread_tag: ["and t.is_public = true", "and t.is_public = true\n      and t.deleted_at is null"],
      restore_message_branch: ["and t.user_id = p_user_id", "and t.user_id = p_user_id\n    and t.deleted_at is null"],
      apply_branch_edit: ["where t.id = p_thread_id and t.user_id = p_user_id", "where t.id = p_thread_id and t.user_id = p_user_id and t.deleted_at is null"],
      recalc_fork_count: ["and child.user_id <> parent.user_id", "and child.user_id <> parent.user_id\n      and child.deleted_at is null"],
    }[name];
    assert.equal(original.split(from).length, 2, "exactly one edit site");
    assert.equal(actual, original.replace(from, to));
  });
}

test("all function definitions use CREATE OR REPLACE and transaction ends in schema reload", () => {
  assert.equal((sql.match(/create or replace function public\./g) ?? []).length, 13);
  assert.doesNotMatch(sql, /drop function|create function/);
  assert.match(sql, /commit; NOTIFY pgrst, 'reload schema';$/);
  for (const term of ["事前確認", "適用後確認", "ロールバック方針", "information_schema.columns", "pg_indexes", "pg_get_functiondef", "pg_get_triggerdef", "has_function_privilege", "pg_policies"]) assert.ok(migration.includes(term), term);
});
