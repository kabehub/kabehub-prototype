# CLAUDE.md 訂正・補完候補（B1抽出で見つかったもの）

作成: 2026-11-25／出典: `docs/_reorg/extract/` の chat-core・branching-and-regenerate・auto-summary の「矛盾・要照合」「地雷」。
**CLAUDE.md は変更していない**。本表は②（Codex による書き換え）・③（Claude による検査）の入力。行番号は 2026-11-25 時点の `CLAUDE.md` のもの。
種別: **古い**＝記述が現状と合わない／**欠けている**＝実装・運用上の事実が載っていない／**整理**＝履歴行などの整理候補。
根拠: 【コード】＝実ファイルを grep で確認／【資料】＝資料の記述のみ／【未確認】。

## A. 現状と合わない記述（古い）

| # | 機能 | CLAUDE.md の該当節（行） | 現在の記述 | 実際 | 出典（extract／資料） |
|-|-|-|-|-|-|
| 1 | auto-summary | 「API Routes（Project Memory）」直後の v206 段落（130行付近） | v206 の説明の末尾に「`docs/schema.sql`には定義が統合されているが、冒頭・v206見出しの適用状態コメントは旧記述のまま」とある | `docs/schema.sql` は冒頭8行目に「v206はテスト・本番とも適用済み」、723行目に「applied: test and production」とあり、`d283065`（docs: v206適用済み表記の統一）で修正済み。当該の「旧記述のまま」の一文は削除してよい。適用日は「資料から確認できない」のまま（schema.sql 冒頭の「2026/10/07」は統合日で適用日ではない）【コード】 | auto-summary.md 矛盾1・2；自動要約 v15 §1・§6-d・§6-e |
| 2 | chat-core | 「ストリーミング（chat/route.ts）」（488行〜）・「Claude system block」周辺 | `accumulatedText` の蓄積上限について記述なし（494行に `accumulatedText` への蓄積の言及のみ） | `app/api/chat/route.ts` に `MAX_ACCUMULATED_CHARS = 200_000`（UTF-16文字数、約600KB相当の日本語）と `TRUNCATION_NOTICE`（「[…以降は長さ上限により省略されました]」）があり、超過後は蓄積を止め、DB には超過時点まで＋省略通知文を保存する。クライアントへのストリームは継続。v111 の資料（バイト・200KB）と単位が異なる【コード】 | chat-core.md 矛盾3；v111 修正メモ Fix 5 |

## B. 実装上の事実が載っていない（欠けている）

| # | 機能 | CLAUDE.md の該当節（行） | 現在の記述 | 実際 | 出典 |
|-|-|-|-|-|-|
| 3 | chat-core | 「チャット・UI関連」の地雷表（681行〜）または `app/api/chat/route.ts` の行 | スレッド個別 system と Project 設定 `system_prompt` の優先関係の記述なし | スレッド個別の system があると、Project 設定の `system_prompt` は**合成されず丸ごと置き換わる**（`if (!resolvedSystemPrompt)`、`route.ts:896-897`）【コード】 | chat-core.md 地雷（追記分）；Pinnedキャッシュ化 v1 §1 |
| 4 | image-generation | 「API Routes（その他）」の `app/api/image-gen/route.ts`（176行） | 「画像生成（Gemini / OpenAI / Ideogram / Flux）」のみ。画像入力（img2img）の記述なし | `imageRefId`・`imageRefUpload` を受けて参照画像から生成する img2img が実装済み（`app/api/image-gen/route.ts:332-361`、Ideogram は `/remix` へ分岐）。Flux 2 Pro は img2img 非対応のため `imageRefId` の扱いは要確認【コード】 | chat-core.md 矛盾1；画像入力対応メモ |
| 5 | chat-core | 「チャット・UI関連」（681行〜）または Scripts／運用の節 | `route.ts` の行末についての記述なし | `route.ts` は CRLF 主体の混在、`ChatInputCentered.tsx` も混在（v10 §7）。行末を変換しない。現行の行末は未確認【未確認】 | chat-core.md 地雷1 |
| 6 | auto-summary | 「デバイス間作業の鉄則」（前半）または Scripts 運用 | Codex の停止条件・autocrlf の記述なし | ①Codex の停止条件は「追跡対象ファイルの未コミット変更（M／A／D）」に限定する（未追跡の `apps/.idea/`・`artifacts/` は常在で、条件に含めると止まる。現在の `git status` でも未追跡）②ノートPCは autocrlf によりワーキングコピーが CRLF、コミット済みは LF。`git diff --stat` が全行書き換えに見える場合は `--ignore-cr-at-eol` で確認③Windows の `git stash drop`／`git fetch` が権限エラーになることがある【資料】【コード】（①の未追跡のみ確認） | auto-summary.md 地雷1〜3；自動要約 v15 §7 |
| 7 | chat-core | 「RAG関連」の `verify-project-memory-*.mjs` 行（Scripts 表） | `verify-project-memory-chat-inclusion.mjs` のカタログチェックがスキップされる理由の記述なし | スキップは環境変数の問題（`SUPABASE_ACCESS_TOKEN` を設定すれば実行できる）【資料】 | chat-core.md 地雷4；チャット参照元整理 v10 §7 |

## C. 履歴行・整理候補

| # | 機能 | CLAUDE.md の該当節（行） | 現在の記述 | 実際 | 出典 |
|-|-|-|-|-|-|
| 8 | auto-summary | Scripts 表（398行） | 「差分preview Phase 1bの検証記録（2026-10-08）」の履歴行が表に混在（「これらは現行件数ではない」と注記付き） | 履歴であり表から外す余地がある。件数（423件／455件など）は現行（`npm test` 1827件ほか）と別時点【コード】 | auto-summary.md 地雷6；自動要約 v15 §6-c |

## D. 本表に含めなかったもの

- **CLAUDE.md が正しく、資料の側が古いもの**（修正対象は資料）: v15 §8 の「HEAD が `d283065` 以降」、v10 §7 の PC パス（`C:\Users\ruima`）、v111 の `lib/lore.ts` コード例、v7 §15 の `useMemo` 未実施、`matome` §8 の同記述、Pinnedキャッシュ化 v1 §1 の参照元表（10語トリガー・`rag_memory`）。
- **まだ確認できていないもの**: Opus 4.8 の `effort` パラメータ対応（APIメモその1 は CLAUDE.md に「Opus 4.8のExtended Thinking対応（将来対応）」があると書くが、現行 CLAUDE.md にその文言は無く、`lib/modelRegistry.ts` に `effort` の出現もない。モデル台帳側の扱いを要確認）。
- **inventory.md の分類変更**（6件）は、本表ではなく `inventory.md` §6-2 に記録済み。
