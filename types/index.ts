export type Provider = "claude" | "gemini" | "openai" | "image_gen";

export type ClaudeModel =
  | "claude-opus-4-8"
  | "claude-opus-4-7"
  | "claude-opus-4-6"
  | "claude-sonnet-4-5"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";
export type GeminiModel = "gemini-2.5-flash" | "gemini-2.5-pro" | "gemini-3.5-flash" | "gemini-3.1-flash-lite";
export type OpenAIModel = "gpt-4o" | "gpt-5.4-mini" | "gpt-5.4" | "gpt-5.5";
export type ImageGenModel = "gpt-image-2" | "gemini-2.5-flash-image" | "ideogram-v3" | "black-forest-labs/flux.2-pro";

export type ModelId = ClaudeModel | GeminiModel | OpenAIModel | ImageGenModel;

export interface Thread {
  id: string;
  title: string;
  created_at: string;
  updated_at?: string;
  user_id?: string;
  system_prompt?: string;
  share_token?: string;
  is_public?: boolean;
  hide_memos?: boolean;
  forked_from_id?: string | null;
  allow_prompt_fork?: boolean;
  folder_name?: string | null;
  genre?: string | null;
  // ✅ v63追加: なりきりモード
  roleplay_mode?: boolean;
  rp_char_name?: string | null;
  rp_char_icon_url?: string | null; // base64 data URL（長辺200px・JPEG圧縮済み）
  // ✅ v76追加: スナップショット型共有のPush時刻
  shared_at?: string | null;
}

export interface Message {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  provider?: "claude" | "gemini" | "openai" | "user" | "memo" | "image_gen" | "unknown";
  model_id?: string | null;
  created_at: string;
  parent_id?: string | null;
  is_hidden?: boolean;
  is_active?: boolean;
  branch_id?: string | null;
  metadata?: {
    storagePath?: string | null; // [userId]/[threadId]/[imageId].png
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
    seed?: number | null;
    image_deleted?: boolean;   // 削除済みトゥームストーンフラグ
  };
}

export interface ThreadNote {
  id: string;
  thread_id: string;
  content: string;
  created_at: string;
  updated_at?: string;
}

export interface MessageNote {
  id: string;
  message_id: string;
  thread_id: string;
  content: string;
  created_at: string;
  updated_at?: string;
}

export interface Draft {
  id: string;
  thread_id: string;
  content: string;
  created_at: string;
}

export interface ThreadTag {
  id: string;
  thread_id: string;
  name: string;
  created_at: string;
}

export interface McpToken {
  id: string;
  user_id: string;
  name?: string | null;
  created_at: string;
  last_used_at?: string | null;
}

export interface LoreMemoryCard {
  id: string;
  chunkText: string;
  tags: string[];
  memoryKind: string;
  temporalStatus: string;
  importanceScore: number;
  confidenceScore: number;
  sourceThreadId: string | null;
  sourceMessageId: string | null;
  sourceMessageNumber: number | null;
  isPinned: boolean;
  isArchived: boolean;
  extractionVersion: string | null;
  lastConfirmedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  eventTime: string | null;
  createdAt: string;
}
