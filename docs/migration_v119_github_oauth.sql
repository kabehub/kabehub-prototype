-- v119: GitHub OAuth トークン保存テーブル
CREATE TABLE IF NOT EXISTS user_github_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  token_type   text NOT NULL DEFAULT 'bearer',
  scope        text,
  github_login text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_github_tokens ENABLE ROW LEVEL SECURITY;
-- ポリシーは設けない（serviceRole経由のみ許可・クライアントからの全操作を拒否）

-- OAuth CSRF対策用 stateテーブル
CREATE TABLE IF NOT EXISTS github_oauth_states (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state      text NOT NULL UNIQUE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE github_oauth_states ENABLE ROW LEVEL SECURITY;
-- ポリシーなし（serviceRole経由のみ許可）
