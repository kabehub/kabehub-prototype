# 抽出メモ: models-and-pricing（①-2）

作成: 2026-11-25／対象: モデル台帳（`lib/modelRegistry.ts`）、料金・pricing epoch、Thinking 制御、内部（裏）モデル、画像生成モデル、Gemini 4 Argon、AI 利用コスト計測（`ai_usage_events`）。
タグ: 【資料】／【コード】（実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。
略称: チケット＝モデル追加チケット_GPT5.6_Gemini3.6（2026-07-22。4本）、棚卸し＝モデル運用棚卸し（2026-09-06）、v6＝内部モデル刷新 v6（2026-10-12）、Argon＝Gemini4Argon組み込み v1（2026-10-15）、コスト＝`docs/ai-usage-cost-handover.md`（2026-08-16）、v92＝v92 実装仕様書（統計機能）。

## 確定した判断

1. **GPT-5.6 Sol／Terra／Luna と Gemini 3.6 Flash／3.5 Flash-Lite を追加**（2026-07-22 起票、コミット `e9202a7`）。台帳と `types/index.ts` を同時に変更（当時は `AssertNever` で強制同期。現在は型が台帳から導出）。価格（入力／出力 $/MTok）: Sol 5.00／30.00、Terra 2.50／15.00、Luna 1.00／6.00、Gemini 3.6 Flash 1.50／7.50（3.5 Flash の出力 9.00 より値下げ）、3.5 Flash-Lite 0.30／2.50。出典: チケット（確定版）末尾「価格根拠」。【資料】【コード】（`lib/modelRegistry.ts` の `gpt-5.6-sol` が `price(5.00, 30.00, 0.50)`、3.5 Flash-Lite が `price(0.30, 2.50)`）
2. **同チケットで既知バグ C-02（`gpt-5.5-pro` の Arena 未対応）を解消**。`callOpenAI` の Responses API 分岐を追加し、Chat／Arena の `gpt-5.5-pro` Responses リクエスト双方に `store: false` を付ける（Chat Completions 側に不要な変更をしない）。`callGemini` は複数 parts に対応し `thought` パートを除外（`includeThoughts` は送らないため通常は最終回答のみだが将来の挙動変化に備える）。Thinking レベルをユーザーが選ぶ UI は非対象。`thinking.mode: "none"` は Claude 向け Extended Thinking UI 上の扱いであり、Gemini 側の Thinking を無効化するものではない（`thinkingConfig` は送らない）。判断者: ChatGPT レビュー（2026-07-22）の3点を Claude が反映。出典: チケット（確定版）§1・§3・§4・受け入れ条件。【資料】【コード】（`app/api/chat/route.ts:538`・`app/api/arena/route.ts:310` に `store: false`、`arena/route.ts:274` に `thought` 除外）
3. **モデル追加の手順に「価格は一次情報（各社公式ページ）を直接 fetch し、固定値を決め打ちしない」を加える**（Gemini の時限 pricing の過大計上事例）。区分②③（`NOVEL_CHECK_CONFIG`・`EXTRACT_SETTINGS_CONFIG`・`IMAGE_PAGE_CONFIG`・`lib/internalModels.ts`）はレジストリの手順では自動導出されず、各 config の定義箇所を直接編集する。出典: 棚卸し「新モデル追加の正本手順」・区分②③。【資料】【コード】（`lib/internalModels.ts`・`IMAGE_PAGE_CONFIG` は存在）
4. **内部（裏）モデルは「モデル ID をユーザーが選べない AI 呼び出し」**。棚卸し時点（2026-09-06）の3系統: Arena（プロバイダーのみ選択、modelId 未送信＝実質サーバー固定）、小説設定抽出、Lore（`LORE_CHAT_MODEL`／`LORE_EMBEDDING_MODEL`）。Codex が提案した整理の優先度: ①`INTERNAL_TASK_MODELS` のサーバー専用設定へ集約 ②ユーザー選択用レジストリと裏モデル設定の分離 ③抽出・Lore にも実モデル・トークン・コストを記録（当時 `ai_usage_events` 未記録）④チャット中の Embedding 二重実行の統合（その後 B2-1 で解消）⑤Arena メッセージにも `model_id` を保存 ⑥Web 用・mobile 用の重複設定の一本化。出典: 棚卸し。【資料】
5. **内部モデル刷新（v4〜v6、2026-10）の決定事項**: Gemini 既定 `gemini-3.8-flash`（`gemini-3.5-flash`／`3.7-flash` は `deprecated`・価格保持）／Claude 既定 `claude-sonnet-5-5`（ui・chat・arena）／Haiku 5.5 はチャット専用（`surfaces: { chat:true, arena:false }`、内部処理に使わない）／Sonnet 5 の過去コスト補正（9/1〜10/11、17件、約1.5倍の過大計上、差額約 $0.47）はスキップ／Sol の 272K 超 tier は公式表に無く未登録／**Phase 4B（`LORE_CHAT_MODEL` を `gpt-6-luna` へ）は保留**（全9箇所で品質・コストを測定してから）／D（Embedding 移行）は保留。コミット: Phase 0 `a43d959`、1B `15022fa`、1A `108876a`、2 `a3b0e1c`、3 `508927d`、4A `da62dd0`。出典: v6 §1-B・§2。【資料】【コード】（`LORE_CHAT_MODEL = "gpt-5.6-luna"`、`lib/internalModels.ts:14`）
6. **新モデルの価格（v6 §3、入力／出力 $/MTok）**: `claude-sonnet-5-5` 2.00／10.00（cache read 0.10×）、`claude-opus-5-5` 4.00／20.00（thinking always_on）、`claude-haiku-5-5` 0.10／0.50（cache 0.01、prompt 100,000 超で 0.50／2.50＝cache 0.05）、`gpt-6-luna` 0.10／0.50（cached 0.01、272K 超で 0.20／0.75＝cached 0.02）、`gpt-6-sol` 2.00／10.00（cached 0.20、272K tier は未登録）、`gpt-6.1-sol` 2.00／10.00（cached 0.10、272K 超で 4.00／15.00＝cached 0.20）、`claude-sonnet-5` を 2.00／10.00 に訂正。tier 判定は `lib/aiUsage.ts` の `getPricingPromptTokens`（Claude は input＋cache creation＋cache read の合計、Gemini／OpenAI は `inputTokens`（キャッシュ込み）。境界テスト 100,000／100,001）。【資料】【コード】（価格は台帳と一致する範囲で確認。`getPricingPromptTokens` は未確認）
7. **Thinking 制御**: Sonnet 5.5 は `thinking:{type:"disabled"}` を 400 で拒否するため、`resolveClaudeRequestOverrides` は always-on／default-on のモデルでは `thinking` を送らず `max_tokens: 16000` を返す。`ChatCompletionsReasoningEffort` に `"none"` を追加（現状どのモデルも未使用）。`getNovelCheckModels()` は `status==="active"` のみ、`NOVEL_CHECK_CONFIG.defaultModelId = gemini-3.8-flash`。`EXTRACT_SETTINGS_CONFIG = { claude: "claude-sonnet-5-5", gemini: "gemini-3.8-flash", openai: "gpt-4o" }`。出典: v6 §3。【資料】【コード】（`lib/modelRegistry.ts:409-426`）
8. **extract-settings（Phase 4A、コミット `da62dd0`）**: Claude 分岐は `thinking:{type:"between_tools"}`、`max_tokens: 4096`。`stop_reason==='max_tokens'` ならログ `[extract-settings] output truncated` を出し、`error:'output_truncated'`（500）を返して保存しない。text ブロックは `lib/extractSettingsResponse.ts` の `extractClaudeSettingsText` で結合。出典: v6 §3。【資料】【コード】（`app/api/extract-settings/route.ts:158` に `between_tools`）
9. **GPT Image 2.5 導入（2026-10-12）**: 置換型（OpenAI 側は1モデル固定、選択 UI なし）。**画像編集（`/v1/images/edits`）は入れない**（`img2img:false`）、`quality` は送らない（省略時 `auto`）、速度重視の Flare は追加しない、日付固定スナップショット（`-2026-09-08`）は使わず無印 ID。`gpt-image-2` は `status:"hidden"`（label `(UI非表示)`）で残す。理由は ID・料金定義の互換性と既存のコスト計算処理・テストの維持（過去イベントの再計算のためではない。`lib/usageStats.ts` は保存済みの `estimated_cost_usd` を集計）。価格は text 入力 5.00／image 入力 8.00／cached image 入力 2.00／image 出力 30.00 で `gpt-image-2` と同額。`PROVIDER_CONFIG.image_gen.defaultModelId` を `gpt-image-2.5-sunburst` に変更。出典: v6 §1-A。【資料】【コード】（`lib/modelRegistry.ts:201-202`、CC の技術スタック表にも反映済み）
10. **Gemini 4 Argon 追加（2026-10-15、Task A `bcced95`／Task B `aa1d669`）**: 案A を採用し、`generationConfig`／`thinkingConfig`／`includeThoughts` を**送らない**（思考レベルは既定 medium、KabeHub からは変更不可）。既定モデルは `gemini-3.8-flash` のまま、Argon は選択肢への追加のみ。`surfaces: { chat, arena }`、`thinking: { control:"always_on" }`、badge `最高性能`、label `4 Argon`。novel-check・extract-settings・`lib/internalModels.ts`・`apps/mobile/**` は変更しない（mobile は共有レジストリ経由で自動的に出る）。Interactions API への移行は不要（Chat は `streamGenerateContent?alt=sse`、Arena は `generateContent`）。出典: Argon §1・§2・§4。【資料】【コード】（`lib/modelRegistry.ts` に `gemini-4-argon`、`always_on` の注記を確認）
11. **Argon の料金とキャッシュ**: 〜2026-11-30 は 2.00／0.10（キャッシュ入力）／10.00、**2026-12-01 00:00 UTC 以降は 4.00／0.20／20.00**（レジストリの `PricingEpoch`）。`lib/aiUsage.ts` の Gemini 分岐を `tier.cachedInputPerMTok ?? tier.inputPerMTok * GEMINI_CACHE_READ_MULTIPLIER` に変更（修正前は Argon に 0.1 倍が適用され、12月以降は過小計上になる状態）。明示的キャッシュは非対応、暗黙キャッシュは 4096 トークン以上で有効、`cachedContentTokenCount` は `promptTokenCount` に含まれる（ヒットしないとキー自体が出ない）。`streamGemini` に thought パート除外（`p.thought !== true`）を追加。出典: Argon §3・§4。【資料】【コード】（`lib/modelRegistry.ts:158` に `from: "2026-12-01T00:00:00.000Z"`）
12. **Gemini の異常終了ログ（Task B）**: `lib/logger.ts` の `geminiAbnormalFinish({modelId, finishReason})` が `console.warn("[gemini-abnormal-finish]", …)`。`finishReason` は `"MAX_TOKENS" | "OTHER"` のみ（`STOP`・未取得はログなし、それ以外は `OTHER` に丸める）。生の文字列・本文・usage は出さない。`streamGemini` はストリーム正常終了後に1回判定（abort・読み取り例外・fetch／HTTP 失敗では出さない）。出典: Argon §4。【資料】【未確認】（`lib/logger.ts` の該当関数は今回 grep していない）
13. **Argon の仕様メモ**: 出力上限は非ストリーム 32,768／ストリーム 65,536（`MAX_TOKENS` で終了し `continuation_token` が返る）、generateContent の HTTP タイムアウトは 20 分以上を推奨（Interactions API は 15 分）、利用には有料 API プロジェクトが必要。出典: Argon §3。【資料】
14. **AI 利用コスト計測基盤（v181・v182、2026-08）**: `ai_usage_events` が Managed Plan（Phase 4）のクレジット消費の正本候補（残高・予約・確定・返却のロジックは対象外）。Arena は `request_type='arena'` で実 token usage を記録し、provider 呼び出し直前に usage event ID と `priced_at` を固定、実際に解決された model ID を記録、provider 成功時のみ記録、assistant message INSERT 失敗時も `message_id=null` で記録、記録全体が best-effort（失敗しても Arena の 200 と `saved` を変えない）。2026-08-16 に test 環境で Claude Haiku 4.5 の実呼び出しで正常系・INSERT 失敗系を確認。出典: コスト「v182 Arena usage収集」。【資料】【コード】（CC に `ai_usage_events` の言及あり）
15. **Opus 4.8 の `effort` パラメータ対応は実装されていない（現状）**。APIメモその1 は「`isDeepThinking` は全モデル共通の旧来 `thinking` パラメータ方式で、Opus 4.8 では本来 `effort` に切り替えるべき」と提案するが、現行コードは Opus 4.8 を `thinking: { control: "toggleable", requestType: "adaptive", defaultOn: false }` とし、`canToggleDeepThinking` は「toggleable かつ defaultOn が false」だけ true（＝手動 Thinking 切替を出す）、`resolveClaudeRequestOverrides` は手動 ON のとき `thinking: { type: "adaptive", display: "summarized" }`＋`max_tokens: 16000` を返す（`requestType: "enabled"` のモデルだけ `budget_tokens: 10000` 方式）。always_on／default-on のモデルは `thinking` を送らず `max_tokens: 16000`、それ以外は `max_tokens: 8192`。Claude へ `effort` を送るコードは `app/api/chat/route.ts` にも台帳にも無い（`reasoning_effort` は OpenAI Chat Completions 用のみ）。つまり Opus 4.8 は adaptive thinking（Anthropic の現行方式）で扱われており、`effort` の段階切替（低／中／高）は未実装。出典: APIメモその1 §4（chat-core.md 宿題8）、`lib/modelRegistry.ts`。【資料】【コード】（`lib/modelRegistry.ts:122,404-426`、`app/api/chat/route.ts` に `effort` なし）
16. **v92（統計機能）**: `messages.input_tokens`／`output_tokens` を追加し、ストリーミング完了後に各プロバイダーの usage を保存、`/api/stats` で期間別（today／week／month／all）に集計する仕様。現行は `ai_usage_events`（v181）が正本で、v92 の構成は履歴。出典: v92。【資料】【コード】（`messages` のカラムは CC に記載）

## 地雷（CLAUDE.mdに載っていないもの）

1. **料金定義は日付で切り替わる（`PricingEpoch`）。期限が近いものがある**: Argon は **2026-12-01 00:00 UTC** から倍額（4.00／0.20／20.00）。Gemini 3.6／3.7／3.8 Flash は **2027-01-01** に 1.50／7.50 へ（3.8 Flash は導入価格 0.75／3.75 が 2026-12-31 まで）。切替後の初日に `ai_usage_events` の金額が新単価で計算されているか確認する。出典: Argon §6、v6 §5-2。CC に切替日の記載なし。【資料】【コード】（`lib/modelRegistry.ts:140,144,148,158`）
2. **日付なしの `getPricing("gemini-4-argon")` は 2026-12-01 に結果が変わる**。Argon の料金を含むテストは必ず `Date` を明示する。出典: Argon §8。【資料】
3. **`gemini-3.8-flash` の `novelCheck.estimatedInputPerMTok` は epoch に連動せず固定値 0.75**。2027-01-01 以降は 1.50 への変更が必要。出典: v6 §5-2・§6。【資料】【コード】（`lib/modelRegistry.ts:149` に `estimatedInputPerMTok: 0.75`、epoch は別に 2027-01-01 の 1.50）
4. **`hidden` は「API から使用禁止」ではない**。`getDefaultImageModel` は `status==="active"` のみ、`isAllowedImageModel` は `retired` 以外を許可する。さらに `getImagePageModels()` は status ではなく `imagePage` メタデータの有無で選ぶため、`hidden` の `gemini-3.1-flash-image`・`gemini-3-pro-image` は画像ページに表示される（README もその前提）。`gpt-image-2` は `imagePage` を持たないので影響しない。OpenAI 経路は `modelId` を受け取らないため旧モデルは呼ばれない。出典: v6 §1-A・§4-1・§5-9。CC に `getImagePageModels` の記載なし。【資料】【コード】（`getImagePageModels` は `lib/modelRegistry.ts:451`）
5. **画像生成の `usage` 内訳は OpenAI から KabeHub サーバーへの上流レスポンスの値で、クライアントへは返していない**（ブラウザの Network タブでは見えない）。内訳のフィールド名は公式 schema が不確定で、`handleOpenAI` は複数の名前を受ける。想定外の形だと `cost_source` が `unavailable` になる。`ImagePricing` には cached text 入力の枠がなく、Images API ではキャッシュ割引が効かない前提。公式ページ上は Responses API 利用時に適用される旨の記載がある（Rui 側のレビュー情報、未確認）。`upstreamError()` のユーザー向けメッセージは汎用で、Tier 不足・組織認証不足の理由は案内しない。出典: v6 §1-A・§5-6〜5-8、コスト「実API確認の状態」。【資料】
6. **Argon の思考トークン課金は未検証**: `includeThoughts` を送らない既定呼び出しでは `thoughtsTokenCount` が返らず `total = prompt + candidates`。`includeThoughts:true` では `thought:true` パートと `thoughtsTokenCount`（実測 790／2141）が返り total に含まれた。既定呼び出しで思考トークンが課金されるかは Google 請求と未照合（請求照合は未実施）。CC には「思考トークンが報告されない場合は含まれない」と注記あり（既出）。出典: Argon §5-1・§5-2。【資料】
7. **Argon（Arena）のレイテンシは 5〜25 秒、`maxDuration` の指定がルートに無い**。Vercel のプランと Default Max Duration は未確認（「Hobby／Fluid／300 秒」の前提は引き継ぎ資料由来）。`MAX_TOKENS` 終了時の `continuation_token` による続行は未実装。`OTHER` の内訳（`SAFETY` など）はログから区別できない。画像入力は未テスト。出典: Argon §5。【資料】【未確認】
8. **Codex 指示書のテスト変更対象は、旧モデル ID を `grep` で参照している全ファイルを事前に洗い出す**（v6 では `scripts/loadModel.test.cjs` が抜けた）。`npm run build` で `next-env.d.ts` が変わったら元に戻す。CC に記載なし（CC の `next-env` 言及は0件）。出典: v6 §7、Argon §8。【資料】
9. **`MODEL_REGISTRY` は `as const satisfies readonly ModelDef[]` を維持する**（型注釈を足すとリテラル型が壊れる。S25 T2 の教訓）。出典: チケット §1 Constraints（再修_）。【資料】
10. **`gpt-6-sol`／`gpt-6.1-sol` は `reasoningEffort:"medium"` を持つが、`thinking` 表示は `unsupported`**（UI から切替不可）。意図通りか要確認のまま。出典: v6 §5-5。【資料】【未確認】
11. **`LORE_CHAT_MODEL` は9箇所で共有**（Lore: `batchTrain`・`dreaming`・`consolidationLlm`、Project Memory: `auto-summary`・`auto-summary-update`・`consolidation`・`instruction-edit`）。切り替える前に全箇所で品質とコストを測定する。内部処理は OpenAI キーが無いと使えない。出典: v6 §4-2・§5-4。【資料】【コード】（`LORE_CHAT_MODEL` の定義を確認）
12. **コード上のモデル ID 直書きは `modelRegistry.ts`（lib と shared）、`internalModels.ts`、`extract-settings/route.ts` の3ファイルに限る**（v5 時点の確認）。追加で直書きが増えていないかは新規追加の監査で確認する。出典: v6 §4-2。【資料】【未確認】

CLAUDE.mdに既出: 10項目（台帳が正本・lib と shared のミラー・追加手順1〜5・`gpt-5.5-pro` の Responses 分岐・画像モデル置換時のテスト3本・`hidden` で旧モデル維持・Gemini 4 Argon の有料 API 必須・Argon 料金は目安・`resolveClaudeRequestOverrides`／`canToggleDeepThinking`・Arena の Thinking 共有）。

## 未実装・宿題

1. **期限あり**: Argon の倍額切替（2026-12-01）後の初日確認、Gemini 3.x／3.8 Flash の 2027-01-01 切替、`gemini-3.8-flash` の `novelCheck.estimatedInputPerMTok` の更新。【資料】【コード】
2. **Phase 4B**: `LORE_CHAT_MODEL` を `gpt-6-luna` へ（全9箇所の測定が前提）、**D**: Embedding 移行（`LORE_EMBEDDING_MODEL` の変更は既存 embedding の全再生成・次元・index・検索 RPC の整合確認が必須）、Sol の 272K tier。保留。出典: v6 §2・§6。【資料】
3. **画像編集（`/v1/images/edits`、multipart）の実装**: `img2img` の有効化、`handleOpenAI` の拒否分岐の置換、UI の編集導線が必要。`quality` の指定（`auto` の実コストを見てから）、Flare の追加（速度への不満が出たら）。出典: v6 §6。【資料】【コード】（`app/api/image-gen/route.ts:146-148` が 400 を返す）
4. **実機確認の数値の記録**: GPT Image 2.5 の `cost_source`・金額・OpenAI 課金画面との照合・`quality` 省略時の1枚あたり実コスト、Argon の `ai_usage_events` の `cost_source` と金額・Arena の所要時間・画像入力。出典: v6 §1-A、Argon §7。【資料】【未確認】
5. **Argon の請求照合**（同一設定で同じプロンプトを10回ほど呼び、翌日に Google 側の利用量と KabeHub の計算値を比較）、Vercel のプラン・`maxDuration` の確認、`[gemini-abnormal-finish]` の発生頻度の確認、`thinkingLevel` を KabeHub から変更できる案（保留）。出典: Argon §5・§6。【資料】【未確認】
6. **抽出が長いスレッドで途切れた場合のみ**（Vercel ログ `[extract-settings] output truncated`）、`max_tokens` を 8192 に上げる別タスク。出典: v6 §6。【資料】
7. **`getImagePageModels()` が status を見ない点の整理**（将来の整理課題）。出典: v6 §5-9。【資料】【コード】
8. **棚卸しの整理案（Codex 提案）の未実施分**: 裏モデル設定の分離（`INTERNAL_TASK_MODELS`）、抽出・Lore の実モデル／トークン／コストの記録、Arena メッセージへの `model_id` 保存。現状の記録有無は未確認。出典: 棚卸し。【資料】【未確認】
9. **Opus 4.8 の `effort` 切替**（段階切替）は未実装。実装する場合は `requestType: "adaptive"` のモデルに `effort` を送る設計が必要で、`canToggleDeepThinking` の意味（ON／OFF）も変わる。出典: APIメモその1 §4。【資料】【コード】
10. **`v6 §6`**: CLAUDE.md の最終更新行から消えた 10/07 の要約の復元（任意）。出典: v6 §6。【資料】【未確認】

## 矛盾・要照合

1. **モデル追加チケット4本の最終版は「確定版」とすべき（B の昇格を推奨）**。判断の根拠: ①更新日時の順は 無印 → 修_ → 再修_ → 確定版 で、確定版が最新（無印 1784764909、修_ …65445、再修_ …66156、確定版 …67308）②確定版は「ChatGPT レビュー（2026-07-22）の指摘3点を反映」し、「CLAUDE.md の C-02 言及が4箇所ではなく6箇所と判明したため §8 を修正した」と明記（再修_ は「4箇所」のまま）③確定版にだけ、`thinking.mode:"none"` は Gemini 側 Thinking を無効にしない旨、`store: false` が Chat／Arena の `gpt-5.5-pro` 双方に必要という受け入れ条件、`streamGemini` が既に複数 parts 対応済みで本チケットは「Arena 側を揃える」だけという表現修正がある ④再修_ にだけある行（`S25 T2` の教訓、価格根拠の「API.txt 記載」、`includeThoughts` の補足）は表現の差で、決定の差ではない。実装との突合: `store: false` は Chat（`route.ts:538`）・Arena（`:310`）とも入り、`callGemini` の `thought` 除外も実装済みで、確定版の内容と整合する（再修_ とも矛盾しない）。**よって、確定版を B に昇格し、再修_ は C に降格するのが妥当**。無印・修_ は `app/api/chat/route.ts` を「変更不要」とする古い版で C のまま。inventory.md は直していない。【資料】【コード】
2. **棚卸し（2026-09-06）の内容は一部古い**: Arena の既定は `claude-sonnet-5`→現行 `claude-sonnet-5-5`、Lore の内部モデルは `gpt-4o-mini`→現行 `gpt-5.6-luna`、画像モデルは `gpt-image-2`→`gpt-image-2.5-sunburst`、「Embedding 二重実行は未統合（S17）」→2026-10-04 に解消。棚卸しの現行値は v6 §4 を使うこと。【コード】
3. **v6 §4-1「OpenAI 画像は img2img 非対応」と画像入力対応メモ**: コードは OpenAI のみ非対応（400）、Gemini と Ideogram は対応（`imageRefId`）。メモ（`gpt-image-2` の `images.edit()`）は未実装のまま。【コード】
4. **CLAUDE.md の技術スタック表のモデル一覧が台帳より古い**: CC の Claude 行に `claude-fable-5-1` が無く、OpenAI 行に `gpt-6-astra` が無い（台帳・v6 §4-1 にはあり）。claude-md-corrections.md に追記。【コード】
5. **Argon §1「テスト 670 件」など件数**: 2026-10-15 時点の値で現行（CC は `npm test` 1827 件）とは別時点。参照しない。【資料】
6. **コスト資料の「既存ブロッカー: `scripts/lore.test.cjs` の `normalizeTags`」**（2026-08-16）: 現行テストは全件成功（CC の記載）で解消済みとみられる。【資料】【未確認】
7. **inventory.md の分類の確認事項**: `v92 実装仕様書：会話数カウント＋統計機能.txt` は A だが、`ai_usage_events`（v181）に置き換わった履歴仕様で、`models-and-pricing` の本質（台帳・価格）から外れる。B 以下が妥当な可能性。また `docs/ai-usage-cost-handover.md` は models-and-pricing で B だが、内容の大半は Arena usage 収集の記録。直していない。【資料】
8. **inventory.md の分類の確認事項**: `モデル運用棚卸し.md` は A だが、2026-09-06 時点で一部が古く（矛盾2）、更新後の現行表は v6 に引き継がれている。区分①②③の構造と提案リスト以外は B 相当。直していない。【資料】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_Gemini4Argon組み込み_引き継ぎ資料_v1.md | A | 全文（9KB） |
| KabeHub_内部モデル刷新_引き継ぎ資料_v6.md | A | 全文（13KB） |
| KabeHub_モデル運用棚卸し.md | A | 全文（10KB） |
| v92 実装仕様書：会話数カウント＋統計機能.txt | A | 先頭90行（仕様の冒頭。コード例は未読） |
| 再修_KabeHub_モデル追加チケット_GPT5.6_Gemini3.6.md | B | 見出し＋確定版との行差分（差分行を全て確認） |
| KabeHub_モデル追加チケット_確定版_GPT5.6_Gemini3.6.md | C | 再修_ との比較のため差分行と見出しのみ（C だが最終版の判断に必要なため。内容の取り込みは判断2に限る） |
| docs/ai-usage-cost-handover.md | B | 全文（4KB） |
| APIメモその1.txt | B | chat-core の抽出で読了（§4 の effort のみ参照） |
| CLAUDE.md・`lib/modelRegistry.ts`・`app/api/chat/route.ts`・`app/api/arena/route.ts`・`app/api/image-gen/route.ts` | — | 既出判定・突合のための grep のみ |

読めなかった A 資料: なし（v92 は冒頭のみ。残りは履歴仕様のため未読）。
