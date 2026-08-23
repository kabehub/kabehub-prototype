export interface Message {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  provider?: "claude" | "gemini" | "openai" | "user" | "memo" | "image_gen" | "unknown";
  model_id?: string | null;
  created_at: string;
  message_number?: number | null;
  parent_id?: string | null;
  is_hidden?: boolean;
  is_active?: boolean;
  branch_id?: string | null;
  branch_root_id?: string | null; // v131追加
  branch_index?: number | null;   // v131追加
  // is_learned / skip_learning / input_tokens / output_tokens はDB・サーバー処理専用のため意図的にこの型から除外
  metadata?: {
    storagePath?: string | null; // [userId]/[threadId]/[imageId].png
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
    seed?: number | null;
    image_deleted?: boolean;   // 削除済みトゥームストーンフラグ
  };
}
