// lib/internalModels.ts — KabeHub内部処理専用モデル。ユーザー選択用のMODEL_REGISTRYには含めない。

/**
 * Lore検索用の固定Embeddingモデル。
 * 変更時は既存embeddingの再生成、およびベクトル次元・
 * インデックス・検索RPCとの整合確認が必要。
 */
export const LORE_EMBEDDING_MODEL = "text-embedding-3-small" as const;

/**
 * Loreの記憶抽出（batch-train）・統合案生成（consolidation/dreaming）・
 * AI発言クリーニングに使う固定LLM。
 */
export const LORE_CHAT_MODEL = "gpt-4o-mini" as const;
