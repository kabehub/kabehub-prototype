create or replace view public_threads_view as
select
  t.id,
  t.title,
  t.is_public,
  t.created_at,
  t.updated_at,
  t.user_id,
  t.genre,
  coalesce(
    array_agg(tt.name order by tt.created_at) filter (where tt.name is not null),
    '{}'::text[]
  ) as tags,
  t.share_token
from threads t
left join thread_tags tt
  on tt.thread_id = t.id
 and tt.user_id = t.user_id
where t.is_public = true
group by
  t.id, t.title, t.is_public, t.created_at, t.updated_at, t.user_id, t.genre, t.share_token;

grant select on public_threads_view to anon, authenticated;
