# Task13-A novel-checkモバイル移植 引き継ぎ

## 実装・静的検証

2026-08-30に以下を完了した。

- Web版novel-checkをCapacitor mobileへ移植し、認証ガード、Geminiキー読み込み、ファイル読込、NDJSONストリーミング表示、KabeHub保存処理をmobile規約へ統一。
- MarkdownRendererをmobileへ移植し、外部HTTP(S)リンクをCapacitor Browserで開く処理とCSV/TXTダウンロード処理を維持。
- novel-checkとMarkdownRendererからinline style、素のfetch、Web用 `@/` importを除去。
- `npm install`、mobile Nodeテスト32件、Next production build、postbuildを完了。
- `out/novel-check.html`の `style="` 属性は0件。
- postbuildで `FILE=out/novel-check.html ... BEFORE_RESOURCE=true ... UNCHANGED=true` を確認。

## Pixel 8エミュレータ確認

実施環境はPixel 8 AVD、Android API 37。

| 確認項目 | 結果 | 備考 |
|---|---|---|
| Capacitor sync、debug APK build/install | ✅ 合格 | `npx cap sync android`、`gradlew.bat installDebug`が成功 |
| signed-out時の認証ガード | ✅ 合格 | `novel-check.html`を直接開き、「ログインが必要です」と「ホームへ戻る」だけが存在し、dropzone・モデル・開始・結果・保存UIが存在しないことをUI階層で確認 |
| signed-in時のファイルアップロード→AIチェック→ストリーミング→保存→ホーム遷移 | ⏳ 未確認 | この検証セッションで利用可能な実SupabaseセッションとGeminiキーがないため |
| 保存後のthreads 1行＋messages 2行 | ⏳ 未確認 | 上記end-to-end試験と同時にWeb版またはDBで確認する |
| Geminiキー未設定警告 | ⏳ 未確認 | 実signed-in状態で確認する |
| CSV/TXTダウンロード | ⏳ 未確認 | 実結果にCSV/TXTコードブロックを含め、保存成功または明確な失敗を1件記録する。失敗した場合は恒久対応を別タスク化する |
| Markdown外部リンク | ⏳ 未確認 | 実結果内の `https://` リンクをタップし、Capacitor Browser起動を確認する |

## 次回の実機確認手順

1. Pixel 8 API 37で実ユーザーとしてGoogleサインインする。
2. Geminiキーを未設定のまま整合性チェック画面を開き、警告表示を確認する。
3. 設定画面で有効なGeminiキーを保存する。
4. TXTまたはMDファイルを選択し、結果が逐次表示されることを確認する。
5. 結果に `csv` または `txt` fenced code blockと `https://` リンクを含める。
6. ダウンロードボタンの結果と外部ブラウザ起動を記録する。
7. KabeHubへ保存し、ホーム遷移後にWeb版またはDBでthreads 1行、messages 2行を確認する。

保存の3リクエストはトランザクションではないため、途中失敗時に先行レコードが残る可能性は既知の制約である。
