#!/usr/bin/env node
/**
 * scripts/verify-project-memory-mvp.mjs
 *
 * 実装順5: 初期4topicでのMVP動作確認
 * Project Memory Manager (仮) の Update Protocol API を test環境に対して
 * 実際に POST -> GET(一覧/単体) -> PATCH(full/partial) -> 楽観ロック(409)
 * の順で叩き、raw JSONをそのまま出力する。
 * 手動実行専用。test環境以外、特に本番環境に対しては絶対に実行しないこと。
 *
 * 事前準備:
 *   1. .env.test.local を作成し、以下を設定（絶対にコミットしない）
 *        SUPABASE_TEST_URL=<test環境のURL>
 *        SUPABASE_TEST_ANON_KEY=...
 *        TEST_USER_EMAIL=...
 *        TEST_USER_PASSWORD=...
 *        TEST_PROJECT_ID=...        # 省略可。指定が無ければ自動でprojectを1件作成する
 *        API_BASE_URL=http://localhost:3000  # test環境DBを向いたdevサーバー
 *   2. .env.local（アプリ側）が上記と同じtest環境を
 *      向いた状態で `npm run dev` を起動しておく
 *
 * 実行:
 *   node --env-file=.env.test.local scripts/verify-project-memory-mvp.mjs
 *
 * project作成について:
 *   - projectsテーブルは "projects: insert own" RLS（auth.uid() = user_id）で
 *     authenticatedロールにINSERTが許可されているため、専用APIルートが無くても
 *     ログイン済みSupabaseクライアントから直接INSERTできる。
 *   - TEST_PROJECT_ID未指定時は `mvp-verify-<timestamp>` という名前で
 *     projectを1件自動作成し、そのidを使う（UNIQUE(user_id, name)により
 *     複数回実行しても衝突しない）。
 *   - この自動作成処理は、post-MVPバックログ「検証用project作成APIの正式実装」の
 *     叩き台として利用できる。
 *
 * 注意:
 *   - DELETE APIは未実装（MVP方針で削除禁止）のため、作成したtopicは
 *     test DBに残り続ける。同一project_idに対する2回目以降の実行は
 *     topic_key の重複で POSTが 409 "topic already exists" になる
 *     想定通りの結果になる。project自動作成モードなら毎回新しいprojectに
 *     なるためこの制約は気にしなくてよい。
 *   - 各ステップの結果は [FAIL] というプレフィックスで異常を出力する。
 *     「成功しました」的なサマリーは出さない方針（raw log verification）。
 */

import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_TEST_URL,
  SUPABASE_TEST_ANON_KEY,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  TEST_PROJECT_ID,
  API_BASE_URL = "http://localhost:3000",
} = process.env;

function assertEnv(name, value) {
  if (!value) {
    console.error(`[ENV MISSING] ${name} が設定されていません`);
    process.exit(1);
  }
}

[
  ["SUPABASE_TEST_URL", SUPABASE_TEST_URL],
  ["SUPABASE_TEST_ANON_KEY", SUPABASE_TEST_ANON_KEY],
  ["TEST_USER_EMAIL", TEST_USER_EMAIL],
  ["TEST_USER_PASSWORD", TEST_USER_PASSWORD],
].forEach(([n, v]) => assertEnv(n, v));

const supabase = createClient(SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY);

let failCount = 0;

function log(label, data) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(data, null, 2));
}

function fail(message) {
  failCount += 1;
  console.error(`[FAIL] ${message}`);
}

async function api(method, path, token, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function main() {
  // 1. ログインしてaccess_tokenを取得
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
  if (signInError) {
    console.error("[LOGIN FAILED]", signInError.message);
    process.exitCode = 1;
    return;
  }
  const token = signInData.session.access_token;
  log("LOGIN", { userId: signInData.user.id });

  // 0. TEST_PROJECT_ID未指定なら検証用projectを自動作成
  //    (RLS "projects: insert own" により、ログイン済みクライアントから直接INSERT可能)
  let projectId = TEST_PROJECT_ID;
  if (!projectId) {
    const projectName = `mvp-verify-${Date.now()}`;
    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .insert({ user_id: signInData.user.id, name: projectName })
      .select("id, name, created_at")
      .single();
    if (projectError) {
      console.error("[PROJECT CREATE FAILED]", projectError.message);
      process.exitCode = 1;
      return;
    }
    log("CREATED PROJECT", projectRow);
    projectId = projectRow.id;
  } else {
    log("USING EXISTING PROJECT_ID", { projectId });
  }

  const topicKeys = ["overview", "current-work", "principles", "references"];
  const created = {};

  // 2. POST x4 - topic作成
  for (const key of topicKeys) {
    const { status, json } = await api(
      "POST",
      `/api/projects/${projectId}/memory/topics`,
      token,
      {
        topic_key: key,
        content_md: `# ${key}\n\n(MVP動作確認用の初期コンテンツ)`,
      },
    );
    log(`POST topics (${key}) -> ${status}`, json);
    if (status !== 201) {
      fail(`POST ${key} が201ではありません（既存データが残っている可能性）`);
      continue;
    }
    created[key] = json.topic;
  }

  if (!created["overview"]) {
    console.error(
      "\noverviewの作成に失敗したため、以降のGET/PATCH検証はスキップします。",
    );
    process.exitCode = 1;
    return;
  }

  // 3. GET一覧
  {
    const { status, json } = await api(
      "GET",
      `/api/projects/${projectId}/memory/topics`,
      token,
    );
    log(`GET topics (list) -> ${status}`, json);
    const keys = (json.topics ?? []).map((t) => t.topic_key);
    const sorted = [...keys].sort();
    if (JSON.stringify(keys) !== JSON.stringify(sorted)) {
      fail("一覧がtopic_key昇順になっていません");
    }
    if ((json.topics ?? []).some((t) => "content_md" in t)) {
      fail("一覧レスポンスにcontent_mdが含まれています（含まれない契約のはず）");
    }
  }

  // 4. GET単体
  const overviewId = created["overview"].id;
  {
    const { status, json } = await api(
      "GET",
      `/api/projects/${projectId}/memory/topics/${overviewId}`,
      token,
    );
    log(`GET topics/:id (overview) -> ${status}`, json);
    if (!json?.topic || !("content_md" in json.topic)) {
      fail("単体取得にcontent_mdが含まれていません");
    }
  }

  // 5. PATCH full編集
  let currentRevision = created["overview"].revision; // 1のはず
  {
    const { status, json } = await api(
      "PATCH",
      `/api/projects/${projectId}/memory/topics/${overviewId}`,
      token,
      {
        expected_revision: currentRevision,
        edit_kind: "full",
        new_content_md: "# overview\n\n(full編集で更新済み)",
      },
    );
    log(`PATCH full edit -> ${status}`, json);
    if (status !== 200 || json?.topic?.revision !== currentRevision + 1) {
      fail("full編集後のrevisionが期待通りインクリメントされていません");
    } else {
      currentRevision = json.topic.revision;
    }
  }

  // 6. PATCH partial編集
  {
    const { status, json } = await api(
      "PATCH",
      `/api/projects/${projectId}/memory/topics/${overviewId}`,
      token,
      {
        expected_revision: currentRevision,
        edit_kind: "partial",
        old_text: "full編集で更新済み",
        new_text: "partial編集で置換済み",
      },
    );
    log(`PATCH partial edit -> ${status}`, json);
    if (
      status !== 200 ||
      !json?.topic?.content_md?.includes("partial編集で置換済み")
    ) {
      fail("partial編集の置換結果が反映されていません");
    } else {
      currentRevision = json.topic.revision;
    }
  }

  // 7. 楽観ロック確認（stale revisionで409）
  {
    const staleRevision = currentRevision - 1;
    const { status, json } = await api(
      "PATCH",
      `/api/projects/${projectId}/memory/topics/${overviewId}`,
      token,
      {
        expected_revision: staleRevision,
        edit_kind: "full",
        new_content_md: "この更新は失敗するはず",
      },
    );
    log(`PATCH with stale revision -> ${status}`, json);
    if (status !== 409) {
      fail("stale revisionで409になっていません（楽観ロックが機能していない）");
    }
  }

  console.log(
    failCount === 0
      ? "\n=== 全ステップ完了。[FAIL]なし ==="
      : `\n=== 全ステップ完了。[FAIL] ${failCount}件あり。上記ログを確認 ===`,
  );
}

main().catch((err) => {
  console.error("[UNCAUGHT ERROR]", err);
  process.exitCode = 1;
});
