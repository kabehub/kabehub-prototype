# 抽出メモ: rich-conversation（①-2）

作成: 2026-11-25／対象: Lv1（Claude・OpenAI の Web 検索、出典チップ）と Lv2（カード記法 `kabe-card`、リッチ表示モード＝Phase 3b、箇条書き、カード本文の改行、下流対応 B1／B2）。
タグ: 【資料】／【コード】（実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。D番号は資料のまま維持（【確定】＝Rui 確定、【推奨】＝Claude の提案に Rui が異議なし）。
略称: v12＝リッチ会話UI Lv1Lv2 統合 引き継ぎ資料 v12（2026-11-01。v1〜v11 は C で、v12 が v5〜v11 を統合した正本）、3b方針＝Lv2_Phase3b_方針ドラフト v3、3b調査＝Phase3b_Codex読み取り調査指示書 v1、3b指示＝Phase3b_Codex実装指示書 v1、B2方針＝Lv2_B2_方針ドラフト v2、B2指示＝Lv2_B2_Codex実装指示書 v1、リスト指示＝Lv2_カード本文リスト対応_Codex実装指示書 v1。
**注**: v12 の根拠区分（【実測】【コード】【推奨】【記録】）のうち、v12 自身が「再検証していない【記録】」とした部分は【資料】、v12 が 2026-11-01 に実ファイルと突き合わせたと書く部分は、今回あらためて grep できたものだけ【コード】とした。

## 確定した判断

1. **実装順は Lv2 先行→Phase 1（Web 検索）**【確定 D1】。Lv2 記法は「コードフェンス＋行ベース `key: value`」【確定 D10／D19】。出典: v12 §5。【資料】
2. **Phase 一覧（コミット）**: 1a Claude 検索サーバー `04cc9ab`／1b クライアント `0ff9770`／2a OpenAI 検索サーバー `eea4db6`／2b クライアント `d6ddd6a`／3a カード描画 `a1cbf14`／D37 `fb4d5c6`／3b リッチ表示モード `a9d7044`（docs `a08fb38`）／3b+ 箇条書き `78c0d78`／B1 `0eefd33`／B2 `5da5ee2`／docs `0595cce`／A（改行）`709e7ee`（docs `157ea34`）。Phase 4（モバイル展開）は未着手。出典: v12 §1。【資料】
3. **Web 検索の共通仕様**: トグル `components/WebSearchToggle.tsx`（`provider` 必須、Claude・OpenAI で表示、Gemini は非対応＝**D9**：ToS・UTF-8 バイトオフセット・リダイレクト URI・`searchEntryPoint` の CSP 衝突）。設定は LocalStorage `kabehub_web_search`（`"1"` のみ ON、既定 OFF）で**全 provider 共有の1設定**【推奨 D44】、端末ごと・既定 OFF【確定 D3】。送信直前は必ず `resolveWebSearch({preference, provider, modelId, roleplay})` を通す。トグル位置は「深く考える」の隣（D21）、再生成時の検索はその時点のトグル値（D23）。対象モデルは台帳の `features:{webSearch:true}`＝Claude 全13モデル＋OpenAI 10モデル（gpt-5.4-mini／5.4／5.5／5.6-sol／terra／luna／gpt-6-astra／6-luna／6-sol／6.1-sol）。**対象外は gpt-4o（D15：`citeturn…` マーカー混入・オフセット不一致）と gpt-5.5-pro**。出典: v12 §2-1・§5。【資料】【コード】（`lib/webSearchPreference.ts`・`components/WebSearchToggle.tsx` 存在、台帳に `webSearch: true` が23件）
4. **サーバー側の有効条件と OFF の不変**: `webSearch===true`（厳密）かつメモでないかつ provider 別の対応モデル。OFF のときの request body は従来とバイト一致（golden で回帰確認：Claude は `a1cbf14`、OpenAI は 96ケースを `scripts/fixtures/openai-chat-off-bodies.json`＝`0ff9770` の capture、クライアント5経路を `eea4db6` baseline）。`export const maxDuration = 300`（Hobby＋Fluid Compute で既定・最大とも300秒。検索込みの応答は最長でも約32秒）【確定 D24】。出典: v12 §2-1。【資料】【コード】（`app/api/chat/route.ts:50`）
5. **NDJSON 契約**: `meta` が最初、`searching` と `chunk` は発生順、`citations` は本文後・`done` 前に高々1回、`done` が最後。中断・失敗した light 再生成では `citations` なし。旧クライアント・モバイルは未知 type を無視する。「検索中…」は固定文言のみでクエリは出さない【確定 D16】。Claude は制御トークン `\u0000kabe-ctl:<uuid>:searching\u0000` を本文ストリームに流し `outputStream.transform` が `{"type":"searching"}` に変換（本文に混入しない）。OpenAI は検索イベントの最初の1つで1回だけ。**クライアントは NDJSON の `done` でなく HTTP ストリーム終了（`reader.read()` の `done===true`）で完了する**（サーバーは DB 保存を await した後に `controller.close()`）。出典: v12 §2-1。【資料】【未確認】（`kabe-ctl`・NDJSON は CC に無く、実装箇所は今回 grep していない）
6. **出典データ**: `messages.metadata.sources = {v:1, provider, items:[{url,title,domain}]}`。`packages/shared/src/webSearch.ts` の `normalizeSources`（http／https のみ・資格情報除去・URL 長2,048・`utm_source=openai` 除去【推奨 D17】・重複除去・最大20件・title 120コードポイント）と `withSources`（他の metadata キーを保って `sources` だけ差し替え）。出典は本文で引用されたものだけ保存・検索クエリは保存しない【推奨 D5】、粒度はメッセージ単位【推奨 D2】、`citedText` 非保存【確定 D25】。出典: v12 §2-1・§5。【資料】【コード】（`packages/shared/src/webSearch.ts` 存在）
7. **保存と復元**: `lib/chat-assistant-persistence.ts` の `resolveAssistantPersistence` が通常保存と REST フォールバックで共用。light 再生成の失敗・中断は snapshot（content／provider／model_id／tokens／metadata）へ復元、成功は `sources` を置換（新 usage が null なら明示的に null を書く）。`shouldEmitCitations` が中断・失敗 light 時の `citations` を抑止。一時モードは出典を保存しない。light 再生成の完走・失敗は messages GET（`no-store`）で対象1件を取り直して反映（DB が正）。GET 失敗・対象 ID なしは旧状態を保持して toast。出典: v12 §2-1。【資料】【コード】（`lib/chat-assistant-persistence.ts` 存在）
8. **出典チップ**: `components/SourceChips.tsx`＋`lib/sourceChips.ts`。表示ドメインは metadata の `domain` を信用せず検証済み URL の `hostname`（`www.` 除去）から導出。チップは導出ドメインごとに1個・最大4個、「+N」＝チップから直接開けない URL 数。ファビコンなし（ドメイン頭文字の丸）【推奨 D7】。出典: v12 §2-1・§5。【資料】【コード】（両ファイル存在）
9. **一時モードの再生成を入口でガード**（「一時モードでは再生成できません」）。再生成 body に `isTemporary` が付かず通常スレッドとして保存されうる既存不具合の封じ込め。出典: v12 §2-1。【資料】【未確認】
10. **Claude の検索**: `tools:[{type:"web_search_20250305", name:"web_search", max_uses:3}]`（`WEB_SEARCH_MAX_USES_CLAUDE=3`【確定 D18】）。`text_delta` を受信順に連結し、検索ブロックを挟んで**その前に text があった場合だけ**後続の最初の text の前に `\n\n` を1回入れる（実測6回では発動せず、保険）。出典は `citations_delta` の `web_search_result_location` から集めて URL で重複除去。Deep Thinking と併用可【確定 D26】。SSE `error`（検索 ON 時のみ）は `ReportedProviderError` で既存の失敗経路に合流（固定コード `UPSTREAM_STREAM_ERROR`、生のエラー本文は出さない）。HTTP 400 でボディが `/web[_ ]?search|tool/i` に一致したら日本語の案内（自動再送なし＝**D4**）、`web_search_tool_result_error` は非致命【確定 D27】。対象モデルは検証後に全13【確定 D22】。出典: v12 §2-2・§5。【資料】
11. **OpenAI の検索**: 検索 ON のときだけ `lib/openai-web-search.ts` の `streamOpenAIWebSearch`（Responses API・ストリーミング）、それ以外は従来の `streamOpenAI`（台帳の `api` は変えない＝Arena への波及を避ける）。リクエスト `POST /v1/responses`、`{model, input, tools:[{type:"web_search"}], max_tool_calls:3, max_output_tokens:8192, stream:true, store:false, reasoning?}`。`tool_choice` は指定しない【D28】、`max_tool_calls=3`【確定 D18】、`max_output_tokens` は 8192 流用【D35】、`search_context_size` 既定・`user_location` なし【D36・D39】、画像は `input_image`【D30】、`input` 先頭の system【D38】。専用 SSE パーサー（`pumpSSE` は変更しない＝**D41**）。**終端イベント欠落（EOF）・不正 JSON は失敗扱い**【D40】、`response.incomplete` は部分本文＋出典を保存してエラー表示【D33】（固定日本語メッセージ：上限到達／コンテンツフィルター／その他）。OpenAI の 400 を検索権限エラーと断定しない。本文のインラインリンク `([domain](url?utm_source=openai))` は無改変で残し【確定 D14／D42】、チップは追加表示。gpt-5.4 は質問によって annotations が出ないが検索対象のまま【確定 D43】（困ったら台帳の `features:{webSearch:true}` を lib／shared の両方から消せば対象外にできる）。ログに検索クエリ・URL・title・上流エラー本文を出さない。出典: v12 §2-3・§5。【資料】【コード】（`lib/openai-web-search.ts` に `store: false`、`lib/openai-responses-input.ts` は CC に既出）
12. **D37（gpt-5.5-pro の画像入力）**【確定】: Pro 分岐が Chat Completions 形式の画像を Responses API へ送り HTTP 400 になっていた不具合を `buildResponsesInput` で Responses 形式に変換して修正（`fb4d5c6`）。D45＝共通 helper を Web 検索側にも適用、D46＝実装前に probe（旧形式 HTTP 400／新形式 200 を実測）。出典: v12 §1・§5・§6。【資料】【コード】（CC に既出）
13. **Lv2 カード記法の確定仕様**（`packages/shared/src/kabeCard.ts`）: 許可キーは `title`（必須）／`badge`／`tone`（positive｜neutral｜warning｜negative）／`meta`、`quote` は v1 では外した（確定、後から足せる）。ヘッダーは内側の先頭行から `^(title|badge|tone|meta):` が続く間（キーは小文字のみ、値は**最初のコロンだけ**で分割、重複キーは最初の行を採用、空値の任意キーは未指定）。**空行は不要**【確定 D19】。本文はヘッダーの次の行から（先頭・末尾の空行は除き内部の空行は維持）。上限（コードポイント）: title 60、badge 30、meta 100、本文600 で超過は `null`（フォールバックしてコードブロックに戻る）。1メッセージあたり描画20枚（`KABE_CARD_MAX_PER_MESSAGE`）、21枚目以降は通常のコードブロック。`tone` 未指定・空・許可外は `undefined`（neutral 配色）。出典: v12 §3-1。【資料】【コード】（`packages/shared/src/kabeCard.ts` 存在）
14. **閉じフェンス判定と枚数制限**: `isKabeCardFenceClosed` は CommonMark 準拠（開始と同じ文字・開始以上の長さ・閉じ行に余計な文字なし）で、入力は `content.slice(node.position.start.offset, node.position.end.offset)`、先頭空白は3個以下。`createKabeCardLimiter` は開始オフセットをキーにした Map で何枚目かを割り当て、同じオフセットを何度呼んでも同じ結果（React 開発モードの二重呼び出しで枠を消費しない）、パース失敗でコードブロックになったものは枠を消費しない、`MarkdownRenderer` の呼び出しごとに独立。出典: v12 §3-1。【資料】
15. **描画**: `components/MarkdownRenderer.tsx` の `pre` 上書きが、言語 `kabe-card` かつ閉じたフェンスだけを `parseKabeCard`→`KabeCardView` へ。`content` は前処理せずそのまま `ReactMarkdown` に渡す（オフセットがずれるため）。`CodeBlock` の言語判定は `/language-([\w-]+)/`。`components/KabeCardView.tsx`（B案＝ヘッダー帯、外枠 `1px solid var(--border)`・角丸12px・背景 #fff）。描画は `MarkdownRenderer` 経由の全箇所（`MessageBubble`・`RoleplayBubble`・`ArenaTimeline`・`ProjectMemoryTopicList`・`novel-check`・`share/[token]`）に効く。通じない経路は、ユーザー発言・不採用分岐 `BranchBubble`・分岐ツリー・検索結果サイドバー・`ProjectMemoryDiffView`。履歴中のカードはリッチ表示モードが OFF でも描画する。出典: v12 §3-2。【資料】【コード】（`components/KabeCardView.tsx` 存在）
16. **D12／D11**: モバイルは別フェーズで、カードが生コードブロックに見えるのは許容【確定 D12】。アリーナは検索対象外、カード描画は `MarkdownRenderer` 経由で自動で効く【推奨 D11】。出典: v12 §5・§8。【資料】
17. **カード本文の Markdown（3b+ とチケット A）**: 許可要素は `p／strong／em／del／a／code／br／ul／ol／li`（`allowedElements`＋`unwrapDisallowed`。見出し・画像・コードブロック・表・raw HTML は外れて中のテキストだけが残る）。箇条書きはコンパクトなスタイル、タスクリストの `<input` は出さない。**改行（D77〜D79）**: `remarkPlugins={[remarkGfm, remarkBreaks]}`（この順、`remark-breaks@^4.0.0`）、適用はカード本文だけ【D78】、単純な改行は `<br>`（空行・行末スペース2つは不変）、規則文面の13行目を差し替え【確定 D77〜D80】。出典: v12 §3-3・§5。【資料】【コード】（`package.json` に `remark-breaks ^4.0.0`）
18. **リッチ表示モード（Phase 3b）**: 設定 `lib/richDisplayPreference.ts`（LocalStorage `kabehub_rich_display`、**既定 ON**、OFF は `"0"` を保存・ON はキー削除、`useSyncExternalStore`、`resolveRichDisplay({preference, roleplay}) = preference===true && !roleplay`、UI 文言「AIのカード表示」）。粒度＝ユーザー単位・注入場所＝stable 末尾・適用除外＝roleplay・小説 Project・メモ【確定 D47〜D50・D53】。サーバーも roleplay を除外（スレッドの `roleplay_mode` を読んで判定【D51】）、注入可否は純関数 `shouldInjectKabeCardRules`【D52】、保存失敗は握りつぶして既定 ON で継続【D54】、GitHub Tool Loop には注入しない【D55】、一時モードは常に OFF【D56】、VM テストの `pageCallback` ガードは3関数に限定【D57】。サーバーは `richDisplay===true` のときだけ注入（サーバー既定 OFF。旧クライアント・モバイル・メモ・novel-check は何も送らないので OFF）。出典: v12 §3-4・§5、3b方針 §2・§5。【資料】【コード】（CC に既出）
19. **規則文面は stable 末尾（`labelNote` の後）に `stable + "\n\n" + 規則` で足し、独立した system／cached ブロックは増やさない**（cache marker 数・ブロック順は不変、`lib/chat-system-blocks.ts` は無変更）。「最大5枚」（規則）と描画上限20枚は意図的な差。規則の文面は `lib/kabe-card-system-prompt.ts`（`scripts/kabe-card-system-prompt.test.cjs` でバイト固定・LF・末尾改行なし）。手貼りテスト（3社×7本・41枚）は、使うべき場面9/9で使用、使わない場面9/9で不使用、フェンス言語名・閉鎖・`tone` 許可値は41/41、未知キー・ネスト・見出し・表の混入0件、空行でヘッダーと本文を区切ったのは7/41（→D19で空行不要に改訂）。Project の system 指示に手貼りしていたカード規則は削除済み（二重指示の解消）。出典: v12 §3-4・§6。【資料】【コード】（CC に既出）
20. **下流対応 B1（`0eefd33`）**: md2 export は先頭行が0〜3スペースの開始フェンスの AI メッセージで、見出しを `# {絵文字} {プロバイダー名}` にして本文は全行出力（開始フェンス消失→後続メッセージがコードブロックに巻き込まれる不具合の修正）。履歴要約（分岐ツリー・`OutlinePane`・`ChatPanel` の履歴ラベル・`lib/branching.ts` の分岐ラベル）は `generateMessageSummary` が従来の要約が**空のときだけ**先頭の有効カードの title にフォールバック。B1 の範囲は md2 のフェンス破損と要約の空表示の2点だけで、md／txt／CSV／JSON・検索・コピー・MCP は変更しない【D58〜D65】。要約フォールバック方式・チルダフェンス等はフォールバックしない（既知の制限）・`lib/stringUtils.ts` は薄い re-export・`replaceKabeCards` の契約・ヘルパーと AST レンダラーの認識範囲の差は仕様上の制限【D66〜D71】。出典: v12 §4・§5。【資料】【コード】（CC に既出）
21. **下流対応 B2（`5da5ee2`）**: Lore「いいね」は有効なカードを `title（badge／meta）`＋本文に平文化して保存（括弧は存在する値のみ、`tone` は捨てる、本文の Markdown は保持）、**原文は Lore に保存しない**（`metadata` は `{ai_proposed_kind}` のまま）。カード間の区切りは原文どおり、CRLF 混在は許容。対象は「いいね」のみで Dreaming・batch-train・自動要約・Lore 画面・モバイル・既存 Lore は対象外【D72〜D76】。md／txt／CSV／JSON バックアップ・検索・コピー・MCP・Memory 画面・自動要約・batch-train は変更なし【D59〜D62】。既存 Lore のカード入りは0件（`select count(*) … like '%kabe-card%'`、再処理不要）。出典: v12 §4・§5。【資料】【コード】（CC に既出。ただし「いいね」の入口は Phase 0 で撤去済みで、B2 の対象は現在は到達しない）
22. **Hobby プランは非商用向けという事実だけ残し、Pro 移行は何もしない**【確定 D20】。Lv3（外部画像付きカード）は対象外（3社 API に画像検索がなく、第三者画像のホットリンクは著作権・CSP の問題）。出典: v12 §5・§8。【資料】

## 地雷（CLAUDE.mdに載っていないもの）

1. **カード記法の仕様（キー・上限・枚数・閉じ判定・ヘッダー規則）は CC に載っていない**（CC は `replaceKabeCards` 等の lib 行と下流対応の記述のみ）。仕様を変えるときは `packages/shared/src/kabeCard.ts`（Web・shared の正本）と、`apps/mobile/components/MarkdownRenderer.tsx`（Web とは別実装でカード描画を持たず、言語判定は `\w+` のまま）の差に注意。出典: v12 §3-1・§8。【資料】【未確認】
2. **`MarkdownRenderer` は `content` を前処理しない**。前処理するとフェンスのオフセットがずれて閉じ判定・枚数制限が壊れる。出典: v12 §3-2。【資料】
3. **共有ページのマスク置換とカードの相互作用**: 置換先は `[redacted]`。`title: [[秘密]]` は通常の値として扱われ、未閉鎖の `[[` 以降はすべて削られるため閉じフェンスも消えてコードブロックにフォールバックする。出典: v12 §3-2。【資料】
4. **見出し・表・コードブロックがカード本文に入ると中身が平文で崩れる**（規則文面で抑止しているだけでバリデーションではない。頻度は未測定）。カード外の通常本文の単純な改行は従来どおり1段落（D78 で意図的に対象外）。出典: v12 §3-3・§8。【資料】
5. **リッチ表示 OFF でも過去のカード描画は残る。OFF でカード記法を学習したモデルが模倣するかは未測定**（D61）。ON にするとキャッシュ prefix が別になり、切替時とキャッシュ期限切れ時に cache creation が発生しうる。規則の分だけ履歴の trim 予算が減る。手貼りルールが残る Project では規則が二重になる（反映後に Rui が手貼り分を消す）。出典: 3b方針 §5、v12 §3-4。【資料】
6. **一時モード＋roleplay の除外はクライアント側の `activeThread?.roleplay_mode` のみ**で、`threads` に行がない・保存前のローカルなりきり設定では判定漏れが起こりうる（通常送信はサーバーが DB で補う）。通常送信の初回メッセージで DB にないスレッドは `roleplay_mode` が false になる（従来から同じ）。出典: 3b方針 §5。【資料】
7. **`pageCallback`／`fileCallback` の VM テストは `app/page.tsx` のコールバックを AST で抜き出して実行する**ため、新しい名前（フック値・helper）を使うと各テストの context に足す必要がある（D57）。出典: v12 §9。CC の `thread-trash-ui-test-helpers.cjs` 行と近いが、足す手順の記述はない。【資料】【コード】
8. **Codex は Project のドキュメントを見られない**。実装指示書には規則文面・変更内容・Acceptance を本文に直接書く。出典: 3b方針 §8。【資料】
9. **ブラウザコンソールから `/api/chat` を直接叩く本番確認**: DevTools の Network で「Copy as fetch」→ body と `credentials:"include"` だけ書き換える。headers に API キーが入るのでチャットに貼らない。出典: v12 §9。【資料】
10. **Gemini の検索を入れる場合の論点**（非対応の根拠）: ToS 原文（Grounding with Google Search）が宿題、UTF-8 バイトオフセットの扱い、リダイレクト URI、`searchEntryPoint` の CSP 衝突。出典: v12 §5 D9・§10。【資料】

CLAUDE.mdに既出: 9項目（リッチ表示の既定 ON・サーバーは `richDisplay===true` のみ・stable 末尾・OFF の不変・除外条件・GitHub 探索非注入・md2 のフェンス・履歴要約の title フォールバック・「いいね」のカード平文化・D37 の Responses 変換・OpenAI 検索の Responses 構成）。

## 未実装・宿題

1. **モバイル展開（Phase 4）**: モバイルはカード描画を持たず、`apps/mobile/package.json` に `react-markdown`・`remark-gfm` はあるが `remark-breaks` は未追加。`@kabehub/shared` の `parseKabeCard` 等を使う前提で方針ドラフトから始める。出典チップ・検索トグルもモバイルは未対応。出典: v12 §10-2。【資料】【コード】
2. **別 ticket 候補**: AI がカード本文に見出し・表・コードブロックを出す頻度の実測（頻繁なら規則文面の強化か描画対応）／要約の切り詰めをコードポイント単位にする（孤立サロゲート）／CSV export の整形／OFF 時のカード模倣の実測／B2 後の記憶検索精度の実測／一時モードの部分本文の扱い。出典: v12 §10-3。【資料】【未確認】
3. **共有ページ（`/share/[token]`）でのカード実表示の確認**（Rui の宿題、v5 から継続。チケット A の確認項目⑥に含めたが個別結果は未受領）、Gemini ToS 原文の確認。出典: v12 §10-5。【資料】【未確認】
4. **未測定**: AI がカード本文に見出し・表・コードブロックを出す頻度、OFF 後に履歴のカードを見たモデルが模倣する頻度、B2 後の記憶検索精度、REST fallback 競合の発生頻度、組織設定で検索無効のときの実機 400、モバイルでの未知 type 無視の実機確認。出典: v12 §6。【資料】
5. **本番確認は「Rui 報告 OK」のみで個別結果が未記録の項目が多い**（v12 §6）。【資料】
6. **検索まわりの制約**: 一時モードはストリーム例外時に本文を `（エラー: …）` で置換し出典も捨てる（全 provider 共通の既存挙動）。共有ページ・copy・branch-to・フォーク・MD／CSV export・クリップボードには出典を載せない（JSON export は含まれる）。本文のインラインリンクと出典チップは二重表示。無視されたコールの課金・検索課金の細部は未確認。検索課金・回数の表示は後続【推奨 D6】。出典: v12 §2-3・§8。【資料】【未確認】
7. **CLAUDE.md の追加棚卸し**（v12 §7「まだ載っていないもの」）: `lib/aiUsage.ts`・`lib/usageStats.ts`・`lib/api-client.ts`・`lib/apiKeyStore.ts`・`lib/extractSettingsResponse.ts`・`lib/github-oauth*.ts` の Lib 表の行、`docs/thread-trash-phase3*-report.md` 等の docs 表の行。出典: v12 §7・§10-4。【資料】【コード】（CC に `aiUsage`・`api-client`・`apiKeyStore`・`extractSettingsResponse` は0件）

## 矛盾・要照合

1. **v12 §7「CLAUDE.md を更新した」と現行 CLAUDE.md の食い違い（重要）**: v12 は 2026-11-01 に、`SourceChips`／`WebSearchToggle`／`KabeCardView`／`InlineMarkdownCode`、`webSearchPreference`／`sourceChips`／`chat-assistant-persistence`／`shared/webSearch`、Web 検索テスト群、ゴミ箱の API／ページ／`lib/threads/*`／テスト、技術スタック表の `claude-fable-5-1`・`gpt-6-astra`、`app/api/threads/[id]/route.ts` PATCH の説明（`.upsert()` ではなく `deleted_at is null` 条件つき UPDATE→ゴミ箱確認→INSERT）などを作業ツリーの CLAUDE.md に反映し「commit は Rui の作業」としたが、現行 CLAUDE.md には**これらがほぼ存在しない**（`git log -S"SourceChips" -- CLAUDE.md` と `git log -S"KabeCardView" -- CLAUDE.md` はいずれも0件。`grep -c` は `SourceChips`／`WebSearchToggle`／`KabeCardView`／`kabehub_web_search`／`soft_delete_thread` 等がすべて0）。未コミットのまま失われた（または別の変更で上書きされた）可能性が高い。claude-md-corrections.md に追記。【コード】
2. **v12 §7 の「`app/api/threads/[id]/route.ts` の PATCH は `.upsert()` ではない」と CC の DB 操作の節**: CC は今も「`threads/[id]/route.ts` の PATCH は `.upsert()` 方式」「upsert の title 必須」と書く。ゴミ箱化（v207・Phase 2b）後は条件付き UPDATE に変わっている（trash.md 判断参照）。【資料】【コード】
3. **v12 の「Lore『いいね』（B2）」と Phase 0（2026-11-17）**: 「記憶に追加」ボタンと `/api/lore/like` は撤去済みで、B2 の `plainifyKabeCards` による Lore 平文化の入口は現在存在しない（既存の `liked_ai` 行は Dreaming で変換）。B2 の記述は「実装済み」として残るが到達しない。【資料】【コード】
4. **v12 §5 D12「モバイルでカードが生コードブロックで見えるのは許容」と CC**: CC に D12 の記述はあるが（モバイル記述が2行）、モバイル展開（Phase 4）の優先度は CC にない。【資料】
5. **規則文面の13行目とチケット A**: v12 の規則全文（「本文（inline Markdown・箇条書き・改行を使える。見出し・表・コードブロックは使わない）」）は D77〜D80 反映後。CC の `kabe-card-system-prompt.test.cjs` の行（「inline Markdown・箇条書き・改行を許可する規則全文」）と一致。【資料】【コード】
6. **inventory.md の分類の確認事項**: `KabeHub_Lv2_B2_Codex実装指示書_v1.md`・`Lv2_Phase3b_Codex実装指示書_v1.md`・`Lv2_Phase3b_Codex読み取り調査指示書_v1.md`・`Lv2_カード本文リスト対応_Codex実装指示書_v1.md` は B だが、v12 が統合して「指示書の書き方の参考」としており、判断は v12 に取り込み済み。実質 C 相当。今回は読んでいない（v12・3b方針・B2方針の重複）。直していない。【資料】
7. **inventory.md の分類の確認事項**: `KabeHub_Lv2_Phase3b_方針ドラフト_v3.md`・`Lv2_B2_方針ドラフト_v2.md` は B で、v12 に判断が統合済み。3b方針は §5（既定 ON の影響）・§8（Codex の注意）が v12 に無い情報を含むため B のままでよいが、B2方針は新規情報が少ない。【資料】
8. **v12 の「v5〜v11 は履歴として残す」と inventory の C**: v1〜v11 は C（旧版）で、v12 が正本。確認の結果、v12 で足りない詳細は無かった（D 番号は全て v12 §5 に再掲）。【資料】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_リッチ会話UI_Lv1Lv2_統合_引き継ぎ資料_v12.md | A | §0〜§11（全節。40KB のため長い行は先頭420字） |
| KabeHub_Lv2_Phase3b_方針ドラフト_v3.md | B | 見出し＋§5・§6・§7・§8 |
| KabeHub_Lv2_B2_方針ドラフト_v2.md | B | 見出しのみ（§7〜§9 は v12 と重複のため未読） |
| KabeHub_Lv2_Phase3b_Codex読み取り調査指示書_v1.md | B | 見出しのみ |
| KabeHub_Lv2_Phase3b_Codex実装指示書_v1.md | B | 未読（3b方針・v12 と重複と判断） |
| KabeHub_Lv2_B2_Codex実装指示書_v1.md | B | 未読（B2方針・v12 と重複と判断） |
| KabeHub_Lv2_カード本文リスト対応_Codex実装指示書_v1.md | B | 未読（v12 §3-3 に取り込み済みと判断） |
| CLAUDE.md・`app/api/chat/route.ts`・`lib/modelRegistry.ts`・`package.json`・存在確認した各ファイル | — | 既出判定・突合のための grep／ls のみ |

読めなかった A 資料: なし。B の Codex 指示書3本（Phase3b・B2・リスト対応）は v12 と重複のため未読（上記矛盾6）。
