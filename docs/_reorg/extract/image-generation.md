# 抽出メモ: image-generation（①-2）

作成: 2026-11-25／対象: 画像生成（`/image`、`/api/image-gen`、チャットへの統合、参照画像による生成（img2img）、Storage）。
タグ: 【資料】／【コード】（実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。
略称: v102＝V102差分.txt（v102 の変更サマリー。日付なし、画像生成のチャット統合）、画像入力＝画像入力対応メモ.md（img2img の調査メモ。日付なし。内容は chat-core ではなく image-generation）。この機能の A 資料はなく、B の2本のみ。**画像モデルの統合判断（`gpt-image-2.5-sunburst` への置換、`gpt-image-2` の hidden、価格）は models-and-pricing.md に載せ済みのため参照のみ**。img2img の OpenAI 非対応（400）・Gemini／Ideogram 対応は chat-core.md 矛盾1・claude-md-corrections.md #4 で訂正済み。

## 確定した判断

1. **画像生成のチャットスレッド統合（v102、Step 1〜5 完了、Step 6 は当時未着手）**: `Message` 型に `metadata`（`storagePath`・`mimeType`・`width`・`height`・`seed`・`image_deleted`）と `provider: "image_gen"` を追加。`/api/image-gen` は `threadId` があるとき、認証チェック→Supabase Storage へアップロード→DB に `image_gen` メッセージを保存→`{messageId, storagePath, imageData, mimeType}` を返す（`threadId` なしは従来どおり `{imageData, mimeType}` のみ）。`MessageBubble` に画像表示・tombstone 表示・生成中表示と「💬 Discuss with AI」ボタン。DB: `ALTER TABLE messages ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;`。出典: v102 の変更サマリー・「DB スキーマ変更」。【資料】【コード】（`app/api/album/route.ts:23` が `metadata->>image_deleted`、`app/api/chat/route.ts:1333` が `image_deleted` を参照）
2. **Storage**: バケット `generated-images`（**Private**）、パス構造 `[userId]/[threadId]/[filename].png`。RLS は INSERT／SELECT とも `auth.uid()::text = (string_to_array(name, '/'))[1]`。出典: v102「Supabase Storage 設定」。【資料】【コード】（CC の技術スタック表に `generated-images`、`lib/supabase/download-image.ts` の行あり。RLS の現行定義は `docs/storage.sql` が正本で今回未確認）
3. **`/image` コマンド仕様**: `/image 夕暮れの猫`（LocalStorage `kabehub_image_provider` のプロバイダー、未設定時は `openai`）、`/image openai|gemini|ideogram|flux …` で明示指定（`flux`＝Flux 2 Pro／OpenRouter）。出典: v102「`/image` コマンド仕様」。【資料】【コード】（`app/page.tsx:1035` が `kabehub_image_provider` を読む）
4. **Discuss with AI（画像参照）**: 画像バブルのボタンで入力欄に「🖼️ 画像を参照中」ピル（`imageContextId`）を表示、📌で固定モード（送信後もピルが残り同じ画像を参照し続ける）、×で解除。API には Storage から画像をダウンロードして base64 のマルチモーダルコンテキストとして渡し、生成時のプロンプトも `Review this image generated from prompt: "..."` として付与する。`/api/chat` は `imageContextId` を受け取り、`imageBlocksForApi` の先頭に追加。出典: v102「Discuss with AI 仕様」・変更ファイル一覧。【資料】【コード】（`app/api/chat/route.ts:1333` 付近）
5. **料金**: `lib/pricing.ts` に `ideogram-v3`・`black-forest-labs/flux.2-pro` を追加（当時）。現行は `lib/modelRegistry.ts`（models-and-pricing.md）。出典: v102。【資料】
6. **img2img（参照画像から生成）の対応状況（調査メモ）**: OpenAI（`images.edit()`、1枚）・Gemini（マルチモーダル入力、複数可）・Ideogram（`remix` エンドポイント、1枚）は対応、Flux 2 Pro は OpenRouter 経由の img2img が Sourceful 系モデル限定のため非対応。実装方針は、画像バブルに「🎨 この画像をベースに生成」ボタン、`imageRefId`（参照画像のメッセージ ID）を ChatInput に渡してピル表示、`/api/image-gen` が `imageRefId` を受けて Storage からダウンロード（`chat/route.ts` の `imageContextId` 処理を流用）し、プロバイダー別ハンドラへ渡す。Flux は `imageRefId` があるときに UI でグレーアウト、または別プロバイダーへフォールバック。出典: 画像入力「プロバイダー別 対応状況」「実装方針」「注意事項」。【資料】
7. **img2img の現行実装（コードで確認）**: `/api/image-gen` は `imageRefId`（所有者・ゴミ箱でないスレッドの message の `metadata.storagePath` を `downloadImageAsBase64` で取得、`threadId` 必須）または `imageRefUpload`（base64）を受ける。**Gemini は `inlineData` で渡す、Ideogram は `remix` に multipart で渡す（`:216-234`）、OpenAI は 400「OpenAIはimg2imgに非対応です」を返す（`:146-148`、メモの `images.edit()` は未実装）、OpenRouter（Flux）は `handleOpenRouter(req, prompt)` が `imageInput` を受け取らず、参照画像は送られない**（エラーにもならず、参照なしで通常生成される）。クライアントは台帳の `img2img` フラグで制御し（`ChatInput.tsx:799` の `isImg2imgDisabled`）、`img2img: false` のモデル（`gpt-image-2.5-sunburst`・`gpt-image-2`・`black-forest-labs/flux.2-pro`）のボタンを参照画像があるとき無効化する。`img2img: true` は `gemini-2.5-flash-image`・`ideogram-v3`・`gemini-3.1-flash-image`・`gemini-3-pro-image`。出典: コード。【コード】（`app/api/image-gen/route.ts:74-92,146-148,216-234,279,442-445`、`lib/modelRegistry.ts:201-207`）

## 地雷（CLAUDE.mdに載っていないもの）

1. **OpenRouter（Flux）は参照画像を黙って無視する**。サーバーは `imageRefId`／`imageRefUpload` を解決して `imageInput` を作るが、`handleOpenRouter` に渡さない（`case 'openrouter': handleOpenRouter(req, prompt)`）。UI の無効化（`img2img:false`）に依存しており、API を直接叩く（MCP・外部クライアント・UI の判定漏れ）と、参照画像付きなのに通常の text-to-image として生成・課金される。OpenAI は 400 を返す設計との不整合。CC に img2img の記述なし（claude-md-corrections.md #4）。出典: コード。【コード】
2. **画像生成の `threadId` あり／なしで応答・保存が変わる**: `threadId` ありは Storage アップロード＋DB 保存（`image_gen` メッセージ）、なしは Storage にも DB にも保存せず画像データだけを返す（`/image` ページ）。`imageRefId` を使うときは `threadId` が必須（なければ 400「imageRefIdを使用する場合はthreadIdが必要です」）。出典: v102、コード。【資料】【コード】（`app/api/image-gen/route.ts:334-335`）
3. **画像は Storage のパスで参照される（`metadata.storagePath`）**。`image_deleted: true` の tombstone は `/api/album` の一覧と `/api/chat` の画像コンテキストから除外される。**同じ `storagePath` を複数メッセージで共有する機能を作る場合は、ゴミ箱の `purgeThread` に参照除外が必要**（trash.md 地雷13）。出典: v102、コード。【資料】【コード】
4. **`imageContextId`（チャット中の画像参照）と `imageRefId`（img2img の参照）は別物**。前者は `/api/chat` に画像を渡して AI に見せるピル（固定モードあり）、後者は `/api/image-gen` に渡す生成の参照。UI の状態名は似ているので取り違えない。出典: v102、画像入力。【資料】

CLAUDE.mdに既出: 3項目（技術スタック表の画像生成プロバイダー・`generated-images` バケット、`lib/supabase/download-image.ts`、画像モデルの標準モデル置換時のテスト）。

## 未実装・宿題

1. **技術的負債（v102）**: `image-gen/route.ts` の sharp による WebP 圧縮対応、`MessageBubble.tsx` の画像を API Route 経由の配信にして Next.js `<Image>` のキャッシュを効かせる、Step 6（画像削除＝トゥームストーン・容量管理）完了後に ⋮ メニューの削除ボタンを有効化、設定ページに `kabehub_image_provider` の選択 UI。出典: v102「技術的負債（TODO）」。【資料】【コード】（`sharp` は `package.json` にない。tombstone は `image_deleted` として実装されている。設定ページの選択 UI は未確認）
2. **OpenAI の img2img（`/v1/images/edits`）の実装**: models-and-pricing.md 宿題3（`img2img` の有効化、`handleOpenAI` の拒否分岐の置換、UI の編集導線が必要）。出典: 画像入力、内部モデル刷新 v6 §6。【資料】【コード】
3. **Flux（OpenRouter）の img2img の扱いの確定**: 現状は参照画像を無視（地雷1）。方針は「Flux 非対応のため UI でグレーアウト、または別プロバイダーへフォールバック」（画像入力）で、サーバー側では 400 を返すか無視するかが未決。OpenRouter の img2img は Sourceful 系（`sourceful/riverflow-v2`）のみ対応という記述がある。出典: 画像入力、コード。【資料】【コード】【未確認】（OpenRouter の現行仕様は未確認）
4. **画像モデルの追加時に `lib/pricing.ts` を使う記述は古い**（現行は台帳）。【資料】

## 矛盾・要照合

1. **画像入力の「現在の `/api/image-gen/route.ts` はテキストプロンプトのみ・img2img 未実装」と現行**: 現行は `imageRefId`／`imageRefUpload` の受け付けと Gemini・Ideogram の対応が実装済み（判断7）。「OpenAI は `images.edit()` で対応」は未実装のままで、OpenAI 画像モデルは `img2img:false`。メモは全体として古い。【コード】
2. **画像入力の「`gpt-image-2`」**: 現行の標準モデルは `gpt-image-2.5-sunburst`（`gpt-image-2` は hidden）。models-and-pricing.md 判断9。【コード】
3. **v102 の「Step 6（画像削除）未着手」**: 現行は `image_deleted` の tombstone・`/api/album` の削除・Storage の孤児回収 Cron が実装済み（CC・コードで確認）。v102 は当時の記述。【コード】
4. **inventory.md の分類の確認事項**: `V102差分.txt` は B で、変更サマリーの内容は実装済み。判断としては新規性が小さい（Discuss with AI と `/image` の仕様は CC にほぼ記載なし）。②では「確定した判断」の出典として使う価値はあるが、A 資料はなく、画像生成の専用資料は存在しない。方針書 §4-1 の image-generation の出典指定も、旧フォルダには専用の設計資料がないことを示す。直していない。【資料】
5. **画像入力対応メモは §6-2 で image-generation・B に付け替え済み**（Rui 承認、2026-11-25）。【資料】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| V102差分.txt | B | 全文（4.7KB） |
| 画像入力対応メモ.md | B | 全文（3.2KB） |
| CLAUDE.md・`app/api/image-gen/route.ts`・`lib/modelRegistry.ts`・`components/ChatInput.tsx`・`app/page.tsx`・`app/api/album/route.ts`・`package.json` | — | 既出判定・突合のための grep／sed のみ |

読めなかった A 資料: なし（この機能の A 資料はない）。
