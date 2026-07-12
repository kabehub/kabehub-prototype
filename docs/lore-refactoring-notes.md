# Lore refactoring notes

## 記憶注入3系統の現状

| 経路 | 発火条件 | 検索関数 | topK | 閾値 | 注入ブロック名 | 実行タイミング |
|---|---|---|---|---|---|---|
| ① Lore Book注入 | `loreEnabled`（フォルダの `folder_type === "novel"`）かつ `loreTargetFolder` あり かつ `openaiKey` あり | `searchLoreByEmbedding` | 3 | `match_lore_embeddings` に閾値引数なし・アプリ層から指定不可 | `lore_book` | GitHub Tool Loop前、旧Memoryとembedding共有・並列実行 |
| ② 旧Memory注入 | 正規表現 `MEMORY_TRIGGER_PATTERN`（11語）が `userContent` にマッチ | `searchLoreV2ByEmbedding` | 5 | 明示指定なし → 関数デフォルト値0.3 | `memory` | GitHub Tool Loop前、①とembedding共有・並列実行 |
| ③ rule-based RAG注入 | `RAG_TRIGGER_KEYWORDS` 配列（19語）のいずれかが `userContent` に含まれる | `searchLoreV2`（embedding内包） | 4 | 呼び出し側で明示的に `matchThreshold: 0.3` | `rag_memory` | GitHub Tool Loop**後**、①②とは独立してembeddingを再生成 |

## 要確認③: トリガー語の包含関係

`MEMORY_TRIGGER_PATTERN`（正規表現、11語）の全キーワードは、`RAG_TRIGGER_KEYWORDS`（配列、19語）に包含されている。そのため、通常の非一時チャットで②（旧Memory）の検索条件を満たした場合、③（rule-based RAG）の検索条件も必ず満たされ、**同一リクエスト内で両方の検索処理が実行される**。

検索結果がどちらにも存在する場合、類似記憶が `memory` ブロックと `rag_memory` ブロックという異なる形式で二重注入されうる。novelフォルダで②のトリガー語にも一致する発言の場合、①②③**3経路すべての検索が実行され**、各検索に結果があれば3ブロックすべてが注入されうる。

①②はembeddingを1回生成して共有し、`Promise.all` で並列実行される。一方、③はGitHub Tool Loop後に完全に独立して実行され、embeddingも別途生成される。これはS17設計判断による意図的な未統合であり、統合は別チケット扱いとして今回は変更しない。

## 先送り事項

次の4ファイルにあるローカル `clamp` の重複は、T5引き継ぎ資料でT7送りとされていたが、今回のスコープでは対象外とし、次回以降の課題とする。

```
app/api/lore/consolidate/candidates/route.ts
app/api/lore/dreaming-batch/route.ts
app/api/lore/batch-train/route.ts
lib/lore/batchTrain.ts
```
