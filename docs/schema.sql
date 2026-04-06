-- ============================================================
-- KabeHub Database Schema
-- ============================================================
-- Supabaseのプロジェクト作成後、SQL Editorでこのファイルを実行してください。
-- ※ auth.users テーブルはSupabase Authが自動生成します。
-- ============================================================


-- ============================================================
-- 1. profiles（プロフィール）
-- ============================================================
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle      TEXT UNIQUE,
  display_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ハンドルネームは小文字のみ許可
ALTER TABLE profiles
  ADD CONSTRAINT handle_lowercase CHECK (handle = LOWER(handle));

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile"
  ON profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Public profiles are readable by anyone"
  ON profiles FOR SELECT
  USING (true);


-- ============================================================
-- 2. threads（スレッド）
-- ============================================================
CREATE TABLE threads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  system_prompt    TEXT,
  share_token      TEXT UNIQUE,
  is_public        BOOLEAN NOT NULL DEFAULT FALSE,
  hide_memos       BOOLEAN NOT NULL DEFAULT FALSE,
  folder_name      TEXT,
  forked_from_id   UUID REFERENCES threads(id) ON DELETE SET NULL,
  allow_prompt_fork BOOLEAN NOT NULL DEFAULT TRUE,
  metadata         JSONB
);

-- RLS
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own threads"
  ON threads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public threads are readable by anyone"
  ON threads FOR SELECT
  USING (is_public = TRUE);


-- ============================================================
-- 3. messages（メッセージ）
-- ============================================================
CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  provider   TEXT NOT NULL DEFAULT 'unknown',
  -- provider の値: "claude" / "gemini" / "openai" / "user" / "memo" / "unknown"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES messages(id) ON DELETE SET NULL
  -- parent_id は Branching Mode 用（現在は未使用）
);

-- RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own messages"
  ON messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Messages of public threads are readable by anyone"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM threads
      WHERE threads.id = messages.thread_id
        AND threads.is_public = TRUE
    )
  );


-- ============================================================
-- 4. thread_tags（タグ）
-- ============================================================
CREATE TABLE thread_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (CHAR_LENGTH(name) <= 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE (thread_id, name)
);

-- RLS
ALTER TABLE thread_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own thread_tags"
  ON thread_tags FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tags of public threads are readable by anyone"
  ON thread_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM threads
      WHERE threads.id = thread_tags.thread_id
        AND threads.is_public = TRUE
    )
  );


-- ============================================================
-- 5. thread_notes（スレッドメモ）
-- ============================================================
CREATE TABLE thread_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- RLS
ALTER TABLE thread_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own thread_notes"
  ON thread_notes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 6. message_notes（メッセージアンカーメモ）
-- ============================================================
CREATE TABLE message_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  thread_id  UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- RLS
ALTER TABLE message_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own message_notes"
  ON message_notes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 7. drafts（下書き）
-- ============================================================
CREATE TABLE drafts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- RLS
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own drafts"
  ON drafts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 8. インデックス（パフォーマンス最適化）
-- ============================================================
CREATE INDEX idx_threads_user_id        ON threads(user_id);
CREATE INDEX idx_threads_share_token    ON threads(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_threads_is_public      ON threads(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_messages_thread_id     ON messages(thread_id);
CREATE INDEX idx_thread_tags_thread_id  ON thread_tags(thread_id);
CREATE INDEX idx_thread_notes_thread_id ON thread_notes(thread_id);
CREATE INDEX idx_message_notes_message_id ON message_notes(message_id);
CREATE INDEX idx_drafts_thread_id       ON drafts(thread_id);


-- ============================================================
-- 9. Google OAuthログイン時にprofilesを自動作成するトリガー
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
