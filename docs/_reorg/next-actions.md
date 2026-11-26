# 再編作業の次アクション・確認メモ

作成: 2026-11-26／再編作業（`docs/_reorg/`）の途中経過。②（Codex による docs 作成）を始める前後の確認用。
**公開リポジトリのため、実値（project ref・鍵・UUID・メール）は書かない。**

## 1. 2026-11-26 までに完了したこと

- ①抽出メモ B1〜B10 完了（`docs/_reorg/extract/` に全テーマ）。訂正候補は `claude-md-corrections.md` の #1〜#72。
- B8〜B10 のコミット: `7e159cb`（B8）、`1940093`（B9）、`a3b19fe`（B10＋inventory の project ref 置換）。
- ゴミ箱 Cron を実削除へ切替（2026-11-26）: Vercel の Production に `THREAD_TRASH_PURGE_DRY_RUN=false`（Config 型）を追加し再デプロイ。
  - 切替前の状態: 未設定のため dry-run のまま。7日超のゴミ箱スレッドが2件（テスト用）残っていた（Rui が削除を承認）。

## 2. 翌日の確認（2026-11-27 02:00 JST の Cron 実行後）

Cron は `0 17 * * *`（UTC）＝ 02:00 JST。Hobby の runtime logs は保持1時間のため、ログでなく DB の結果で確認する。

本番 DB（SQL Editor）で:

```sql
select count(*)
from threads
where deleted_at is not null
  and deleted_at < now() - interval '7 days';
```

| 結果 | 判断 |
|-|-|
| 0 | 成功。実削除が動いている。`status.md` に「ゴミ箱 Cron 実削除へ切替済み（2026-11-26）」を記録 |
| 2 のまま | 失敗。次を順に確認: ①Vercel の `THREAD_TRASH_PURGE_DRY_RUN` が Production で `false`（完全一致）か ②再デプロイが本番に反映済みか ③`CRON_SECRET` と Cron の登録状態 ④`/api/cron/thread-trash-purge` が proxy 除外に入っているか |

補足: 1回の処理は最大50件。Storage の削除失敗はログに warn が出るだけで HTTP 200（DB 側は削除済み）。

## 3. 次の作業（②への準備）

1. `docs/` の最終構成と、各ファイルを担当する抽出メモの対応表を作る（方針書 v2 §3 をベースに）。
2. Codex への指示書を機能単位に分割して設計する。共通ルール: 本番 project ref・管理者UUID・トークン・個人メールを書かない／総括の付録 A は書き写さない／`internal/` の内容は参照しない／runbook の置換規則（`claude-md-corrections.md` #72）。
3. `status.md` の様式を決める（日付つき項目は「次に確認する日」を列に持たせる）。
4. ③: Claude による検査（コード・旧資料との突き合わせ）。

## 4. 判断待ち・未着手

- `.claude/settings.local.json` の追跡解除（中身を確認してから `git rm --cached`）。
- `apps/mobile-shell-poc`（59ファイル追跡）の削除かアーカイブ。
- プライバシーポリシーへの「ゴミ箱7日保持」の追記（公開前の課題として backlog へ）。
- `NEXT_PUBLIC_SITE_URL`（コードが参照）と `NEXT_PUBLIC_APP_URL`（Vercel にあるがコード参照なし）の食い違いの確認。
- `STORAGE_CLEANUP_DRY_RUN` の本番モード確認（`/admin/storage-cleanup` の実行履歴の mode 欄）。
- BL3 §5 の優先順位への Rui の承認（未受領。承認なしなら「提案順」と明記して載せる）。
- 本番 `messages` の RLS 確認（read-only の `pg_policies` 照会が先）、`profiles` の SELECT ポリシー（S-8）の本番状態。

## 5. 日付つき項目

| 日付 | 項目 |
|-|-|
| 2026-11-27（Cron 実行後） | 上記 §2 のゴミ箱 Cron 確認 |
| 2026-12-01 00:00 UTC | Gemini 4 Argon の料金切替（コード変更不要。12/2 に `ai_usage_events` で金額が約2倍か確認） |
| 2027-01-01 | Gemini 3.6／3.7／3.8 Flash の導入価格終了。`gemini-3.8-flash` の `novelCheck.estimatedInputPerMTok`（0.75→1.50）を手動更新 |
| Android 公開前 | Capacitor 8.5.1 以上へ更新（脆弱性2件）、release 署名鍵の方針決定 |
