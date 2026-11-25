# 抽出メモ: novel-and-roleplay（①-2）

作成: 2026-11-25／対象: 小説執筆モード（小説 Project・`folder_type:"novel"`）、キャラクター・設定 DB（`novel_settings`）、整合性チェック（`/novel-check`）、なりきりモード（`roleplay_mode`）。
タグ: 【資料】／【コード】（実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。
略称: 小説方針＝小説執筆モード実装方針_20260517（2026-05-17、**当時のステータスは「構想・未実装」**）、⑥実施＝⑥実施.txt（⑥ Extended Thinking の実装メモ、小説方針の⑥と同日付近、約1KB）、ジャンル＝ジャンル分類機能_設計メモ（2026-04-04、内容は小説ではなく explore のジャンル分類。矛盾1）。
**注**: この機能の A／B 資料はこの3本のみで、**なりきりモード（roleplay）の判断を書いた A／B 資料は旧フォルダにない**（CC の「なりきりモード」節のみ）。mobile の Novel Check は mobile の抽出（後続）で扱うため参照のみ。

## 確定した判断

1. **小説執筆モードの構想（2026-05-17）**: KabeHub を長編・連載小説を書く個人作家の壁打ち・管理ツールとして特化させる。「思考の GitHub」と親和性が高く、「執筆プロセスごと保存・公開できる」差別化になりうる。優先度一覧（★＝優先）: ①小説プロジェクトモード（Prompt Caching 特化、★★★・難易度★☆☆）／②キャラクター＆設定 DB 自動生成（Structured Outputs、★★★・★★☆）／③全文整合性チェック（Gemini 超長文、★★☆）／④Esc キャンセル・再生成時のブランチ保存（★★☆）／⑤RAG Lore Book（★☆☆・★★★）／⑥Extended Thinking（★☆☆）／⑦口述筆記モード（Whisper、★☆☆）／⑧非同期整合性チェック（Background mode、☆☆☆）。出典: 小説方針「優先順位一覧」。判断者: Claude の方針資料（採否は個別資料を参照）。【資料】
2. **① 小説プロジェクトモード**: 既存のフォルダ機能＋システムプロンプト機能を「小説プロジェクト」として束ねる専用 UI モード。フォルダ単位のシステムプロンプトに数万文字の設定資料を入れ、Claude の Prompt Caching で2回目以降の入力コストが約1/10になる前提。`folder_settings` に `folder_type text`（`NULL`＝通常／`"novel"`）を追加。フォルダアイコンに「📖 小説」バッジ、システムプロンプトの文字数・Caching 状態をヘッダーに表示。推奨システムプロンプトのテンプレート（世界観設定／登場人物一覧／あらすじ／現在の執筆状況／執筆スタイル指定）を UI 上で提示。「5,000文字以上のシステムプロンプトからキャッシュが効き始める（Anthropic の仕様）」が前提（現行 UI は5,000字で「Caching 有効」バッジ）。出典: 小説方針「①」。【資料】【コード】（`project_settings.folder_type` が `docs/schema.sql:1615`、`app/api/chat/route.ts:899` が `folder_type === "novel"` を判定、`components/Sidebar.tsx:1670` に 5000）
3. **② キャラクター＆設定 DB 自動生成**: `app/api/extract-settings/route.ts`（会話内容から Structured Outputs で JSON を返す）、`components/NovelSettingsPane.tsx`（キャラ DB・設定 DB 表示、OutlinePane と排他表示）。**自動抽出は「ボタンを押したときだけ実行」**（毎ターン走らせるとコスト増）。保存は専用テーブル `novel_settings`（`type`＝`character`／`faction`／`timeline`／`glossary`、`data jsonb`）で、スレッドをまたいで参照できるようにして将来の RAG の基盤にする。各社の Structured Outputs: Claude（JSON mode）／Gemini（`responseMimeType`＋`responseSchema`）／OpenAI（Responses＝`text.format`、Chat Completions＝`response_format: json_schema`）。出典: 小説方針「②」。【資料】【コード】（`docs/schema.sql:2578` の `novel_settings`（`unique(user_id, thread_id, type)`、`thread_id` 基準）、`app/api/extract-settings/route.ts` は `type` が `character`／`faction`／`glossary` を返す。`timeline` は未確認）
4. **③ 全文整合性チェック（`/novel-check`）**: 複数章分の原稿を Gemini 2.5 Pro（約100万トークン、日本語約50万文字）に丸ごと投げ、伏線の矛盾・キャラの口調ブレ・時系列の不整合・固有名詞の表記揺れを一括チェック。結果は KabeHub のスレッドに保存。チェック項目は、伏線／矛盾／口調ブレ／固有名詞の4つ。ストリーミング表示必須、コストが高いため実行前にトークン数の目安を表示する。当時の設計は `chat/route.ts` の `isNovelCheck: true` フラグと `ChatInput` の複数ファイル対応だが、実装は専用の `app/novel-check/page.tsx`＋`app/api/novel-check/route.ts`。出典: 小説方針「③」。【資料】【コード】（`app/novel-check/page.tsx`・`app/api/novel-check/route.ts` の存在。現行の対象モデルは Gemini のみで、`features.novelCheck` を持つ active モデル＝models-and-pricing.md 判断7）
5. **④ ブランチ保存**: 再生成時に古い assistant 発言を削除せず `is_active:false` にして保持（`messages.branch_id`／`is_active`）、非アクティブ分を折りたたみ・クリックで復元。「v94 で構想した Branching Mode の小説特化版」で、`parent_id` カラムは DB 準備済み。出典: 小説方針「④」。【資料】【コード】（現行はブランチ全体が実装済み。branching-and-regenerate.md）
6. **⑤ RAG Lore Book**: 設定資料のテキストを500〜1000文字の chunk に分割し、OpenAI `text-embedding-3-small` でベクトル化して `lore_embeddings`（`folder_name`・`chunk_text`・`embedding vector(1536)`、ivfflat）に保存。壁打ち送信時にユーザーメッセージをベクトル化してコサイン類似度で上位3〜5件を検索し、システムプロンプト末尾に自動注入。前提は pgvector の有効化（`CREATE EXTENSION IF NOT EXISTS vector;`）、OpenAI キーは既存の `kabehub_openai_key` を流用。Embedding のコストは非常に安い（$0.02/MTok）。出典: 小説方針「⑤」、⑥実施「次のアクション」。【資料】【コード】（現行の Lore Book 検索は `loreEnabled && hasOpenaiKey && loreTargetProjectId`、`project_settings.folder_type === "novel"` で有効化＝`app/api/chat/route.ts:899-902`。lore-rag.md・chat-core.md）
7. **⑥ Extended Thinking の実装方針（2026-05）**: 4ファイル変更（`ChatInput`／`chat route`／`MessageBubble`／`page.tsx`）、**DB スキーマ変更なし・thinking はメモリのみ保持**、`isDeepThinking` 時のみ JSON 行形式で enqueue し、通常時は既存形式を維持。Gemini レビューを踏まえ、**チャンク分割対策（バッファリング）を ClaudeCode への指示文に明示**。ClaudeCode が実装完了・動作確認 OK。出典: ⑥実施「やったこと」。【資料】【コード】（現行は `resolveClaudeRequestOverrides`・`canToggleDeepThinking` で管理＝models-and-pricing.md 判断7・15）
8. **小説方針の実装ロードマップ案**: Phase A（追加コスト・DB 変更なし: ①小説プロジェクトモード UI、⑥Extended Thinking トグル）→Phase B（UI 追加・軽量: ②Structured Outputs キャラクター DB、③整合性チェック専用ページ、④ブランチ保存）→Phase C（インフラ変更: ⑤RAG Lore Book、⑦口述筆記）→Phase D（Responses API 移行後: ⑧Background mode）。出典: 小説方針「実装ロードマップ案」。【資料】

## 地雷（CLAUDE.mdに載っていないもの）

1. **小説モードの有効化は `project_settings.folder_type === "novel"` のみで決まる**。この Project に限り、Lore Book 検索（`loreEnabled`）と、リッチ表示モードの除外（cards を注入しない）が連動する。CC に `folder_type` の記述が0件（claude-md-corrections.md に追記）。出典: コード。【コード】（`app/api/chat/route.ts:883,899-902`）
2. **`extract-settings` は「ユーザーが選んだプロバイダー」で動く**（`x-anthropic-api-key`→`x-gemini-api-key`→`x-openai-api-key` の優先順位、フェイルオーバーではない）。モデルは `EXTRACT_SETTINGS_CONFIG`（claude `claude-sonnet-5-5`／gemini `gemini-3.8-flash`／openai `gpt-4o`）。Claude 分岐は `thinking:{type:"between_tools"}`・`max_tokens:4096`、途切れたら `output_truncated`（500）で保存しない。`novel_settings` は `thread_id` 基準で `unique(user_id, thread_id, type)`、`folder_name` 列は legacy。出典: コード、models-and-pricing.md 判断7・8。【コード】【資料】
3. **GET `/api/extract-settings` は `character`／`faction`／`glossary` の3種を返す**（`timeline` は小説方針で構想されたが、現行の取得レスポンスには無い）。出典: コード。【コード】（`app/api/extract-settings/route.ts:42-47`）
4. **「ボタンを押したときだけ抽出」を維持する**（毎ターン抽出するとコスト増）。抽出結果は `novel_settings` に種類別の一括 upsert（`onConflict: user_id,thread_id,type`）で、1項目だけ追記する API はない（highlight.md 宿題3）。出典: 小説方針「②」、ハイライト検討 v3 §7。【資料】【未確認】
5. **Prompt Caching は5,000文字以上から効き始める（Anthropic の仕様）**とされ、UI の「Caching 有効」バッジは小説モードでシステムプロンプトが5,000字以上のときに出る。モデルごとの最小トークン数との厳密な対応は未確認（chat-core.md 地雷4）。出典: 小説方針「①」。【資料】【コード】
6. **整合性チェック（`/novel-check`）のコスト**: Gemini 2.5 Pro は入力 $1.25/MTok（当時）。実行前にトークン数の目安を表示する設計。現行は `features.novelCheck.estimatedInputPerMTok`（台帳）を使い、`gemini-3.8-flash` は 2027-01-01 の値上げに連動しない固定値（models-and-pricing.md 地雷3）。出典: 小説方針「③」。【資料】【コード】

CLAUDE.mdに既出: 3項目（`extract-settings`／`novel-check`／`NovelSettingsPane`／`OutlinePane` の API・コンポーネント行、`roleplay_mode`・`rp_char_name` を使うなりきりモードのフォーク時リセットと公開不可ガード、小説モード（`roleplay_mode`／`folder_type`）の除外の一部）。

## 未実装・宿題

1. **⑦ 口述筆記モード（OpenAI Whisper）**: 音声を `MediaRecorder` で録音→`POST /api/transcribe`（multipart）→Whisper（`whisper-1`、$0.006/分）→入力欄に挿入または直接メモ保存。ブラウザの対応フォーマット差（Chrome＝WebM、Safari＝MP4）、スマホのマイク権限。CC は低優先・後回しに記載。出典: 小説方針「⑦」。【資料】【コード】（`app/api/transcribe` は存在しない）
2. **⑧ 非同期整合性チェック（OpenAI Responses API の Background mode）**: Responses API 移行・`store: true` 必須（ZDR 非対応）・ポーリング（フロントの `useInterval` か Vercel Cron）。CC は低優先・後回しに記載。出典: 小説方針「⑧」。【資料】
3. **⑥実施の「次のアクション」（⑤RAG Lore Book の事前確認）**: Supabase で `CREATE EXTENSION IF NOT EXISTS vector;`、新会話で5ファイル（chat route・ChatInput・Sidebar・NovelSettingsPane・page.tsx）を貼って RAG Lore Book 実装へ。当時の手順で、現行は実装済み（pgvector は `docs/schema.sql:107` で `create extension if not exists vector`）。【資料】【コード】
4. **②の将来拡張**: スキーマを変えれば勢力図・タイムライン・用語集などに対応できる設計だが、`timeline` は現行の抽出・取得に無い。出典: 小説方針「②」。【資料】【コード】【未確認】
5. **なりきりモード（roleplay）の判断は資料なし**: 方針書「なりきりモード」は CC の記述（公開不可ガード・フォーク時のリセット・`rp_char_name`／`rp_char_icon_url`・`roleplay_mode`）が唯一の根拠。`RoleplayBubble.tsx`（LINE ライク UI）の設計判断は、v1〜v175 の引き継ぎ資料（C）にしかない可能性がある。【未確認】

## 矛盾・要照合

1. **inventory.md の分類の確認事項**: `KabeHub_ジャンル分類機能_設計メモ.md`（A、novel-and-roleplay）は、内容が **explore のジャンル分類**（日本十進分類法をもとに30〜40項目、`lib/genres.ts` の `GENRES`、`threads.genre`、`/explore` の大分類→中分類の絞り込み）で、小説・なりきりとは無関係。sharing-and-explore の資料（`lib/genres.ts` は CC の Lib 表にあり実装済み）。未読の判断は、ステータス「Phase 4 以降で実装予定」と、「既存スレッドへの遡及付与は不要」「ジャンルマスタの ID を変えると既存データが孤立する」の2点のみ。sharing-and-explore.md には入れていない（資料を読む順序のため）。直していない。【資料】
2. **小説方針の「ステータス: 構想・未実装」と現行**: ①②③④⑤⑥は実装済み（上記の【コード】）。⑦⑧は未実装。資料側が古いので「判断」として扱うときは「構想時の仕様」と明記した。【資料】【コード】
3. **小説方針の「`isNovelCheck: true` フラグ（`chat/route.ts`）」と「ファイル添付の拡張」**: 現行は専用ページ＋専用 route（`/api/novel-check`、入力検証後に外部 AI API）。設計が変わっている。【コード】
4. **小説方針の「`lore_embeddings.folder_name`」**: 現行は `project_id` 基準で、`folder_name` 列は v199 で削除済み。【コード】
5. **⑥実施の資料日付**: ファイル内に日付なし。小説方針の⑥と同じ作業（2026-05）の記録と推定。【資料】【未確認】
6. **inventory.md の分類の確認事項**: `⑥実施.txt`（B）は約1KB のメモで、確定事項は判断7のみ。実質は小説方針の補足。【資料】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_小説執筆モード実装方針_20260517.md | A | 全文（18KB） |
| KabeHub_ジャンル分類機能_設計メモ.md | A | 全文（6KB。内容は explore のジャンル分類で、この機能の資料ではない） |
| ⑥実施.txt | B | 全文（1KB） |
| CLAUDE.md・`app/api/extract-settings/route.ts`・`app/api/chat/route.ts`・`docs/schema.sql`・`app/novel-check/`・`components/Sidebar.tsx` | — | 既出判定・突合のための grep／ls のみ |

読めなかった A 資料: なし。
