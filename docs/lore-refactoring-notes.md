# Lore refactoring notes

## チャット検索の現行2経路（2026-10-04）

検索計画は import ゼロの純関数 lib/lore/chat-search-plan.ts の buildChatLoreSearchPlan に集約する。メモモードは route が検索計画前に early return する独立した不変条件であり、計画の入力に含めない。

| 経路 | 発火条件 | 検索関数 | topK | 閾値 | 注入ブロック名 | 実行タイミング |
|---|---|---|---|---|---|---|
| ① Lore Book | loreEnabled（novel）かつ hasOpenaiKey かつ loreTargetProjectId あり | searchLoreByEmbeddingForProject | 3 | match_lore_embeddings_by_project に閾値引数なし | lore_book | GitHub Tool Loop前、②とqueryが同一ならembedding共有、異なれば独立・並列 |
| ② Memory | 非temporaryかつ hasOpenaiKey かつ triggerText が19語のいずれかを含む | searchLoreV2ByEmbeddingForProject | 5 | 0.3 | memory | GitHub Tool Loop前、①とqueryが同一ならembedding共有、異なれば独立・並列 |

topK・閾値・timeoutの正本は lib/lore/types.ts の CHAT_LORE_SEARCH_POLICY。①②は combined.timeoutMs（3,000ms）を共有し、queryが同一ならembedQueryを1回共有し、異なるなら2回を並列生成後、Promise.allで検索する。一方のembeddingがnullでも成功側は検索・注入を継続する。Lore Bookの計画条件自体にtemporaryは含めないが、routeはtemporaryではproject設定を取得せずloreEnabledを有効化しない。Memoryは未分類スレッドでもprojectId nullで検索できる。

## トリガー包含・二重注入・S17未統合：解消済み（2026-10-04）

旧Memoryの11語は旧RAGの19語に包含されていた。旧Memoryと末尾RAGは同一query・project・閾値0.3で同じRPCを二重実行し、embeddingも再生成、memory / rag_memoryの2形式で二重注入しうる状態だった。S17設計判断による意図的な未統合は今回解消した。

19語は追加・削除せず CHAT_MEMORY_TRIGGER_KEYWORDS に移した。末尾RAGと専用検索関数・policy・rag_memoryソースを廃止し、旧RAGだけで発火した語もMemoryを検索する。memoryLinesの整形とbuildReferenceBlock("memory", ...)による注入形式は維持する。

## 添付本文の検索クエリ混入：通常Web送信で解消済み（B2-2、2026-10-04）

通常Web送信は添付結合前の手入力をoptional queryTextとしてtrimせず別送する。triggerTextはqueryText（空文字も保持）、未指定・文字列以外はuserContent全文へフォールバックし、Memoryの発火判定に使う。memoryQueryはtriggerTextの先頭、loreBookQueryは最終userContentの先頭を使う（添付本文を必ず検索するものではない）。各queryは2,000コードポイントで切り詰め、サロゲートペアを壊さない。この上限はOpenAIの限界値ではなくKabeHub独自の保守的上限であり、正本はCHAT_LORE_SEARCH_POLICY.query.maxCodePoints。

novel＋トリガー語＋添付ありなどqueryが異なる場合はembeddingが2回生成されうる。同一queryなら1回を共有する。queryTextは検索専用で、保存本文・system・ログには追加しない。再生成・分岐編集・旧クライアント・mobileなどqueryTextのない経路は、添付込み全文でMemoryのトリガーを判定する後方互換の制限が残る。
