---
feature: chat-core
status: 実装済み
verified: 2026-11-26（a19dbc3）
code_paths:
  - app/api/chat/**
  - lib/chat-system-blocks.ts
  - lib/context-window.ts
  - lib/rate-limit.ts
  - lib/lore/chat-search-plan.ts
  - lib/lore/types.ts
  - lib/ai-context-blocks.ts
  - lib/chat-assistant-persistence.ts
  - lib/queryTextRetention.ts
  - lib/openai-responses-input.ts
  - lib/openai-web-search.ts
---
# チャット送受信（chat-core）

## 30秒要約

【コード】`app/api/chat/route.ts` の `POST` は認証・投稿保存を経て AI 応答を逐次返す。メモと temporary は JSON。中核は `lib/chat-system-blocks.ts`、`lib/context-window.ts`、`lib/rate-limit.ts`、`lib/lore/chat-search-plan.ts`、`lib/chat-assistant-persistence.ts`。
- 【コード】地雷1 — Promise Bridge は POST ごとに作り、`finally` で結果を解決する。保存完了前にフォールバックを走らせると同じ応答が競合する。
- 【コード】地雷2 — Claude の system と連結文字列では参照の位置が異なる。並べ替えるとキャッシュ境界や非Claude向けの入力が変わる。
- 【コード】地雷3 — `queryText` は空文字と前後空白も保持し、記憶トリガーは切り詰め前に判定する。
- 【コード】地雷4 — 保存用の蓄積だけを切り詰める。200,000 UTF-16 コード単位（`MAX_ACCUMULATED_CHARS`）を超えても配信は続く。
- 【コード】地雷5 — スレッド個別の `systemPrompt` が真値なら、Project の `system_prompt` は使われない。

## 概要（ユーザーから見た挙動）

- 【コード】通常送信では投稿を保存してから AI の回答を逐次表示し、回答を履歴へ保存する。途中で停止した通常応答は取得済み本文を保存対象とする。メモは入力だけを保存して返す。
- 【コード】temporary は会話メッセージを DB に保存せず、回答をまとめて返す。記憶検索は行わない。Arena は非ストリーミングで、Promise Bridge を使わない。[Arena](/docs/features/arena.md)
- [分岐・再生成](/docs/features/branching-and-regenerate.md) · [リッチ表示](/docs/features/rich-conversation.md) · [モデルと料金](/docs/features/models-and-pricing.md) · [Project Memory](/docs/features/project-memory.md) · [Lore・RAG](/docs/features/lore-rag.md) · [ゴミ箱](/docs/features/trash.md) · [認証とセキュリティ](/docs/features/auth-and-security.md)

## 主要ファイル（route／lib／component／test。行番号は書かない）

| ファイル | 確認する箇所 |
|---|---|
| `app/api/chat/route.ts` | 【コード】`POST`、`pumpSSE`、`streamClaude`／`streamGemini`／`streamOpenAI`、`saveAssistantMessage` |
| `lib/chat-system-blocks.ts`、`lib/context-window.ts`、`lib/rate-limit.ts` | 【コード】`buildClaudeSystemBlocks`・`buildCombinedSystemPrompt`、`trimContextToWindow`、`checkChatRateLimit` |
| `lib/lore/chat-search-plan.ts`、`lib/lore/types.ts`、`lib/ai-context-blocks.ts` | 【コード】`buildChatSearchQueries`・`buildChatLoreSearchPlan`、`CHAT_LORE_SEARCH_POLICY`、`buildReferenceBlock`・`buildCodeReferenceBlock` |
| `lib/chat-assistant-persistence.ts` | 【コード】`resolveAssistantPersistence` と `shouldEmitCitations`。通常保存と REST フォールバックで保存内容の判定を共有する。 |
| `lib/openai-responses-input.ts`、`lib/openai-web-search.ts` | 【コード】`buildResponsesInput`、`streamOpenAIWebSearch` |
| `app/page.tsx`、`components/ChatInput.tsx`、`components/ChatInputCentered.tsx`、`components/ChatPanel.tsx`、`components/MessageBubble.tsx`、`lib/queryTextRetention.ts` | 【コード】Web 送信、再生成・編集の `queryText` の受け渡しとページ内保持 |
| `scripts/chat-route-auth.test.cjs`、`scripts/chat-usage.test.cjs` | 【コード】ストリーミング応答の認証と利用量記録 |
| `scripts/chat-system-blocks.test.cjs`、`scripts/chat-pinned-cache.test.cjs`、`scripts/chat-lore-search-plan.test.cjs` | 【コード】system の順序とマーカー、Pinned・Project Memory・拒否時のリクエスト／応答、検索計画とコードポイント境界 |
| `scripts/chat-web-search.test.cjs`、`scripts/chat-openai-web-search.test.cjs`、`scripts/chat-openai-request-body.test.cjs`、`scripts/chat-rich-display.test.cjs` | 【コード】検索中・引用・異常終了・保存、OpenAI リクエスト形式、リッチ表示での stable 変更 |
| `scripts/query-text-retention.test.cjs`、`scripts/query-text-regeneration.test.cjs` | 【コード】保持条件、再生成・編集での再送とフォールバック |

## データ（テーブル・カラム・RPC・migration 番号）

| 対象 | route との接点 |
|---|---|
| `threads` | 【コード】`id` と `user_id` で所有スレッドを取得し、`project_id`・`deleted_at`・`roleplay_mode` を読む。未作成時は `id`・`title`・`user_id` を upsert して所有状態を再確認する。[v207](/docs/applied/migration_v207_thread_trash.sql) |
| `messages` | 【コード】`id`・`thread_id`・`user_id`・`role`・`content`・`provider` を保存。assistant は必要に応じて `model_id`・`input_tokens`・`output_tokens`・`metadata` も保存する。分岐連携は `is_active`・`message_number`・`branch_root_id`・`branch_index`・`parent_id` と RPC `apply_branch_edit`。[v179](/docs/applied/migration_v179_apply_branch_edit.sql) · [v207](/docs/applied/migration_v207_thread_trash.sql) |
| `project_settings`、`project_memory_topics` | 【コード】所有 Project の設定から `system_prompt`・`folder_type`・`pinned_github_files`・`github_repo`・`github_ref` を読む。topic は `include_in_chat` が真の行が取得対象。[v193](/docs/applied/migration_v193_folder_settings_to_project_settings.sql) · [v196](/docs/applied/migration_v196_project_settings_project_id_contract.sql) · [v204](/docs/applied/migration_v204_project_memory_chat_inclusion.sql) |
| Lore 検索 RPC | 【コード】`lib/lore/search.ts` 経由で `match_lore_embeddings_by_project` と `match_lore_embeddings_v2_by_project` を呼ぶ。[v186](/docs/applied/migration_v186_project_memory_phase_d_read_path.sql) · [v187](/docs/applied/migration_v187_project_memory_phase_e_drop_legacy_rpc.sql) |
| `ai_usage_events` | 【コード】`recordChatUsage` → `recordUsageEvent`。保存経路では先に assistant ID なしで記録し、assistant 保存成功後に同じ利用イベントを ID 付きで更新する。temporary の利用量は assistant ID なしで記録する。[v181](/docs/applied/migration_v181_ai_usage_events.sql) |

## 仕様・契約（不変条件、エラー写像、上限値とその正本の定数名）

**入口・応答形式**

- 【コード】`POST /api/chat` は `requireRouteUser` で認証し、本文・画像条件・スレッド識別子・provider を検証する。モデルは chat 対象かを生成前に検証する。通常の履歴はメモと非アクティブ行を除外して user 本文を付ける。ルート実行時間の設定は 300 秒（`maxDuration`）。
- 【コード】メモは `{ userMessage }`、temporary と生成初期化失敗は `{ userMessage, assistantMessage }` の JSON を返す。通常は `text/event-stream; charset=utf-8` の改行区切り JSON。先頭は `meta`、続いて該当時に `github_progress`・`searching`、本文の `chunk`、該当時に `citations`、終端に `done` を送る。手動 Thinking の `chunk.text` は `kind: "text"`／`"thinking"` の JSON 行を運び、DB 蓄積は本文だけを対象にする。

| 条件 | 応答 |
|---|---|
| 未認証 | 【コード】401、`requireRouteUser` の `Unauthorized`。 |
| JSON の解析失敗、本文が文字列以外、本文と画像入力がともに空、通常送信の `threadId` が不正、provider・モデル不一致 | 【コード】400、JSON の `error`。 |
| 所有スレッドの作成後再取得や light の対象再取得で行が見つからない | 【コード】404。 |
| ゴミ箱内のスレッドを検知、または対象の書き込みでゴミ箱ガードを検知 | 【コード】409、`{ error: "thread is in trash" }`（`threadTrashResponse`）。 |
| `apply_branch_edit` 失敗 | 【コード】ゴミ箱の扱いを先に適用し、`42501` は 403、`P0001` は 400、その他は 500。通常のスレッド・設定・投稿の DB 操作失敗も 500。 |
| レート制限超過 | 【コード】429。JSON の `retryAfter` と `Retry-After` は `Math.ceil((rl.resetAt - Date.now()) / 1000)` の秒数。制限値と残数は `X-RateLimit-Limit`・`X-RateLimit-Remaining`。 |
| キー欠落など生成初期化で捕捉した例外 | 【コード】HTTP 200 の JSON。assistant 本文で設定確認を案内し、通常はその本文を保存する。 |
| 生成中の上流失敗 | 【コード】通常は `providerApiError`／`normalizeProviderError` の一般化した文言を `chunk` で送り、`done.aborted: false`。エラー追記は表示用で、DB 保存判定には蓄積済み本文を渡す。temporary は JSON の assistant 本文をエラー文に置き換える。 |
| 中断 | 【コード】ラッパーまで `AbortError` が伝わると `done.aborted: true`。アダプターが中断を吸収して閉じた場合は `flush` の `done.aborted: false` もあり、保存ステータスは `isAborted`・`usageRef.aborted`・`req.signal.aborted` も見る。 |

**Promise Bridge と保存**

1. 【コード】`POST` のスコープに `dbSaved = false` と `resolveDbSave` を置き、`dbSavePromise` を作る。
2. 【コード】`wrappedStream.start` が変換済みの出力をクライアントへ転送しながら本文を蓄積する。完了時または例外時にステータスを決め、`dbSaved = await saveToDb(status, supabase)` を実行する。保存成功の戻り値だけが `true`。
3. 【コード】`finally` で `resolveDbSave(dbSaved)` を呼んでからストリームを閉じる。実行登録済みの `waitUntil` は `await dbSavePromise` でその結果を待ち、失敗時だけサービスロール設定があれば同じ assistant ID を REST 経由で upsert する。
4. 【コード】`cancel()` は `if (!dbSaved)` のときだけ中断フラグを立てる。通常保存は `onConflict: "id"`、REST は `resolution=merge-duplicates`。ストリーム保存で light が完了以外なら `resolveAssistantPersistence` が元の assistant スナップショットを返す。初期化失敗の JSON 経路は別処理で、エラー本文を保存する。

- 【コード】200,000 UTF-16 コード単位（`MAX_ACCUMULATED_CHARS`）が保存用本文の蓄積上限。超過すると先頭を残して `TRUNCATION_NOTICE`（「[…以降は長さ上限により省略されました]」）を付け、それ以降もクライアントへの転送は継続する。

**system・キャッシュ**

- 【コード】`systemPrompt` が真値なら採用し、偽値なら Project の `system_prompt` を参照する。stable には発言者ラベルの注意と、`shouldInjectKabeCardRules` が許可したリッチ表示の規則を置く（`richDisplay === true` が前提）。GitHub 探索は追加前の `baseStableSystemPrompt` を使う。
- 【コード】Claude は stable → Project Memory（存在時に一つのブロック）→ Pinned（存在時）→ dynamic。空・空白のブロックは省く。上限は system 3 個（`MAX_SYSTEM_CACHE_MARKERS`）、`streamClaude` の message anchor 用 1 枠を加えてリクエスト全体で最大 4 個。枠が不足する場合は stable と最後の非空 cached を優先し、残りは先頭側から付ける。dynamic にマーカーは付かない。Claude への送信には `anthropic-beta: prompt-caching-2024-07-31` を付ける。
- 【コード】非Claude・GitHub Tool Loop・トークン見積もりの連結文字列は `buildCombinedSystemPrompt` と `cachedInsertionIndex` で stable → dynamic の前半（検索結果・参加者情報があればここ）→ cached 群 → dynamic の後半（探索結果があればここ）の順を復元する。
- 【コード】`buildReferencePreamble` の前置きは Project Memory・Pinned の各 cached ブロックがそれぞれ持ち、dynamic の参照群は `appendReferenceBlock` が初回だけ付ける。3 系統が揃えば合計 3 個。コード参照は `sanitizeReferenceCodeText` が `reference_data` 開閉タグだけを分断する。空白や改行を含む閉じタグも対象で、`reference_database`、JSX の閉じタグは保持する。コード用メタデータはキーを整形し、値は改行・タブ等を空白にして同じ封筒処理を通す。`&` は保持する。

**検索入力とレート制限**

- 【コード】`queryText` は文字列なら空文字・前後空白を含めそのまま使う。欠落または文字列以外は `userContent` へフォールバックする。`triggerText` を切り詰める前に `CHAT_MEMORY_TRIGGER_KEYWORDS` の 19 語を部分一致で判定する。Memory は非 temporary・OpenAI キーあり・トリガー一致が条件。Lore Book は `loreEnabled`・OpenAI キー・検索対象 Project が必要。メモは計画前に return する。
- 【コード】`buildChatSearchQueries` は Memory に `triggerText` の先頭、Lore Book に添付込み `userContent` の先頭を使う。各上限は 2,000 コードポイント（`CHAT_LORE_SEARCH_POLICY.query.maxCodePoints`）。`Array.from` で絵文字などのサロゲートペアを分断せずに切る。
- 【コード】両方有効で切り詰め後のクエリが同じなら embedding を共有し、異なれば並列生成する。片方の結果が `null` なら成功側を継続。共通の `AbortController` の期限は 3,000 ms（`CHAT_LORE_SEARCH_POLICY.combined.timeoutMs`）。route が渡す件数・閾値は Lore Book 3 件（`CHAT_LORE_SEARCH_POLICY.loreBook.topK`）、Memory 5 件（`CHAT_LORE_SEARCH_POLICY.memory.topK`）・0.3（`CHAT_LORE_SEARCH_POLICY.memory.matchThreshold`）。検索失敗時も生成に進む。
- 【コード】通常 Web 送信は添付前の手入力を別送し、temporary の Web 送信では省く。route は検索入力にだけ `queryText` を使い、DB・system・ログに加えない。`messages.content` は添付込みの `userContent`。
- 【コード】`checkChatRateLimit` はユーザー単位の Upstash スライディングウィンドウ。20 リクエスト（`CHAT_RATE_LIMIT_POLICY.limit`）／1 分（`CHAT_RATE_LIMIT_POLICY.window`）。temporary・メモは呼び出しを省き、Upstash 用設定が未設定なら通過させる。

**コンテキスト・プロバイダー**

- 【コード】`POST` は参照を組み立ててから `trimContextToWindow` を呼ぶ。80,000 トークンの概算枠（`maxInputTokens`）から system・画像・応答予約 2,000 トークン（`responseReserveTokens`）を引く。直近 6 ターン（`anchorTurns`）を優先し、履歴を新しい順に採用する。予算が尽きても末尾を残す。古い履歴を落とす通常経路では `STUB_TEXT` を付ける。概算は 3.5 UTF-16 コード単位／トークン（`CHARS_PER_TOKEN`）、メッセージあたり 10 トークン（`MESSAGE_OVERHEAD_TOKENS`）、画像あたり 1,500 トークン（`IMAGE_TOKEN_ESTIMATE`）。
- 【コード】`computeAnchorIndex` はトリム後の末尾から二番目が assistant ならその位置、それ以外は負の番兵を返す。`streamClaude` は番兵の場合に `messages.length - 2` を再計算し、該当位置があれば role を再確認せずマーカーを付ける。
- 【コード】OpenAI の Chat Completions は `getOpenAICapability` の `tokenParam`（`gpt-4o` は `max_tokens`、他の対象は `max_completion_tokens`）で上限 8,192 トークン（`CHAT_OPENAI_CONFIG.maxOutputTokens`）を渡し、`stream_options: { include_usage: true }` を付ける。`gpt-5.5-pro` は `api: "responses"` で分岐し、上限 8,192 トークン（`OPENAI_RESPONSES_CONFIG.maxOutputTokens`）を渡す。`buildResponsesInput` で画像を変換し、一括取得した本文を enqueue する。OpenAI Web 検索は別の Responses ストリーミング分岐。
- 【コード】Claude の `stop_reason: "refusal"` は応答ごとに一度だけ本文末尾へ追記する。`PROJECT_MEMORY_TOPICS_LABEL` があれば「（AIの安全基準により、この内容には回答できず、Project Memoryの「チャットに含める」がONのtopicが原因の可能性があります）」、なければ「（AIの安全基準により、この内容には回答できませんでした）」。通常チャットでは追記も保存本文・履歴に入る。`logger.claudeRefusal` に渡す値は `memoryTopicsInjected`・`pinnedInjected`・`modelId`。OpenAI Web 検索では不完全応答の `content_filter` を専用メッセージに写像する。通常 OpenAI の本文処理と Gemini の異常終了ログには Claude と同じ誘導文はない。

## 既知の地雷

- 【コード】固定待機やモジュール共有に戻すと同一応答の保存が競合し、`finally` を欠くとフォールバックが待ち続ける。`POST` の `dbSavePromise`・`resolveDbSave`・`cancel` を見る。
- 【コード】ストリームが `done` を通知しても DB 保存を確定したとは限らない。`outputStream.flush` が完了通知を作り、保存の成否は `wrappedStream` の `saveToDb` が判定する。
- 【コード】表示と DB の本文長が食い違う。`appendToAccumulated` は保存分だけを 200,000 UTF-16 コード単位（`MAX_ACCUMULATED_CHARS`）で切り、`outputStream` は転送を続ける。
- 【コード】Project 側の指示が効かない場合は、リクエストのスレッド個別 `systemPrompt` を確認する。`POST` の `if (!resolvedSystemPrompt)` で Project 側を補うため、両方は合成されない。
- 【コード】`queryText` の trim は embedding 共有を崩し、先に切り詰めると末尾のトリガーを取りこぼす。`buildChatSearchQueries` と `buildChatLoreSearchPlan` を見る。「好み」はトリガー、「好物」はトリガーに含まれない（`CHAT_MEMORY_TRIGGER_KEYWORDS`）。【資料】目印となる記憶と語の有無で応答を比較する手順は課題B完了 §5・§7。要実測。
- 【コード】コード参照に散文用の `sanitizeReferenceText` を使うと JSX などの閉じタグが変わる。GitHub のコード封筒には `buildCodeReferenceBlock` を使う。前置きを全体で一つにすると cached ブロックの自己完結性を失う。
- 【コード】トリム前の位置でマークすると省略注記の挿入後にアンカーがずれる。`trimContextToWindow` の戻り値と `streamClaude` の負の番兵時フォールバックを見る。
- 【コード】トリム後の入力は概算枠を超えうる。`trimContextToWindow` は予算不足時も末尾を残す。枠・優先ターン・応答予約は `POST` の指定と関数の既定値に直書き。【未確認】この三つの値を一元管理する名前付き定数。
- 【資料】Claude のキャッシュは先頭一致に依存する。Pinned の取得結果が変わると後続の一致を失いうるため、`buildPinnedGithubContext` の結果と `buildClaudeSystemBlocks` の境界を見る。【未確認】実サービスの TTL・最小トークン数・課金倍率・ヒット量。要実測。
- 【コード】OpenAI／Gemini 向けは `combinedSystemPrompt` に stable を先頭で含み、明示的なキャッシュ制御を送らない。【未確認】自動 prefix キャッシュの実際のヒット条件と効果。要実測。
- 【コード】小説モードの「Caching 有効」は `components/Sidebar.tsx` がプロンプト長で表示する。【未確認】5,000 文字の名前付き定数と、表示と実サービスの最小キャッシュトークン数の対応。表示だけでヒットと判断すると誤る。
- 【コード】手動 Thinking の場合は GitHub Tool Loop が動かない。探索側は `combinedSystemAtCurrentPosition(baseStableSystemPrompt)` を受け取る。探索で Claude 本応答のキャッシュ構造を期待すると入力が違うため、`runGithubToolLoop` と `streamClaude` を見る。
- 【コード】保持コールバックの依存配列が空でも、`app/page.tsx` では `useState` で作ったページ内ストアを参照する。ストアの寿命を変えると `getRetainedQueryText` が古いストアを参照しうる。【資料】依存関係の lint 警告は課題B完了 §7 に記録。要実測。
- 【コード】light は `ChatPanel` の `orderedMessages` を見て入力を解決し、`handleRegenerate` は `messages` から対象を探す。順序がずれると編集先もずれうる。手入力と添付の再結合に失敗すると toast で中断する。[分岐・再生成](/docs/features/branching-and-regenerate.md)
- 【コード】`app/api/chat/route.ts` と `components/ChatInputCentered.tsx` の作業ツリーの行末は 2026-11-26 のローカル確認で CRLF。変換すると広範囲に差分が出るため、編集時は対象ファイルの行末を保つ。

## 確定した判断（日付・判断者・理由・出典。D番号があれば維持）

資料の略称は「出典」に記載する。実装日・記録日だけ確認できた場合は、その区別を記す。

| 日付・判断者 | 判断と理由 | 出典 |
|---|---|---|
| 2026-06-03 実装、判断者【未確認】 | 【資料】v111 Fix 1。Upstash reset は時刻のミリ秒なので秒換算式を維持し、確認ログだけ削除。 | v111 修正メモ Fix 1、`998f201` |
| 2026-06-03 実装、判断者【未確認】 | 【資料】v111 Fix 2〜5。アンカーはトリム後の履歴から得る。Lore は期限付きの関数呼び出しにして自己 HTTP 呼び出しを外す。スレッド作成競合には重複無視の upsert を使い既存タイトルを守る。保存本文の肥大化を抑えつつ配信を継続する。 | v111 修正メモ Fix 2〜5、`ce21210` |
| 2026-10-02、判断者【未確認】 | 【資料】タスク3。Pinned を Claude の専用キャッシュブロックに置き、取得順を固定してターン間で同じ入力を再現する。設定 5 件（`PINNED_GITHUB_FILES_MAX`）・集計 60,000 UTF-16 コード単位（`MAX_TOTAL_PINNED_CHARS`）を維持。 | Pinned キャッシュ化 v1 §3-A・§4・§5、課題B完了 §0、`b5f1a97` |
| 2026-10-02 実装、判断者【未確認】 | 【資料】タスク3の範囲は system 構造とキャッシュに絞り、Promise Bridge・DB は変更対象外とした。無害化・検索一本化は課題Bへ。受け入れは system リクエスト構造のテストと、連続する2ターン目の `cache_read_input_tokens` の増加確認。実サービス側は要実測。 | Pinned キャッシュ化 v1 §4・§5、課題B完了 §0 |
| 2026-10-04 実装、Rui | 【資料】B2-0。temporary で未分類の記憶を読ませない変更を先に独立させた。 | 課題B完了 §2-5・§3、`cf324fa` |
| 2026-10-04 実装、Rui | 【資料】案(b)。コード参照は封筒タグだけを分断する。散文用の全閉じタグ置換でコードの意味が変わるため。保護範囲は参照封筒の構造。 | 課題B完了 §2-1・§3、`cf324fa` |
| 2026-10-05 資料記録、判断日【未確認】、Rui | 【資料】cached と dynamic の各参照群で前置きの重複を許容し、ブロックを自己完結させる。 | 課題B完了 §2-4・§3 |
| 2026-10-04 実装、判断者【未確認】 | 【資料】B2-2。通常送信の `queryText` は前後空白を保持し、切り詰め後のクエリが一致するケースの embedding 共有を守る。上限は独自の余裕を取った 2,000 コードポイント（`CHAT_LORE_SEARCH_POLICY.query.maxCodePoints`）。route が値を渡し、純関数の `maxCodePoints` が受け取る。 | 課題B完了 §2-5・§2-6・§3、`a51c169` |
| 2026-10-05、判断者【未確認】 | 【資料】レビューを受け `messages.metadata.query_text` への永続化案を撤回。マスク編集（`PATCH "/api/messages/[id]"`）や light 再生成が本文を書き換えると値が古くなり、検索専用契約の変更やサーバー改修も要るため。記録時本文との完全一致と `splitMessageContent` 成功を再利用条件にし、添付なし（`queryText === content`）は保持しない。対象はテキスト添付で、編集時の手入力は既存モーダルの trim に従う。 | 課題B完了 §2-8・§3、`09e93b9` |
| 2026-10-05 実装、判断者【未確認】 | 【資料】`lightEditQueryText` と `branchEditQueryText` を別 props にした。light はメモを含む `orderedMessages`、branch は `visibleMessages` の非メモ user が対象で、対象の選び方が異なるため。 | 課題B完了 §2-8・§3、`09e93b9` |
| 2026-10-05、Rui | 【資料】Lore Book の添付検索は据え置き。手入力が検索枠の 2,000 コードポイント（`CHAT_LORE_SEARCH_POLICY.query.maxCodePoints`）を超える頻度は低いと判断し、頻度が増えたと Rui が判断した時点で再検討する。 | 課題B完了 §3・§6-B1 |
| 2026-10-31 実装、判断者【未確認】 | 【コード】D37。Pro の画像付き入力を `buildResponsesInput` で Responses 形式へ変換し、Web 検索側と変換を共用する。理由は Chat Completions 形式を Pro に送ると入力型が合わないため。【資料】Rui が 2026-10-31 にプローブした記録がある。 | CLAUDE.md「チャット・UI関連」、`fb4d5c6` |

## 未実装・残課題（backlog の ID が不明なものは「backlog 未登録」と書く）

- 【資料】backlog 未登録。手入力が検索枠を使い切ると Lore Book の添付は検索対象に入らない。再検討条件は確定した判断を参照。課題B完了 §6-B1。
- 【資料】backlog 未登録。ページ再読み込みをまたぐ `queryText` の永続保持。記憶の誤発火が目立つ場合に再検討し、本文更新経路との整合と保存契約の見直しが前提。課題B完了 §6-B2。
- 【コード】backlog 未登録。通常 OpenAI・Gemini での Claude 相当の拒否案内と、保存済み Claude 拒否案内を後続履歴から除外する処理。課題B完了 §6-B3、CLAUDE.md「refusal時の誘導文」。
- 【資料】backlog 未登録。Pinned の連続応答でのキャッシュ読み取り量、目印のある記憶の発火、切断時と復旧時の保存挙動は要実測。この文書の根拠はローカルの静的照合。

## 履歴（主要コミット1行ずつ。git log で確認できたものだけ）

- 【コード】2026-04-30 `2988623` — Promise Bridge で毎回フォールバック保存が走る挙動を修正。
- 【コード】2026-06-03 `5713598` — コンテキストトリム・レート制限を追加。
- 【コード】2026-06-03 `ce21210` — v111。アンカー・Lore 直接呼び出し・スレッド upsert・蓄積上限。
- 【コード】2026-09-15 `9165d17` — チャットの Project 文脈を `project_id` 基準へ変更。
- 【コード】2026-10-02 `b5f1a97` — Pinned を Claude の専用キャッシュブロックへ。
- 【コード】2026-10-02 `fac3277` — オプトインした Project Memory のチャット連携。
- 【コード】2026-10-03 `36a09b0` — Claude refusal の案内と注入状況ログ。
- 【コード】2026-10-04 `cf324fa` — GitHub コード封筒・temporary での記憶検索抑止。
- 【コード】2026-10-04 `d0a73b5` — 記憶検索経路を一本化。
- 【コード】2026-10-04 `a51c169` — 手入力と添付の検索入力を分離し、コードポイント上限を導入。
- 【コード】2026-10-05 `09e93b9` — 再生成・編集でページ内保持した手入力を再利用。
- 【コード】2026-10-23 `f847b2a` — ゴミ箱内スレッドの書き込みガード。
- 【コード】2026-10-31 `04cc9ab` — Claude Web 検索を route に接続。
- 【コード】2026-10-31 `eea4db6` — OpenAI Web 検索の Responses ストリーム。
- 【コード】2026-10-31 `fb4d5c6` — D37。Pro の画像入力を Responses 形式へ修正。
- 【コード】2026-10-31 `a9d7044` — リッチ表示 ON 時の system 注入。

## 出典（旧資料名と節）

- 【資料】チャット参照元整理 課題B完了 v10（本文の「課題B完了」） §0、§2-1・§2-4〜§2-8、§3、§5、§6-B1〜B3、§7。
- 【資料】KabeHub v111 修正メモ（本文の「v111 修正メモ」） Fix 1〜5。
- 【資料】チャット参照元整理 Pinned キャッシュ化 v1（本文の「Pinned キャッシュ化 v1」） §0〜§2、§3-A、§4〜§7。
- 【資料】CLAUDE.md「ストリーミング（chat/route.ts）」「/api/chat の検索クエリ契約」「チャット・UI関連」「RAG関連」の該当行、「refusal時の誘導文」、「API Routes（チャット・スレッド）」・「Lib」の該当行。
- 【資料】[抽出メモ](/docs/_reorg/extract/chat-core.md) · [CLAUDE.md 訂正候補](/docs/_reorg/claude-md-corrections.md) · [T5 照合記録](/docs/_reorg/conflicts/T5.md) · [T5 出典対応表](/docs/_reorg/source-map/T5.md)
