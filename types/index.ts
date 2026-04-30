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
  provider?: "claude" | "gemini" | "openai" | "user" | "memo" | "unknown";
  created_at: string;
  parent_id?: string | null;
  is_hidden?: boolean;
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
