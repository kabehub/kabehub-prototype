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
| migration_v125b_submit_report_function.sql | submit_report RPC新設 |
| migration_v125c_submit_report_permission_fix.sql | submit_report のEXECUTE権限をservice_role専用に変更 |
| migration_v126_find_similar_lore_pairs_liked_ai_protection.sql | liked_ai保護の追加 |
| migration_v129_dreaming_batch_multi_hardening.sql | consolidate_dreaming_batch_multi / rollback_dreaming_batch_multi の認証検証・search_path固定・EXECUTE権限限定（B-02対応） |
| migration_v130_delete_current_user_hardening.sql | delete_current_user のEXECUTE権限限定・未認証拒否ガード追加（B-02縮小適用） |
| migration_v131_storage_orphan_cleanup.sql | 孤児Storageオブジェクト候補検出RPC・実行履歴テーブル新設（B-04b／H-29対応） |
| migration_v176_dreaming_rpc_and_trigger_cleanup.sql | updated_atトリガー関数統合・consolidate_dreaming_batch/rollback_dreaming_batchの未使用オーバーロード削除（監査D対応 D-18/D-19/D-20） |
| v78_mcp_tokens_migration.sql | mcp_tokens テーブル新設 |
| v89_migration.sql | messages.model_id カラム追加 |
| v141c_migration.sql | Dreaming保護条件変更の適用手順記録（直接再実行するファイルではない） |
| v175_migration.sql | github_oauth_states への expires_at インデックス追加 |
| migration_v127_public_threads_view_security_invoker.sql | public_threads_viewへのsecurity_invoker明示（Supabase Security Advisor対応） |
| migration_v128_public_threads_projection.sql | threadsの列制限なし公開SELECT policy削除・公開データ読み取りのSECURITY DEFINER投影関数経由への統一（B-01対応） |
| migration_v177_merge_user_edited_lore_pair.sql | ユーザー手動編集Loreマージの単一トランザクションRPC化（MF-3c-DB対応） |
| migration_v178_restore_message_branch.sql | メッセージ分岐復元の単一トランザクションRPC化（MF-6a対応） |
| migration_v179_apply_branch_edit.sql | 分岐編集のアーカイブ・採番・新規user message追加の単一トランザクションRPC化（MF-6b対応） |
| migration_v180_drop_legacy_counter_rpcs.sql | 旧likesカウンターRPC（increment_likes_count / decrement_likes_count）削除（H-09対応） |
