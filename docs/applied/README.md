# 適用済みマイグレーション

このフォルダに含まれるスキーマ変更は、すべて `docs/schema.sql` に統合済みです。
データbackfillなど、`docs/schema.sql`への統合対象がない適用履歴も保管しています。
新規セルフホスト環境では個別に実行する必要はありません。

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
| migration_v181_ai_usage_events.sql | AI利用コスト計測基盤（ai_usage_eventsテーブル新設・provider横断のusage/コスト記録） |
| migration_v182_project_memory_phase_a.sql | Project Memory Manager Phase A（projects／project_memory_topics／project_memory_revisions新設・既存3テーブルへのproject_id追加・cross-user紐付け防止RLS） |
| migration_v183_project_memory_phase_b_backfill.sql | Project Memory Manager Phase B（既存4テーブルのfolder_nameからprojectsを作成・既存3テーブルのproject_idをbackfill） |
| migration_v184_project_memory_topic_rpcs.sql | Project Memory Topic RPC新設（create/update、SECURITY DEFINER、EXECUTE権限authenticated限定）。test環境・本番環境ともに適用済み（コミットdeb2d77、DDL・RPC本体） |
| migration_v185_get_or_create_project.sql | Project Memory Manager Phase C（get_or_create_project RPC新設、Dreaming／ユーザー編集Lore統合でproject_id伝播）。test環境へ適用し、Phase C検証スクリプトで確認するためのmigration |
| migration_v186_project_memory_phase_d_read_path.sql | Project Memory Manager Phase D（既存folder_name版を保持したままproject_id版のLore検索RPCを追加し、read pathを移行） |
| migration_v187_project_memory_phase_e_drop_legacy_rpc.sql | Project Memory Manager Phase E-1（project_id版へのread path移行後に未使用となったfolder_name版Lore検索RPC 3本を削除） |
| migration_v188_project_memory_phase_e_find_similar_lore_pairs_by_project.sql | Project Memory Manager Phase E-2（旧RPCを維持したままproject_id版の類似Loreペア検索RPC 2本を追加） |
| migration_v189_project_memory_phase_e_merge_project_guard.sql | Project Memory Manager Phase E-2（merge_user_edited_lore_pairへproject_id一致ガードを追加） |
| migration_v190_project_memory_phase_e_drop_legacy_find_similar.sql | Project Memory Manager Phase E-2（project_id版への切り替え後に旧folder_name版の類似Loreペア検索RPC 2本を削除） |
| migration_v191_project_memory_phase_e_update_temporal_status_by_project.sql | Project Memory Manager Phase E-3（旧RPCを維持したままproject_id版のLore時系列ステータス更新RPCを追加） |
| migration_v192_project_memory_phase_e_drop_legacy_temporal_status.sql | Project Memory Manager Phase E-3（project_id版への切り替え後に旧folder_name版のLore時系列ステータス更新RPCを削除） |
| migration_v193_folder_settings_to_project_settings.sql | folder_settingsをproject_settingsへフルリネーム（テーブル・制約・インデックス・RLSポリシー・トリガー） |
| migration_v194_delete_project_preserving_contents.sql | Project物理削除（関連コンテンツ保持・Project Memory任意Lore昇格） |
| migration_v195_rename_project.sql | Project名変更RPC（所有権検証・行ロック・関連4テーブルのfolder_name同期・authenticated限定実行） |
| migration_v196_project_settings_project_id_contract.sql | project_settingsのcanonical write keyを(user_id, project_id)へ移行する制約変更（UNIQUE制約追加・folder_nameのNOT NULL解除） |
| migration_v197_project_memory_dreaming_by_project.sql | Project Memory Manager Phase 5A（Dreaming/Merge RPCのproject_id専用版3本を追加） |
| migration_v198_project_memory_dreaming_final.sql | Project Memory Manager Phase 5C依存除去（Dreaming/Merge・Project rename/delete RPCをlore_embeddings.folder_name非依存の最終形へ更新） |
| migration_v199_lore_embeddings_folder_name_drop.sql | Project Memory Manager Phase 5C Contract（旧Dreaming/Merge RPC 3本・旧index・lore_embeddings.folder_name列を削除） |
| migration_v200_project_memory_topic_promotion.sql | Project Memory Manager Phase 6（topicの通常時Lore昇格RPC新設・revision単位idempotency/supersede・Lore Book検索match_lore_embeddings_by_projectのarchive/supersede除外bug fix） |
| migration_v201_delete_project_promotion_delegation.sql | Project Memory Manager Phase 3（Project削除時のLore昇格処理をpromote_project_memory_topic_to_lore（v200）へ委譲。source_revision付きmetadata・idempotency・supersedeを削除経路にも統合、v200存在確認のfail-closed preflight追加） |
| migration_v202_project_memory_promotion_confirmation.sql | 手動編集済みLoreの再昇格確認（acknowledged ID配列・置き換え対象のロック・Project削除の4引数呼び出し互換を維持） |
| migration_v203_project_memory_promotion_restore.sql | 同revisionの手動アーカイブ済み昇格Loreの復元RPC新設（本文・embeddingを保持・superseded/他active行の競合を拒否） |
| migration_v204_project_memory_chat_inclusion.sql | Project Memory topicのチャット包含opt-in（include_in_chat列・revisionを進めない専用RPC・ON時点の合計8,000字契約） |
| migration_v205_delete_project_memory_topics.sql | Project Memory topicの一括削除（最大50件・所有確認とrevision CASによる全か無か・revision履歴はCASCADE削除・昇格済みLoreは保持） |
