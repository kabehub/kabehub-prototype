-- v181: AI provider request usage ledger
--
-- Preflight (run before applying):
-- select to_regclass('public.ai_usage_events') as existing_table;
-- select to_regclass('public.threads') as threads_table,
--        to_regclass('public.messages') as messages_table;
--
-- Rollback (only before application code depends on the ledger):
-- drop table if exists public.ai_usage_events;

create table if not exists public.ai_usage_events (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  thread_id                   uuid null references public.threads(id) on delete set null,
  message_id                  uuid null references public.messages(id) on delete set null,
  provider                    text not null,
  model_id                    text not null,
  request_type                text not null,
  input_tokens                integer null,
  output_tokens               integer null,
  cache_creation_input_tokens integer null,
  cache_read_input_tokens     integer null,
  cache_write_input_tokens    integer null,
  cached_input_tokens         integer null,
  image_count                 integer null,
  estimated_cost_usd          numeric null,
  cost_source                 text not null,
  status                      text not null default 'completed',
  priced_at                   timestamptz not null,
  created_at                  timestamptz not null default now()
);

create index if not exists ai_usage_events_user_priced_idx
  on public.ai_usage_events (user_id, priced_at);

create index if not exists ai_usage_events_user_model_idx
  on public.ai_usage_events (user_id, provider, model_id);

alter table public.ai_usage_events enable row level security;

drop policy if exists "自分の利用イベントのみ閲覧可" on public.ai_usage_events;
create policy "自分の利用イベントのみ閲覧可"
  on public.ai_usage_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.ai_usage_events from anon, authenticated;
grant select on table public.ai_usage_events to authenticated;

-- Postflight (run after applying):
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'ai_usage_events'
-- order by ordinal_position;
--
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public' and tablename = 'ai_usage_events'
-- order by indexname;
--
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'ai_usage_events';
--
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'ai_usage_events'
-- order by grantee, privilege_type;
