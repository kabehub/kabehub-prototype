# Lore refactoring notes

## チャット検索の現行2経路（2026-10-04）

検索計画は import ゼロの純関数 lib/lore/chat-search-plan.ts の buildChatLoreSearchPlan に集約する。メモモードは route が検索計画前に early return する独立した不変条件であり、計画の入力に含めない。

| 経路 | 発火条件 | 検索関数 | topK | 閾値 | 注入ブロック名 | 実行タイミング |
|---|---|---|---|---|---|---|
| ① Lore Book | loreEnabled（novel）かつ hasOpenaiKey かつ loreTargetProjectId あり | searchLoreByEmbeddingForProject | 3 | match_lore_embeddings_by_project に閾値引数なし | lore_book | GitHub Tool Loop前、②とembedding共有・並列 |
| ② Memory | 非temporaryかつ hasOpenaiKey かつ userContent が19語のいずれかを含む | searchLoreV2ByEmbeddingForProject | 5 | 0.3 | memory | GitHub Tool Loop前、①とembedding共有・並列 |

topK・閾値・timeoutの正本は lib/lore/types.ts の CHAT_LORE_SEARCH_POLICY。①②は combined.timeoutMs（3,000ms）を共有し、embedQuery を1回実行後、Promise.all で検索する。Lore Bookの計画条件自体にtemporaryは含めないが、routeはtemporaryではproject設定を取得せずloreEnabledを有効化しない。Memoryは未分類スレッドでもprojectId nullで検索できる。

## トリガー包含・二重注入・S17未統合：解消済み（2026-10-04）

旧Memoryの11語は旧RAGの19語に包含されていた。旧Memoryと末尾RAGは同一query・project・閾値0.3で同じRPCを二重実行し、embeddingも再生成、memory / rag_memoryの2形式で二重注入しうる状態だった。S17設計判断による意図的な未統合は今回解消した。

19語は追加・削除せず CHAT_MEMORY_TRIGGER_KEYWORDS に移した。末尾RAGと専用検索関数・policy・rag_memoryソースを廃止し、旧RAGだけで発火した語もMemoryを検索する。memoryLinesの整形とbuildReferenceBlock("memory", ...)による注入形式は維持する。

embedding入力のuserContentの扱いは変更していない。添付本文が検索クエリに混ざる件は未解決（B2-2）。
