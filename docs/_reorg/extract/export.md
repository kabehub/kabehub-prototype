# 抽出メモ: export（①-2）

作成: 2026-11-25／対象: 会話のエクスポート（TXT／MD／MD2／CSV、一括エクスポート）と、AI 回答のファイル化（リッチなダウンロード体験）。
タグ: 【資料】／【コード】（実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。
略称: APIメモ2＝APIメモその2（Claude API の「リッチなダウンロードボタン」の可否に関する相談まとめ。日付はない）。この機能の A／B 資料は APIメモ2 の1本のみ。なお、md2 のフェンス保持・B1 は rich-conversation.md に記載（CC にも既出）。

## 確定した判断

1. **API 経由で「Google ドライブのようなリッチなダウンロードボタン UI」を Claude に直接出力させる機能はない**。本家 Claude.ai の UI は、モデルが出力した Markdown テキストをフロントエンドがファイル化ボタンに変換している（Claude 自身が UI を生成しているわけではない）。したがって KabeHub で同様の体験を作るのはアプリ側の実装の問題。出典: APIメモ2「本家アプリの裏側で起きていること」。判断者: 外部 AI の回答（ChatGPT／Gemini と推測。KabeHub の決定ではない）。【資料】
2. **再現のアプローチは2案で、アプローチ A（フロントエンドだけで完結）が推奨**: A＝Claude にファイル名と本文を構造化出力（Structured Outputs、`fileName`／`fileContent`／`summaryText` のスキーマ）で分けて出力させ、`Blob` でブラウザのメモリ上に `.md` ファイル化して「ダウンロード」ボタンから保存（サーバーにファイルを保存しないのでストレージ代がかからない）。B＝Files API／Code Execution でコンテナ内にファイルを作らせ、`file_id` をキャッチして Files API または自社ストレージ経由で配布（本格派）。出典: APIメモ2「実用的な2つのアプローチ」「開発のヒント」。【資料】【未確認】（KabeHub として採用した記録は資料に無い）
3. **現行の実装範囲**: 会話エクスポートは `lib/exportUtils.ts`（`buildExportContent(format: "txt"|"md"|"md2"|"csv", …)`）と `components/ExportModal.tsx`（TXT／MD／Markdown v2（Obsidian 目次対応）／CSV）。AI 回答内のコードブロックは、言語指定が `csv`／`txt` のときだけ `Blob`＋`a.download` で保存できる（`components/MarkdownRenderer.tsx:52,64-71`、CSV は BOM 付き）。汎用のファイルカード・カード単体 DL・AI 単一回答の MD 保存専用 UI は無い（CC の記述と一致）。出典: CC、`components/ExportModal.tsx:10-25`。【コード】

## 地雷（CLAUDE.mdに載っていないもの）

1. **単一スレッドの UI エクスポートは `visibleMessages`（現在の世界線の active のみ）、設定ページの一括エクスポートは `is_active` で絞らない（JSON には `message_notes` を含む）**。分岐があるスレッドで、エクスポート対象が経路によって違う。出典: ハイライト検討 v3 §7「各種エクスポート」（highlight の資料）。【資料】【未確認】
2. **エクスポートでは出典（Web 検索の出典チップ）を載せない**: 共有ページ・copy・branch-to・フォーク・MD／CSV export・クリップボードには出典を載せず、JSON export のみ含まれる。出典: リッチ会話 v12 §8（rich-conversation.md 宿題6）。【資料】【未確認】

CLAUDE.mdに既出: 3項目（ExportModal／exportUtils の役割・md2 の先頭フェンス保持・csv／txt コードブロックの DL）。

## 未実装・宿題

1. **AI 回答のファイル化（リッチなダウンロード体験）**: APIメモ2 のアプローチ A（構造化出力＋Blob）を採用するかは未決。CC に実装予定の記載なし。`/export`（スレッド全体）とは別の機能。【資料】【未確認】
2. **カード記法の `kabe-card` と AI 回答のファイル化の役割重複**（ハイライトのリッチ化拡張でも「AI のハイライト提案とカード記法の役割重複」が論点）。出典: ハイライト検討 v3 §7。【資料】【未確認】

## 矛盾・要照合

1. **APIメモ2 の「Claude API の構造化出力（Zod スキーマ）」を前提とする記述**: KabeHub の `app/api/chat/route.ts` は構造化出力を使っていない。実装する場合は新規の設計が必要で、chat-core.md 宿題9（Claude API 機能の導入優先度）と同根。【資料】【未確認】
2. **inventory.md の分類の確認事項**: APIメモその2 は B。内容は外部 AI（Claude 以外とみられる）の回答で、KabeHub の確定事項を含まない。C 相当の可能性。直していない。【資料】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| APIメモその2.txt | B | 先頭60行（本文の大半。コード例の後半は未読） |
| CLAUDE.md・`lib/exportUtils.ts`・`components/ExportModal.tsx`・`components/MarkdownRenderer.tsx` | — | 既出判定・突合のための grep のみ |
| KabeHub_ハイライト機能_検討_引き継ぎ資料_v3.md §7 | A（highlight） | 「各種エクスポート」の1行のみ参照（highlight.md で読了） |

読めなかった A 資料: なし（この機能の A 資料はなし）。
