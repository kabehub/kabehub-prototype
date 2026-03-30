export interface Thread {
  id: string;
  title: string;
  created_at: string;
  updated_at?: string;
  system_prompt?: string;
  share_token?: string;
  is_public?: boolean;
  hide_memos?: boolean;
}

export interface Message {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  provider?: "claude" | "gemini" | "openai" | "user" | "memo" | "unknown";
  created_at: string;
}

// 追加
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

