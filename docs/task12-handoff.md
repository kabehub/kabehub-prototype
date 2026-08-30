# Task12 次回セッション引き継ぎ

## モバイル版公開リリース前の必須確認事項

- ~~利用規約 `apps/mobile/app/terms/page.tsx` 第6条が、モバイル版のBYOK APIキー取扱いと公開時点の実装に整合しているか、法務・プロダクト責任者を含めて必ず確認する。~~
- ~~Task12では第6条の文言を変更していない。この確認はTask12のPR作成・mergeをブロックしないが、モバイル版の公開リリース前には完了が必須である。~~
- **2026-08-30 対応済み**：`app/terms/page.tsx`・`app/privacy/page.tsx`・`apps/mobile/app/terms/page.tsx`・`apps/mobile/app/privacy/page.tsx`の4ファイルを改訂し、APIキー保存方式の記載をSecure Storage実装（Task12）と整合させた（コミット`f82dae1`）。Web/Mobile対応ペアの本文一致は`git diff --no-index`で確認済み。

## 実機で完了させる確認

2026-08-27時点では`adb devices -l`に接続端末がなく、以下は未実施。Nodeテスト30件、TypeScript検査、Next build/postbuild、Capacitor sync、Android `:app:assembleDebug`、merged manifestと両Backup XMLの静的確認までは成功している。

Pixel 8エミュレータ（API 37）で次を確認し、結果と実行日時をこの文書またはリリースチェックリストへ記録する。

- 5プロバイダーの保存、アプリ再起動後の復元、保存済みキーを空欄へ編集して保存した場合の削除。
- signed-in状態でClaudeキーを使った`/api/chat`応答と、signed-out状態でテストボタンが表示されないこと。
- canary値がlogcatへ出力されないこと。
- merged manifestと両BackupルールXMLが`WSSecureStorageSharedPreferences.xml`を除外していること。
- `bmgr backupnow com.kabehub.app`がエラーなく完走すること。
- Auto Backup除外後もSupabaseのサインイン・サインアウト・トークンリフレッシュが正常であること。


### 実機確認結果（2026-08-30実施、Pixel 8エミュレータ API 37）

| No. | 確認項目 | 結果 | 手段 |
|---|---|---|---|
| 1 | 5プロバイダー保存→再起動後の復元 | ✅ 合格 | `/settings`で5欄入力→`am force-stop`→再起動→復元確認 |
| 2 | 誤削除防止（空欄保存による削除） | ✅ 合格 | Geminiのみ空欄で保存→再起動→Geminiのみ未設定、他4件保持を確認 |
| 3 | signed-in疎通／signed-out非表示 | ✅ 合格 | signed-outでテストボタン非表示確認→signed-inでClaudeキー保存→`/api/chat`が200＋AI応答本文を確認 |
| 4 | logcat canary非出力 | ✅ 合格 | `pm clear`後にcanary値`CANARY-TASK12-8f2c91ab`を保存、logcat記録2283行中に非検出（`Select-String`で0件） |
| 5 | merged manifest／両Backup XML除外確認 | ✅ 合格 | `app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml`で`allowBackup`/`dataExtractionRules`/`fullBackupContent`の3属性が維持されていることを確認。`backup_rules.xml`・`data_extraction_rules.xml`双方で`WSSecureStorageSharedPreferences.xml`除外を確認 |
| 6 | `bmgr backupnow`完走 | ✅ 合格 | localtransport切替→`bmgr enable true`→`bmgr backupnow com.kabehub.app`が`Backup finished with result: Success` |
| 7 | Auto Backup除外後のSupabase認証動作 | ✅ 合格 | 再起動後のセッション保持、`pm clear`による強制サインアウト→再サインイン正常動作を確認。※トークンリフレッシュの長時間運用での自動更新は今回未検証、次回時間を空けての再確認が望ましい |

全7項目合格。Task12実機確認事項を正式クローズ。