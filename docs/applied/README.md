# 適用済みマイグレーション

このフォルダのファイルは、すべて `docs/schema.sql` に統合済みです。
新規セルフホスト環境では実行不要です。

保管しているのは変更履歴の参照用のみです。誤って再実行しないでください。

| ファイル | 内容 |
|---|---|
| migration_rls_cleanup_p0.sql | RLSポリシー整理（messages等5テーブル） |
| migration_v119_github_oauth.sql | user_github_tokens / github_oauth_states 新設 |
| migration_v120_github_phase4.sql | folder_settings へのGitHub連携カラム追加 |
| migration_v121_expose_share_token.sql | public_threads_view に share_token 追加 |
| migration_v122_create_likes.sql | likes テーブル新設 |
| migration_v123_rpc_hardening.sql | カウンター系RPCの再集計方式への移行 |
| migration_v125_reports_thread_fk_set_null.sql | reports.thread_id のON DELETE挙動修正 |
| migration_v126_find_similar_lore_pairs_liked_ai_protection.sql | liked_ai保護の追加 |
| v78_mcp_tokens_migration.sql | mcp_tokens テーブル新設 |
| v89_migration.sql | messages.model_id カラム追加 |
| v141c_migration.sql | Dreaming保護条件変更の適用手順記録（直接再実行するファイルではない） |
| v175_migration.sql | github_oauth_states への expires_at インデックス追加 |

※ `docs/migration_v125b_submit_report_function.sql` は本番未適用のため、
　本フォルダには含まれていません。設計修正・本番適用完了後に追加予定です。
