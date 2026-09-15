# KabeHub folder_name統一 Phase 3 実装報告 v1

作成日: 2026-09-15。基準コミット: `56632fb`。

実装と自動検証は完了。本番push・デプロイ前のRui氏による実機確認（Acceptance 9）は未実施。

指定の7 HTTPハンドラからlegacy名前解決・受理分岐を削除した。queryは`searchParams.has`、JSON bodyは`hasOwnProperty`でキー存在を確認して400を返す。canonicalキーとの同時指定も所有Project照会前に拒否する。統合候補・期限切れ整理は`p_project_id: null`、Dreamingは既存signatureへ`folderName: null`を明示して全体スコープを維持した。

web/mobile SidebarはProject一覧の名前だけで表示・ソートする。`legacyFolderName`・`.folder_name`参照とwebの未使用`rekeyFolderTypesAfterRename`を削除した。フォルダ移動後のローカルstate patchも`project_id`だけに変更した。DB列・DB RPC定義・MCP API・内部Dreaming signatureには差分がない。

| 検証 | 結果 | raw出力 |
| --- | --- | --- |
| `node --test scripts/*.test.cjs` | Node集計73/73、exit 0 | [root-tests.raw.log](../artifacts/phase3/root-tests.raw.log) |
| mobile `node --test tests/*.test.cjs` | 32/32、exit 0 | [mobile-tests.raw.log](../artifacts/phase3/mobile-tests.raw.log) |
| root `tsc --noEmit` | exit 0、stdout/stderrなし | [tsc-root.raw.log](../artifacts/phase3/tsc-root.raw.log)、[exit](../artifacts/phase3/tsc-root.exit.txt) |
| packages/shared `tsc --noEmit` | exit 0、stdout/stderrなし | [tsc-shared.raw.log](../artifacts/phase3/tsc-shared.raw.log)、[exit](../artifacts/phase3/tsc-shared.exit.txt) |
| mobile `tsc --noEmit` | exit 0、stdout/stderrなし | [tsc-mobile.raw.log](../artifacts/phase3/tsc-mobile.raw.log)、[exit](../artifacts/phase3/tsc-mobile.exit.txt) |
| `verify-project-memory-phase-c.mjs` | exit 0、全assert成功、test user cleanup完了 | [phase-c.raw.log](../artifacts/phase3/phase-c.raw.log) |
| `verify-project-memory-phase-d.mjs` | exit 0、全assert成功、test user cleanup完了。任意catalog POSTFLIGHTのみSKIP | [phase-d.raw.log](../artifacts/phase3/phase-d.raw.log) |
| `verify-project-memory-phase-e3.mjs` | exit 0、3ケース成功、test user cleanup完了 | [phase-e3.raw.log](../artifacts/phase3/phase-e3.raw.log) |
| Sidebar legacy grep | 0件、grep exit 1 | [sidebar-grep.raw.log](../artifacts/phase3/sidebar-grep.raw.log) |
| MCP/内部実装/DB変更禁止範囲 | diff出力0件 | [out-of-scope-diff.raw.log](../artifacts/phase3/out-of-scope-diff.raw.log) |
| `git diff --check` | exit 0 | [exit](../artifacts/phase3/diff-check.exit.txt) |

[実装・テストの生git diff](../artifacts/phase3/implementation.raw.diff)も保存した。型検査のrawログが空ファイルなのは正常終了時の実際の出力で、exitコードを別ファイルに保存している。

raw成果物はこのworkspaceの`artifacts/phase3`に保存し、コミット対象外とした。この報告内のrawリンクはローカル成果物を指す。

実DB検証は`.env.local.test.bak`のtest Supabase `jvarrlsqttfjiysaedlg`と、同じ設定のローカルNextサーバー`http://127.0.0.1:3103`を使用した。Phase Dの任意catalog検査は`PHASE_D_SUPABASE_ACCESS_TOKEN`が未設定のためSKIP。authenticated/service_roleでの新RPC実行、anon実行拒否、Project/user分離は実DBのassertで成功した。

契約テストは7ハンドラそれぞれのlegacyキー存在を400に固定している。JSON bodyは文字列・null・空文字・数値・boolean・配列・object、queryは非空値・空値・`null`/数値相当の文字列を確認する。拒否ケースはDBクエリ/RPC/embedding/Dreaming呼び出しが0件。canonicalの所有権・404・未所属への解除・一覧取得とメンテナンス全体スコープのpositive pathも維持した。`lore-dreaming-clean.test.cjs`・`lore.test.cjs`は無修正でroot全テスト内で成功した。

指示書に加えて必要だった検証修正は以下の2点。

- `project-rename-sidebar.test.cjs`は旧DB値を表示名fixtureにしていた。mount時にProject一覧を読み込むmockへ変更し、`folder_name: "Stale legacy name"`が残るthreadでもProject名をrename入力に使うことを確認する。既存の新規Project作成・解除・設定保存・renameフローのassertは維持した。
- Phase Dの③は、適用済み[v187](applied/migration_v187_project_memory_phase_e_drop_legacy_rpc.sql)で削除された旧検索RPCの成功を要求して停止した。現状に合わせて3シグネチャの`PGRST202`を必須assertに置換した。新検索RPCのpositive pathは維持し、⑪⑫ではcanonical取得200・他ユーザーProject404・legacyキー400を確認した。DB/RPC実装は変更していない。

Phase CはProject A/Bを①の前に`getProject()`で作成し、①②④をcanonical化した。②の後にlegacy PATCHの400と`project_id`不変、④の後にlegacy embedの400を追加し、③〜⑩の連鎖fixtureを維持した。E3は非空文字列と`folderName: null`の両方で400とDB/RPC 0件を確認した。

Acceptance 1は指示書のコード例と文字通りには両立しない。raw grepは15件で、400用キー存在判定7件、エラーメッセージ7件、指定された必須内部引数`folderName: null`1件だけが残る。名前解決・値受理・legacyフォールバックの参照は0件。[HTTPキーgrep全文](../artifacts/phase3/http-key-grep.raw.log)で確認できる。

本番デプロイ前にRui氏が実機で次を確認する。

- Project内スレッドのフォルダ移動、新規スレッド作成、フォルダ設定編集。
- Sidebarのフォルダ表示順。
- `/memory`のDreaming、期限切れ整理、統合候補一覧が全体スコープで従来通り動作すること。

この確認が完了するまで本番push・デプロイは保留する。
