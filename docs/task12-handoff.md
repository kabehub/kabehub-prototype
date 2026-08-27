# Task12 次回セッション引き継ぎ

## モバイル版公開リリース前の必須確認事項

- 利用規約 `apps/mobile/app/terms/page.tsx` 第6条が、モバイル版のBYOK APIキー取扱いと公開時点の実装に整合しているか、法務・プロダクト責任者を含めて必ず確認する。
- Task12では第6条の文言を変更していない。この確認はTask12のPR作成・mergeをブロックしないが、モバイル版の公開リリース前には完了が必須である。

## 実機で完了させる確認

2026-08-27時点では`adb devices -l`に接続端末がなく、以下は未実施。Nodeテスト30件、TypeScript検査、Next build/postbuild、Capacitor sync、Android `:app:assembleDebug`、merged manifestと両Backup XMLの静的確認までは成功している。

Pixel 8エミュレータ（API 37）で次を確認し、結果と実行日時をこの文書またはリリースチェックリストへ記録する。

- 5プロバイダーの保存、アプリ再起動後の復元、保存済みキーを空欄へ編集して保存した場合の削除。
- signed-in状態でClaudeキーを使った`/api/chat`応答と、signed-out状態でテストボタンが表示されないこと。
- canary値がlogcatへ出力されないこと。
- merged manifestと両BackupルールXMLが`WSSecureStorageSharedPreferences.xml`を除外していること。
- `bmgr backupnow com.kabehub.app`がエラーなく完走すること。
- Auto Backup除外後もSupabaseのサインイン・サインアウト・トークンリフレッシュが正常であること。
