# Lore refactoring notes

## 記憶注入3系統の現状

| 経路 | 発火条件 | 検索関数 | topK | 閾値 | 注入ブロック名 | 実行タイミング |
|---|---|---|---|---|---|---|
| ① Lore Book注入 | `loreEnabled`（フォルダの `folder_type === "novel"`）かつ `loreTargetFolder` あり かつ `openaiKey` あり | `searchLoreByEmbedding` | `CHAT_LORE_SEARCH_POLICY.loreBook.topK`（3） | `match_lore_embeddings` に閾値引数なし・アプリ層から指定不可 | `lore_book` | GitHub Tool Loop前、旧Memoryとembedding共有・並列実行 |
| ② 旧Memory注入 | 正規表現 `MEMORY_TRIGGER_PATTERN`（11語）が `userContent` にマッチ | `searchLoreV2ByEmbedding` | `CHAT_LORE_SEARCH_POLICY.memory.topK`（5） | `CHAT_LORE_SEARCH_POLICY.memory.matchThreshold`（0.3）を明示指定 | `memory` | GitHub Tool Loop前、①とembedding共有・並列実行 |
| ③ rule-based RAG注入 | `RAG_TRIGGER_KEYWORDS` 配列（19語）のいずれかが `userContent` に含まれる | `searchLoreV2`（embedding内包） | `CHAT_LORE_SEARCH_POLICY.rag.topK`（4） | `CHAT_LORE_SEARCH_POLICY.rag.matchThreshold`（0.3）を明示指定 | `rag_memory` | GitHub Tool Loop**後**、①②とは独立してembeddingを再生成 |

topK・閾値・timeoutの実値は `lib/lore/types.ts` の `CHAT_LORE_SEARCH_POLICY` を正本とする（ME-4で集約済み）。本表は概念の対応関係を示す参照であり、値そのものはコード側を参照すること。

①②は `CHAT_LORE_SEARCH_POLICY.combined.timeoutMs`（3000ms）を共有し、③は独立して `CHAT_LORE_SEARCH_POLICY.rag.timeoutMs`（3000ms）を使用する。

## 要確認③: トリガー語の包含関係

`MEMORY_TRIGGER_PATTERN`（正規表現、11語）の全キーワードは、`RAG_TRIGGER_KEYWORDS`（配列、19語）に包含されている。そのため、通常の非一時チャットで②（旧Memory）の検索条件を満たした場合、③（rule-based RAG）の検索条件も必ず満たされ、**同一リクエスト内で両方の検索処理が実行される**。

検索結果がどちらにも存在する場合、類似記憶が `memory` ブロックと `rag_memory` ブロックという異なる形式で二重注入されうる。novelフォルダで②のトリガー語にも一致する発言の場合、①②③**3経路すべての検索が実行され**、各検索に結果があれば3ブロックすべてが注入されうる。

①②はembeddingを1回生成して共有し、`Promise.all` で並列実行される。一方、③はGitHub Tool Loop後に完全に独立して実行され、embeddingも別途生成される。これはS17設計判断による意図的な未統合であり、統合は別チケット扱いとして今回は変更しない。
