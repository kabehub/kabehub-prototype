# 抽出メモ: chat-core（①-2）

作成: 2026-11-25／対象: `/api/chat`、ストリーミング、system ブロック・キャッシュ、context window、rate limit、queryText 契約、参照ブロックの無害化。
タグ: 【資料】＝読んだ資料に書かれている／【コード】＝実ファイルを grep で確認／【未確認】＝資料のみで現行コードと未突合。
略称: v10＝チャット参照元整理 課題B完了 v10（2026-10-05）、v111＝`KabeHub_v111_修正メモ`、CC＝CLAUDE.md。

## 確定した判断

1. **temporary チャットは記憶（未分類 Lore）を読まない**。B2-0 として最初に独立して push（`cf324fa`）。判断者: Rui。出典: v10 §2-5・§3。【資料】【コード】（`buildChatLoreSearchPlan` の `wantsMemory = !isTemporary && …`）
2. **コード本文の無害化は「封筒タグだけ」**（案(b)）。散文用の `</` 全置換はコードの意味を壊すため、`reference_data` 開閉タグのみ無力化する。守るのは封筒構造であり、インジェクション全般の防御とは謳わない。判断者: Rui。出典: v10 §2-1・§3。【資料】
   - 正規表現 `/<(?=\s*\/?\s*reference_data(?:[\s/>]|$))/gi` → `"<\u200b"`。`<\n/reference_data>` も対象、`<reference_database>` は対象外、冪等。meta は専用処理（キーは `[^a-zA-Z0-9_-]`→`_`、値の改行類は空白、`&` はエスケープしない）。【資料】
3. **preamble 重複は許容**。判断者: Rui。個数は `(references||loop?1:0)+(memory?1:0)+(pinned?1:0)`。出典: v10 §2-4・§3。【資料】
4. **トリガー判定の `queryText` は trim しない**（通常送信）。`" 前回の話 "` で `sharedEmbedding`（memoryQuery と loreBookQuery の一致）が崩れるため。出典: v10 §3。【資料】
5. **検索クエリ上限は `maxCodePoints`（2,000）**。`maxChars` から変更。純関数は定数を import せず route が渡す。2,000 は OpenAI の制限（8,192トークン）ではなく独自の保守値。出典: v10 §2-5・§2-6・§3。【資料】
6. **バッジは「注入中」表記を維持し、未注入には理由を付ける**（「未注入（上限超過）」「未注入（本文が空）」）。判定の正本は `summarizeChatInclusion`、行側は id 集合で判定。判断者: Rui。コミット `9c2411b`。出典: v10 §2-7・§3。【資料】
7. **queryText 保持は session-only（メモリ内のみ）**。当初の `messages.metadata.query_text` への DB 保存案（A）を、ChatGPT レビューを受けて撤回。理由: ①マスク編集（`PATCH /api/messages/[id]`）と light 再生成が `content` を書き換えると古い値が残る ②「保存・注入・ログに使わない」契約の改訂が要る ③影響が小さい任意機能にサーバー変更は釣り合わない。コミット `09e93b9`、2026-10-05。出典: v10 §2-8・§3。【資料】
   - 信頼条件は「記録時の `content` と現在の `message.content` の一致＋`splitMessageContent` 成功」。別経路で本文が変わると自動で無効化するため、`forget` を各経路に散らさない。【資料】
   - 添付なし（`queryText === content`）は記録しない。保持対象は添付**テキストファイル**のみ（画像は別経路）。編集時の `queryText` は trim 済み（編集モーダルが従来から trim するため）。【資料】
8. **light と branch で props を分離**（`lightEditQueryText`／`branchEditQueryText`）。light は memo を含む `orderedMessages`、branch は非 memo の `visibleMessages` を走査するため。既存の memo の癖は直さず新機能を引きずらせない。出典: v10 §2-8・§3。【資料】【コード】（`MessageBubble.tsx` に該当 props を確認）
9. **Lore Book への添付検索は据え置き**（2026-10-05、Rui 判断）。手入力が2,000コードポイントを超えるメッセージは稀と見る。再開条件は「Rui が頻度が高くなったと感じたとき」。たたき台: A＝2,000字を手入力と添付で予算配分（例 1,200＋800、埋め込み1回）／B＝添付だけ別クエリにしてマージ（埋め込み1回増、topK 配分とマージ規則が必要）／C＝添付要約（LLM 呼び出しが重く見送り）／D＝据え置き。出典: v10 §3・§6-B1。【資料】
10. **`lib/proxy-paths.ts` の配置は現状維持**。直接 import 元は `proxy.ts`・`app/auth/callback/route.ts`・`lib/supabase/route-auth.ts`・`scripts/proxy-paths.test.cjs`・`scripts/proxy.test.cjs` の5つ。出典: v10 §3。【資料】
11. **未使用コードの削除可否は「実コード側の参照」で判定する**（`app`/`lib`/`components`/`scripts`/`apps/mobile` の単語境界検索）。`docs/audit/` の過去監査レポート内の参照は履歴記録で、判定に含めず書き換えない。前方一致の別名（`LoreSearchOptionsV2ForProject`）と取り違えない。`LoreSearchOptionsV2` を `123b642` で削除。出典: v10 §3・§7。【資料】
12. **Project Memory のチャット注入は ON 時点のみ上限チェック**（RPC v204 側）。ON 後に本文が増えると「未注入（上限超過）」が実際に起きうる。出典: v10 §3。【資料】
13. **v111 修正メモ（コードレビューその2に基づく5件。日付は資料に無い）**。出典: v111 修正メモ Fix 1〜5。
    - Fix 1 Retry-After: 修正不要。Upstash の `reset` は13桁ミリ秒で `(resetAt - Date.now())/1000` は正しい。確認用ログ行 `[rate-limit] reset raw value` のみ削除。【資料】【コード】（`app/api/chat/route.ts:784,792` の式と、`lib/rate-limit.ts` に当該ログが無いことを確認）
    - Fix 2 キャッシュアンカー: 配列インデックスではなく `trimContextToWindow` が返す `cacheAnchorIndex` を `streamClaude` に渡す（トリミング後に `truncationStub` が先頭に入ってもアンカーがずれない）。`arena/route.ts` は `streamClaude` 不使用で対象外。【資料】【コード】（`lib/context-window.ts` に `cacheAnchorIndex`／`computeAnchorIndex`）
    - Fix 3 Lore セルフコール廃止: `/api/chat` が自身の `/api/lore/search` を HTTP で呼ぶ構成を、関数呼び出し＋3,000ms タイムアウトに置換し `app/api/lore/search/route.ts` を削除。【資料】【コード】（`app/api/lore/search/` は空ディレクトリ、`lib/lore.ts` は無く検索は `lib/lore/search.ts` に移行済み）
    - Fix 4 スレッド作成 TOCTOU: `SELECT→INSERT` を `upsert({onConflict:"id", ignoreDuplicates:true})` に。既存タイトルは上書きしない。【資料】【コード】（`app/api/chat/route.ts:841`）
    - Fix 5 `accumulatedText` 上限: 防衛的に上限を設け、超過後は蓄積停止、クライアントへのストリームは継続、DB には超過時点までを保存。【資料】【コード】（実装は資料の 200KB でなく `MAX_ACCUMULATED_CHARS = 200_000` 文字＋`TRUNCATION_NOTICE` 追記。矛盾欄を参照）
14. **Pinned Files を Claude の prompt cache 対象にする**（タスク3）。Claude の system を `[stable(cache)] → [pinned(cache)] → [dynamic]` の順の3ブロック（Pinned が無ければ従来の2ブロック）にし、`cache_control` のブレークポイントは stable・pinned・messages アンカーの3つ（上限4以内）。OpenAI／Gemini は連結文字列の**順序だけ**が `stable + pinned + dynamic` になり内容は不変。Pinned の取得順は `Promise.allSettled` の index 順で決定的、同内容なら連続ターンでバイト一致。上限（5ファイル＝`PINNED_GITHUB_FILES_MAX`、合計60,000字＝`MAX_TOTAL_PINNED_CHARS`）は変えない。2026-10-02、コミット `b5f1a97`。出典: Pinnedキャッシュ化 v1 §3-A・§4・§5、v10 §0。【資料】【コード】（`lib/github.ts` の上限定数を確認。現行 system の順序は CC の「Claude system block」の地雷表と一致）
15. **Pinned キャッシュ化は Promise Bridge・DB に触れない**。制約: `resolveDbSave`／`dbSavePromise`／`wrappedStream.finally`／`waitUntil` を変えない、migration・RPC 追加なし、課題B（Pinned／Tool Loop の無害化・メモリ検索の二重経路）は混ぜず別タスク（後に B1／B2 として完了）。受け入れは、`system` 配列の構造（ブロック数・順序・`cache_control` の有無）を自動テストで検証、本番で2ターン連続送信して2ターン目の `cache_read_input_tokens` が Pinned 分増えることを `[Cache]` ログ／`ai_usage_events` で確認。テストは `scripts/chat-pinned-cache.test.cjs`（既存の `project-memory-phase-d-chat-invariant.test.cjs` の `upstreamBodies` 捕捉の流儀）。出典: Pinnedキャッシュ化 v1 §4・§5。【資料】【コード】（`scripts/chat-pinned-cache.test.cjs` は CC に記載あり）
16. **着手順は 3→2→1**（Pinned キャッシュ化→Project Memory topic のチャット注入→設定ドロワーのタブ化）。ドロワーのUIは topic 注入トグルの置き場所が決まってから整理した方が手戻りが少ない。いずれも v10 §0 で完了。出典: Pinnedキャッシュ化 v1 §0。【資料】
17. **topic 注入の方式は案③（topic ごとの「チャットに含める」トグル・オプトイン）を推奨**。案①自動参照（見えないところで毎ターン効く）、案②コピペ（二重管理）、案④マーカー付き挿入ボタン（プロンプト欄が肥大）は劣後。新規は OFF、ON の topic だけを stable 直後の専用キャッシュ付きブロックとして注入し、前置きは `buildReferencePreamble` 系に揃える。タスク3の「専用キャッシュ付きブロック」の仕組みをそのまま流用する（`pinned` の隣に `memory`）。役割分担の考え方は、`overview`／`principles` は常時効かせたいのでトグルで注入、`current-work`／`references` は量が増えやすいので当面は昇格 Lore 経由の RAG に任せる（必要なら ON も可）。実装は v204（`include_in_chat`）。出典: Pinnedキャッシュ化 v1 §7-1。【資料】【コード】（`lib/project-memory/chat-injection.ts`）
18. **設定ドロワーは案A「指示／参照／Memory の3タブ化」**を推奨。Memory タブに状態サマリ（例:「標準4topic中2件作成済み・未昇格2件（チャットには未反映）」）を置き、ボタンは状況に応じて主ボタンを1つに絞る。実装は `f40de34`／`cbb928f`（v10 §0）。当時の課題: textarea が `minHeight: calc(100vh - 320px)` で Pinned 以降が埋もれる、保存の仕組みが3種類（名前＝即時、プロンプト系＝保存ボタン、Memory系＝モーダル即時）、「未昇格＝チャット未反映」がUIで伝わらない、「スレッド個別が優先」の注記が2か所で重複。出典: Pinnedキャッシュ化 v1 §7-2。【資料】【コード】（`components/ProjectSettingsTabs.tsx`・`ProjectMemoryTab.tsx` の存在を確認）

## 地雷（CLAUDE.mdに載っていないもの）

1. **`route.ts` は CRLF 主体の混在。行末を変換しない**。Codex には `-Encoding UTF8` と行末保持を指示する。`ChatInputCentered.tsx` も CRLF/LF 混在。`git add` 時の「LF will be replaced by CRLF」警告は無害。出典: v10 §7。CC に「CRLF」の記述なし。【資料】【未確認】（現行の行末は未確認）
2. **`getRetainedQueryText` の `useCallback(..., [])` は deps に `retention` を含めない**。ストアは安定しているので問題なし。ESLint の `exhaustive-deps` を有効にしたときだけ警告が出る。出典: v10 §7。【資料】
3. **light の編集対象のずれ（既知の制限）**: light の編集対象は `orderedMessages`、`handleRegenerate` は `messages` を遡って user を探す。順序が食い違うとモーダルの手入力と適用先がずれうる。検証失敗時は toast で中断（既存の `prevUserContent` と同じ前提）。出典: v10 §7。【資料】
4. **`verify-project-memory-chat-inclusion.mjs` のカタログチェックのスキップは環境変数の問題**。`SUPABASE_ACCESS_TOKEN` を設定すれば実行できる。CC に記載なし。出典: v10 §7。【資料】
5. **`git diff` 依存のテストは常設しない**。「変更禁止パスに差分がない」確認は Codex の完了報告（`git diff --name-only`）で行う。作業ツリー依存で将来赤くなるため、`query-text-regeneration.test.cjs` から削除済み。出典: v10 §3・§7。【資料】
6. **ステージコピーは古いことがある**。Claude のレビューは、Codex 完了後に対象ファイルを再 stage してから読む。ChatGPT は GitHub の remote を見るため未 push の変更とは照合できない（レビュー依頼前に push 済みか明記）。出典: v10 §7。【資料】
7. **Codex の `helper_unknown_error: apply deny-read ACLs` は無害**（再実行で通る）。完了時に一時ファイル（`*.py`/`*.cjs`/`*.ps1`、`*-tests.txt`）が残っていないか確認。型チェックは `npx tsc --noEmit --incremental false`。`tsconfig.tsbuildinfo` は `git add` に入れない。出典: v10 §7。【資料】
8. **「未注入」の実機再現手順**: 2つ以上の topic を上限内で ON にしたあと、AI 編集か UL で本文を増やして合計8,000字超にする。確認用本文は自然な文章にする（ランダム文字列は Claude が `stop_reason: "refusal"` を返しうる）。CC の refusal 節は原因を述べるが、この再現手順は無い。出典: v10 §7。【資料】
9. **§6-1 の実機確認には「目印の記憶」を使う**: `/memory` で用意したテスト用の事実を1件追加し、トリガー語の有無で回答に出るかを見る。19語に「好物」は含まれず「好み」は含まれる（コードで19語を確認）。出典: v10 §5・§7。【資料】【コード】（`lib/lore/chat-search-plan.ts`）
10. **Claude のアドバイザーツールを入れる場合の制約**: beta ヘッダーに `advisor-tool-2026-03-01` を追加（`prompt-caching-2024-07-31,advisor-tool-2026-03-01`）。BYOK のためアドバイザー（Opus）のトークンはユーザー課金になる。設定で ON/OFF と明示が必要。マルチターンの `advisor_tool_result` 保持は、DB がプレーンテキスト保存のため初回は割り切る。出典: APIメモその1 §1。【資料】
11. **Files API は ZDR 対象外**。`file_id` 管理が BYOK では新たな手間になる。出典: APIメモその1 §2。【資料】

12. **スレッド個別の system があると Project 設定の `system_prompt` は合成されず丸ごと置き換わる**（`if (!resolvedSystemPrompt)`）。両方を使うつもりの運用では Project 側が効かない。CC に該当記述なし。出典: Pinnedキャッシュ化 v1 §1。【資料】【コード】（`app/api/chat/route.ts:896-897` を確認）
13. **Claude のキャッシュは先頭からの完全一致（prefix 一致）**。毎ターン変わるもの（検索結果など）を最後のブレークポイントの後ろに置くことで先頭側を壊さない設計。キャッシュ書き込みは通常入力より割高（5分TTL、倍率は着手時に最新料金で確認）で、会話間隔が5分を超えるたびに Pinned（日本語6万字級）の再書き込みが発生しうる。取得失敗で一部ファイルが欠けた場合もブロックの文字列が変わるため1回ミスになる。最小キャッシュトークン数（モデルごと）を下回る小さな Pinned は `cache_control` を付けても効かない（害はない）。出典: Pinnedキャッシュ化 v1 §2・§6。【資料】【未確認】（料金の倍率は資料内で「一般知識」と明記）
14. **`trimContextToWindow` は 80,000 トークン・直近6ターンをアンカー**として扱う（当時の記述。現行値は未確認）。出典: Pinnedキャッシュ化 v1 §1。【資料】【未確認】
15. **設定ドロワーの「Caching 有効」バッジは、小説モードでシステムプロンプトが5,000字以上のときに表示**（`Sidebar.tsx`）。キャッシュ最小トークン数との厳密な対応は未確認で、目安にすぎない。出典: Pinnedキャッシュ化 v1 §2。【資料】【コード】（`components/Sidebar.tsx:1670` に `>= 5000`）
16. **OpenAI／Gemini の自動 prefix キャッシュは、stable を先頭に置いてあるため余地が残るだけ**で、コードでは明示制御していない（資料内で「未確認の一般知識」と明記）。出典: Pinnedキャッシュ化 v1 §2。【資料】【未確認】
17. **`manualThinkingEnabled` のときは GitHub Tool Loop は走らない**。Tool Loop は system を別途 Claude に送るためキャッシュの恩恵がない（当時の記述。現行は `combinedSystemAtCurrentPosition(baseStableSystemPrompt)` を渡す）。出典: Pinnedキャッシュ化 v1 §6。【資料】【コード】（`route.ts:1496`）

CLAUDE.mdに既出: 11項目（queryText 契約・19語トリガー・検索ポリシー値・system ブロック順とキャッシュマーカー最大4・preamble の個数・参照封筒のコード用無害化・refusal 時の誘導文・メモ保存の早期 return・`summarizeChatInclusion` の正本・保持の信頼条件と light／branch の分離・テスト件数の数え方）。

## 未実装・宿題

1. Lore Book の検索対象に添付が入らない場合がある（仕様）。再開条件は上記判断9。【資料】
2. queryText 保持の DB 保存化（任意・低）。再読み込み後の再生成で記憶の誤発火が目立つとき。`PATCH /api/messages/[id]` と light 再生成の `content` 更新での古い値の掃除、「保存しない」契約の改訂が前提。保持の信頼条件が崩れる。出典: v10 §6-B2。【資料】
3. 非 Claude プロバイダーの refusal 相当（OpenAI の content_filter、Gemini の SAFETY 等）。実際に困ったとき。出典: v10 §6-B3。【資料】【コード】（CC にも「未対応」と記載）
4. topics GET の統合（v6 §6-3）。topics 周りを次に触るとき。出典: v10 §6-B4。【資料】（v6 は旧版でC。内容は読んでいない）
5. 未保存インジケータ。UI 改善ロードマップに合流。出典: v10 §6-B5。【資料】
6. Capacitor 移行時にまとめて確認: Novel Check mobile の `isMemo:true`、モバイル版の設定ドロワーのタブ化、モバイル版の queryText 保持（未対応）。出典: v10 §6-C。【資料】
7. Project Memory Manager バックログ（v7）の更新（v8）が任意タスクとして残っている。出典: v10 §6-D。【未確認】（旧フォルダの PMM バックログ系列の最新は v7）
8. 「Opus 4.8 では `effort` パラメータ＋適応的思考に切り替えるべき」。`isDeepThinking` は全モデル共通で旧来の `thinking` パラメータ方式。出典: APIメモその1 §4。【資料】【コード】（`lib/modelRegistry.ts` に `effort` の出現なし。ただし CC は `resolveClaudeRequestOverrides` でモデル別の上書きを管理するとあり、現行の扱いは未確認）
9. Claude API 機能の導入優先度（提案段階・未決定）: ①検索結果（Search Results）②構造化出力（`extract-settings` の JSON 抽出をスキーマ強制へ）③アドバイザーツール（本命は `lib/github-tool-loop.ts`。現状の精度の「外し具合」を測ってから）④テキストエディタツール ⑤Web 検索／フェッチ ⑥バッチ処理（Dreaming の裏処理向き）⑦Citations（RAG 引用が独自実装か API 機能かは要確認）。出典: APIメモその1 §5。【資料】【未確認】（その後 Lv1 で Web 検索が実装済みで、本項は一部陳腐化）
10. 当時の未決事項（Pinnedキャッシュ化 v1 §7-3）: topic トグルを出す範囲（`overview`／`principles` のみか、`current-work` も含めるか）、UI 方向性、「未昇格＝チャット未反映」の明示、小説モード固有項目（テンプレ挿入・Caching 表示）を「指示」タブに残すか、メモリ検索の二重経路・Pinned／探索の無害化。いずれも v10 時点で解消済み（全 topic 対象のトグル、B1・B2 完了）。【資料】【コード】（`include_in_chat` は topic_key を問わない）

## 矛盾・要照合

1. **inventory.md の分類（解消）**: `画像入力対応メモ.md` は image-generation・B に変更済み（Rui 承認）。以下は変更前の指摘: 内容は画像生成の img2img（参照画像＋プロンプトで派生画像）で chat-core ではない。image-generation の資料。さらにコードには `imageRefId` ほか実装が入っており（`app/api/image-gen/route.ts:332-361`、OpenAI／Ideogram remix の分岐）、メモの「未実装」は陳腐化している。【コード】
2. **inventory.md の分類（解消）**: `Pinnedキャッシュ化_引き継ぎ資料_v1.md` を C→B に変更済み（Rui 承認）。上記の判断・地雷に反映した。【資料】
3. **v111 Fix 5 と実装の差**: 資料は 200,000 **バイト**の名称 `MAX_ACCUMULATED_BYTES`・「超過時点までを保存」とするが、実装は `MAX_ACCUMULATED_CHARS = 200_000`（UTF-16文字数、コメントは日本語で約600KB相当）で、超過時に `TRUNCATION_NOTICE`（「[…以降は長さ上限により省略されました]」）を本文末尾に付加して切り詰める。CC に記載なし。【コード】
4. **v111 Fix 3 のコード例と現行**: 例は `lib/lore.ts` の `searchLore`（`match_lore_embeddings`、`folderName` 基準）だが、現行は `lib/lore/search.ts` と `project_id` 基準（v186・v187 で移行済み）。`lib/lore.ts` は存在しない。資料のコード例は参照してはならない。【コード】
5. **v111 Fix 2 の `streamClaude` シグネチャ**: 資料は第9引数 `cacheAnchorIndex` だが、現行の system ブロック化（stable→memory→pinned→dynamic）と「cache_control は message anchor を含め最大4」の制約が後から入った。現行の引数・anchor 計算は `lib/context-window.ts` と `lib/chat-system-blocks.ts` を要確認。【未確認】
6. **v10 §7 の「ClaudeはPC 20260328 フォルダで git を実行しない」**: 現行 CC は `C:\Users\Admin\Desktop\20260328`（デスクトップ）とノートPC `C:\Users\ruima\kabehub-prototype` を併記しており、v10 の「ノートPCは `C:\Users\ruima`」は旧パス。運用ルールそのものは今回のセッション（Claude Code がリポジトリで直接作業）と整合しない可能性。【資料】【未確認】
7. **APIメモその1 の「CLAUDE.mdの『Opus 4.8のExtended Thinking対応（将来対応）』という既知課題」**: 現行 CC にこの文言は無い（grep で0件）。モデル台帳 `lib/modelRegistry.ts` に `canToggleDeepThinking`／`resolveClaudeRequestOverrides` があり、この課題は別形で解消済みの可能性。【コード】【未確認】
8. **`APIメモ概要.txt`**: Claude API 公式ドキュメント「機能の概要」の貼り付け（外部資料、見出しのみ確認）。KabeHub の判断は含まない。②では出典にしない。【資料】
9. **Pinnedキャッシュ化 v1 §1 の参照元表と現行の差**: 当時は記憶検索に `MEMORY_TRIGGER_PATTERN`（10語程度）と `RAG_TRIGGER_KEYWORDS`（別表、topK 4）の二重経路があり、`memory`／`rag_memory` の2ブロックが出うる状態だった。現行は19語・単一経路・`rag_memory` 廃止（B2-1、`d0a73b5`）。Lore Book の条件も「`folder_type = "novel"` かつ OpenAI キー」から `loreEnabled && hasOpenaiKey && loreTargetProjectId` に変わった。v1 の表は参照しないこと。【資料】【コード】
10. **§7-1 のトグル対象**: v1 は `overview`／`principles` に絞るのが安全という見立てだが、実装は topic_key を問わず全 topic でトグル可能（上限は本文合計8,000字）。【資料】【コード】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_チャット参照元整理_課題B完了_引き継ぎ資料_v10.md | A | §0〜§7（§8以降は未読） |
| 画像入力対応メモ.md | A | 全文（3KB）。ただし内容は image-generation |
| KabeHub_v111_修正メモ.md | B | 全文 |
| APIメモその1.txt | B | 全文 |
| APIメモ概要.txt | B | 見出しのみ（外部資料の貼り付け） |
| CLAUDE.md | — | 既出判定のための grep のみ |
| KabeHub_チャット参照元整理_Pinnedキャッシュ化_引き継ぎ資料_v1.md | B（C→B、Rui承認） | §0〜§7（§8以降は未読）。§3-B の課題・§7-3 の未決事項は、後の完了（v10）と照合 |
