create index if not exists idx_github_oauth_states_expires_at
  on github_oauth_states(expires_at);
