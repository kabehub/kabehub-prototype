# KabeHub `folder_name`統一 Phase 5C 実装ログ

実施日: 2026-09-16

## 現在の状態

- v198/v199 SQL、canonical schema、関連テスト、Phase 5C verifierの実装は完了。
- test/production DBへのv198/v199適用・検証は完了。
- 初回のtest適用試行ではManagement APIがSQL実行前にHTTP 401 Unauthorizedを返し、DB変更は発生しなかった。その後、有効な接続手段で指定順序どおりの適用・検証が完了した。

## 実装済み

- `migration_v198_project_memory_dreaming_final.sql`
  - 新3RPCのsignature・戻り値・ロック順序・保護条件・tags集約・エラーを維持。
  - `v_folder_name`解決だけを除去し、3RPCすべてのproject ownership guardを`perform 1`で維持。
  - `rename_project`からLore同期だけを除去。
  - `delete_project_preserving_contents`のLore INSERT/UPDATEから旧列だけを除去し、threads側処理は維持。
- `migration_v199_lore_embeddings_folder_name_drop.sql`
  - `to_regprocedure`による旧3RPCのfail-closed preflightを追加。
  - 完全signature・CASCADEなしで旧3RPCをDROP。
  - schema-qualified、CASCADEなしで旧index・列をDROP。
- `schema.sql`をv198/v199の最終状態へ更新。
- Phase 5C verifier、migration契約テスト、既存テスト更新、historical-only注記を追加。

## 完了した検証

```text
node scripts/lore.test.cjs                                      PASS (22)
node scripts/lore-dreaming-clean.test.cjs                       PASS (4)
node scripts/project-rename-migration.test.cjs                  PASS
node scripts/project-memory-phase-5c-migrations.test.cjs        PASS
node scripts/verify-project-delete.mjs                          PASS (8 scenarios, cleanup complete)
node --test                                                     PASS (107/107)
npx tsc --noEmit --incremental false                            PASS
npx tsc -p packages/shared/tsconfig.json --noEmit               PASS
node scripts/verify-project-memory-phase-5c.mjs --print-postflight PASS
git diff --check                                                PASS
```

スコープ確認は期待14ファイルと実変更14ファイルを`git diff --no-index`で比較し、exit 0・差分ログ0 bytesだった。生ログは`artifacts/phase5c/git-status.raw.log`、`artifacts/phase5c/out-of-scope-diff.raw.log`、exit記録は`artifacts/phase5c/out-of-scope-diff.exit.txt`。

`verify-project-delete.mjs`は更新後スクリプトが完走し、v199適用後を含むtest/production検証も完了している。

## 完了したDB適用順序

1. testへv198を適用。
2. v198の新3RPC定義・ownership guard、旧3RPC/列/indexの存続を確認。
3. testへv199を適用。
4. `node scripts/verify-project-memory-phase-5c.mjs`を実行。
5. productionへv198を適用し、成功を確認。
6. productionへv199を連続適用。
7. production用env/refを明示して`node scripts/verify-project-memory-phase-5c.mjs --postflight-only`を実行。

productionへfixtureを作る検証は実行しない。
