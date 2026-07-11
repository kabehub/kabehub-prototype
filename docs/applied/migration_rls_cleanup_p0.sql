-- ============================================================
-- S6: RLSポリシー棚卸し（T-07）P0テーブル整理マイグレーション
-- 対象: messages / thread_notes / message_notes / thread_tags / drafts
-- 作成日: 2026-07-05
--
-- 【適用方法】
--   1. まずテスト用Supabaseプロジェクトで、STEP 1から順に1テーブルずつ実行する。
--   2. 各STEP実行後、必ずアプリの該当機能（送信・メモ・タグ・下書き・削除・
--      分岐・公開ページ閲覧など）を手動確認してから次のSTEPへ進む。
--   3. 全STEP完了・検証OKの後、本番へ同じ順序で適用する（適用前にPITR確認
--      または手動pg_dumpを取得しておくこと）。
--   4. 各STEPは冪等（drop if exists → create policy）なので、途中で失敗しても
--      同じSTEPを再実行して問題ない。
--
-- 【この整理で変わること（共通パターン）】
--   各テーブルにつき、以下の「本人用の巨大なFOR ALLポリシーが英日2本、
--   内容が微妙に違う状態で併存し、緩い方がOR合成で実効になっていた」問題を、
--   「厳格な方の条件を引き継いだ、コマンド別4本（SELECT/INSERT/UPDATE/DELETE）」
--   に置き換える。公開用SELECTポリシーが別途存在するテーブル（messages /
--   thread_tags）についても、今回は「本番の実物が想定どおりであることに依存
--   しない」方針に変更し、drop→createで正の定義をこのSQL自身に確定させる
--   （messagesは既存の厳格な条件をそのまま再作成、thread_tagsは
--   public_threads_viewの思想（tt.user_id = t.user_id）に合わせて条件を1つ追加）。
--
-- 【preflight】適用前に必ず以下を実行し、結果を保存しておくこと
--   （本番適用前のスナップショットとして docs/ に保存する運用ルールに対応）
--
--   select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('drafts','thread_notes','message_notes','thread_tags','messages')
--   order by tablename, policyname;
-- ============================================================


-- ============================================================
-- STEP 1: drafts
-- ============================================================
begin;

-- 現状（削除対象）:
--   "Users can manage own drafts" (ALL, using/with_check: auth.uid() = user_id のみ)
--   "自分の下書きのみ操作可" (ALL, with_check: 上記 + スレッド所有確認)
drop policy if exists "Users can manage own drafts" on drafts;
drop policy if exists "自分の下書きのみ操作可" on drafts;

create policy "自分の下書きのみ閲覧可"
  on drafts for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = drafts.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分の下書きのみ追加可"
  on drafts for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = drafts.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分の下書きのみ更新可"
  on drafts for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = drafts.thread_id
        and threads.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = drafts.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分の下書きのみ削除可"
  on drafts for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = drafts.thread_id
        and threads.user_id = auth.uid()
    )
  );

commit;

notify pgrst, 'reload schema';

-- 【逆適用SQL（drafts）】問題発生時はSTEP 1のcreate policy 4本をdropし、以下を実行
-- begin;
-- drop policy if exists "自分の下書きのみ閲覧可" on drafts;
-- drop policy if exists "自分の下書きのみ追加可" on drafts;
-- drop policy if exists "自分の下書きのみ更新可" on drafts;
-- drop policy if exists "自分の下書きのみ削除可" on drafts;
-- create policy "Users can manage own drafts"
--   on drafts for all
--   using (auth.uid() = user_id)
--   with check (auth.uid() = user_id);
-- create policy "自分の下書きのみ操作可"
--   on drafts for all
--   using (auth.uid() = user_id)
--   with check (
--     auth.uid() = user_id
--     and exists (select 1 from threads where threads.id = drafts.thread_id and threads.user_id = auth.uid())
--   );
-- commit;
-- notify pgrst, 'reload schema';


-- ============================================================
-- STEP 2: thread_notes
-- ============================================================
begin;

-- 現状（削除対象）:
--   "Users can manage own thread_notes" (ALL, 緩い)
--   "自分のスレッドメモのみ操作可" (ALL, 厳格＝スレッド所有確認あり)
drop policy if exists "Users can manage own thread_notes" on thread_notes;
drop policy if exists "自分のスレッドメモのみ操作可" on thread_notes;

create policy "自分のスレッドメモのみ閲覧可"
  on thread_notes for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のスレッドメモのみ追加可"
  on thread_notes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のスレッドメモのみ更新可"
  on thread_notes for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_notes.thread_id
        and threads.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のスレッドメモのみ削除可"
  on thread_notes for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

commit;

notify pgrst, 'reload schema';

-- 【逆適用SQL（thread_notes）】
-- begin;
-- drop policy if exists "自分のスレッドメモのみ閲覧可" on thread_notes;
-- drop policy if exists "自分のスレッドメモのみ追加可" on thread_notes;
-- drop policy if exists "自分のスレッドメモのみ更新可" on thread_notes;
-- drop policy if exists "自分のスレッドメモのみ削除可" on thread_notes;
-- create policy "Users can manage own thread_notes"
--   on thread_notes for all
--   using (auth.uid() = user_id)
--   with check (auth.uid() = user_id);
-- create policy "自分のスレッドメモのみ操作可"
--   on thread_notes for all
--   using (auth.uid() = user_id)
--   with check (
--     auth.uid() = user_id
--     and exists (select 1 from threads where threads.id = thread_notes.thread_id and threads.user_id = auth.uid())
--   );
-- commit;
-- notify pgrst, 'reload schema';


-- ============================================================
-- STEP 3: message_notes
-- ============================================================
begin;

-- 現状（削除対象）:
--   "Users can manage own message_notes" (ALL, 緩い)
--   "自分のメッセージメモのみ操作可" (ALL, 厳格＝スレッド所有確認あり)
drop policy if exists "Users can manage own message_notes" on message_notes;
drop policy if exists "自分のメッセージメモのみ操作可" on message_notes;

create policy "自分のメッセージメモのみ閲覧可"
  on message_notes for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = message_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のメッセージメモのみ追加可"
  on message_notes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = message_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のメッセージメモのみ更新可"
  on message_notes for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = message_notes.thread_id
        and threads.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = message_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のメッセージメモのみ削除可"
  on message_notes for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = message_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

commit;

notify pgrst, 'reload schema';

-- 【逆適用SQL（message_notes）】
-- begin;
-- drop policy if exists "自分のメッセージメモのみ閲覧可" on message_notes;
-- drop policy if exists "自分のメッセージメモのみ追加可" on message_notes;
-- drop policy if exists "自分のメッセージメモのみ更新可" on message_notes;
-- drop policy if exists "自分のメッセージメモのみ削除可" on message_notes;
-- create policy "Users can manage own message_notes"
--   on message_notes for all
--   using (auth.uid() = user_id)
--   with check (auth.uid() = user_id);
-- create policy "自分のメッセージメモのみ操作可"
--   on message_notes for all
--   using (auth.uid() = user_id)
--   with check (
--     auth.uid() = user_id
--     and exists (select 1 from threads where threads.id = message_notes.thread_id and threads.user_id = auth.uid())
--   );
-- commit;
-- notify pgrst, 'reload schema';


-- ============================================================
-- STEP 4: thread_tags
-- ============================================================
-- 注意: 公開SELECTポリシー "Tags of public threads are readable by anyone"
--       は1本のみ存在し内容自体に誤りはなかった（docs/schema.sqlの
--       「英日2本重複」記載はドキュメント側の誤記と確認済み）。
--       ただし今回、public_threads_view側の思想（tt.user_id = t.user_id、
--       ＝スレッド所有者が付けたタグのみを公開対象とする）とRLS側を
--       一貫させるため、drop→createで条件を1つ追加する（レビュー指摘対応）。
--       【要確認】この条件追加により、もし過去に所有者以外のuser_idで
--       登録されたタグ行が本番に存在した場合、それは公開閲覧から見えなく
--       なる（= public_threads_viewと同じ挙動になるだけで、後退ではない）。
--       適用後、公開ページ・explore上でタグ表示が意図せず消えていないか
--       目視確認すること。
begin;

-- 現状（削除対象）:
--   "Tags of public threads are readable by anyone" (SELECT, 公開・所有者一致条件なし)
--   "Users can manage own thread_tags" (ALL, 緩い)
--   "自分のタグのみ操作可" (ALL, 厳格＝スレッド所有確認あり)
drop policy if exists "Tags of public threads are readable by anyone" on thread_tags;
drop policy if exists "Users can manage own thread_tags" on thread_tags;
drop policy if exists "自分のタグのみ操作可" on thread_tags;

create policy "自分のタグのみ閲覧可"
  on thread_tags for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_tags.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のタグのみ追加可"
  on thread_tags for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_tags.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のタグのみ更新可"
  on thread_tags for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_tags.thread_id
        and threads.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_tags.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のタグのみ削除可"
  on thread_tags for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_tags.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "公開スレッドのタグは全員閲覧可"
  on thread_tags for select
  using (
    exists (
      select 1 from threads
      where threads.id = thread_tags.thread_id
        and threads.is_public = true
        and threads.user_id = thread_tags.user_id
    )
  );

commit;

notify pgrst, 'reload schema';

-- 【postflight（thread_tags）】公開SELECTが新条件で再作成されたことを確認
-- select policyname, cmd, qual
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'thread_tags'
-- order by policyname;
-- 期待値: "Tags of public threads are readable by anyone" は存在しない。
--         "公開スレッドのタグは全員閲覧可" が存在し、qualに
--         threads.user_id = thread_tags.user_id を含む。

-- 【逆適用SQL（thread_tags）】
-- begin;
-- drop policy if exists "自分のタグのみ閲覧可" on thread_tags;
-- drop policy if exists "自分のタグのみ追加可" on thread_tags;
-- drop policy if exists "自分のタグのみ更新可" on thread_tags;
-- drop policy if exists "自分のタグのみ削除可" on thread_tags;
-- drop policy if exists "公開スレッドのタグは全員閲覧可" on thread_tags;
-- create policy "Tags of public threads are readable by anyone"
--   on thread_tags for select
--   using (
--     exists (select 1 from threads where threads.id = thread_tags.thread_id and threads.is_public = true)
--   );
-- create policy "Users can manage own thread_tags"
--   on thread_tags for all
--   using (auth.uid() = user_id)
--   with check (auth.uid() = user_id);
-- create policy "自分のタグのみ操作可"
--   on thread_tags for all
--   using (auth.uid() = user_id)
--   with check (
--     auth.uid() = user_id
--     and exists (select 1 from threads where threads.id = thread_tags.thread_id and threads.user_id = auth.uid())
--   );
-- commit;
-- notify pgrst, 'reload schema';


-- ============================================================
-- STEP 5: messages（最重要・最優先で個別に慎重確認すること）
-- ============================================================
-- 注意: 公開SELECTポリシー "公開スレッドのメッセージは全員閲覧可"
--       （is_hidden除外・memo除外・shared_at以前のみに絞る厳格な内容）自体は
--       内容に問題なしと確認済み。ただし「本番の実物が想定どおりであること」
--       に依存せず、このマイグレーションSQL自身で正として再定義するため、
--       drop→createする（レビュー指摘対応）。
begin;

-- 現状（削除対象）:
--   "Messages of public threads are readable by anyone"
--     (SELECT, using: threads.is_public = true のみ ＝ is_hidden/memo/shared_at
--      を一切見ない、最も緩い公開SELECT。これが今回のP0直接原因)
--   "公開スレッドのメッセージは全員閲覧可" (SELECT, 厳格。内容は正しいが正として再作成)
--   "Users can manage own messages" (ALL, 緩い＝スレッド所有確認なし)
--   "自分のメッセージのみ操作可" (ALL, 厳格＝スレッド所有確認あり)
drop policy if exists "Messages of public threads are readable by anyone" on messages;
drop policy if exists "公開スレッドのメッセージは全員閲覧可" on messages;
drop policy if exists "Users can manage own messages" on messages;
drop policy if exists "自分のメッセージのみ操作可" on messages;

create policy "自分のメッセージのみ閲覧可"
  on messages for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = messages.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のメッセージのみ追加可"
  on messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = messages.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のメッセージのみ更新可"
  on messages for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = messages.thread_id
        and threads.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = messages.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のメッセージのみ削除可"
  on messages for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = messages.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "公開スレッドのメッセージは全員閲覧可"
  on messages for select
  using (
    coalesce(is_hidden, false) = false
    and provider <> 'memo'
    and exists (
      select 1 from threads
      where threads.id = messages.thread_id
        and threads.is_public = true
        and (
          threads.shared_at is null
          or messages.created_at <= threads.shared_at
        )
    )
  );

commit;

notify pgrst, 'reload schema';

-- 【postflight（messages）】緩い公開SELECTが消え、厳格な公開SELECTのみ残っていることを確認
-- select policyname, cmd, qual
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'messages'
-- order by policyname;
-- 期待値:
--   - "Messages of public threads are readable by anyone" は存在しない
--   - "公開スレッドのメッセージは全員閲覧可" が存在し、qualに
--     is_hidden / provider <> 'memo' / shared_at の3条件すべてを含む
--   - "自分のメッセージのみ閲覧可/追加可/更新可/削除可" の4本が存在する

-- 【逆適用SQL（messages）】
-- begin;
-- drop policy if exists "自分のメッセージのみ閲覧可" on messages;
-- drop policy if exists "自分のメッセージのみ追加可" on messages;
-- drop policy if exists "自分のメッセージのみ更新可" on messages;
-- drop policy if exists "自分のメッセージのみ削除可" on messages;
-- drop policy if exists "公開スレッドのメッセージは全員閲覧可" on messages;
-- create policy "Messages of public threads are readable by anyone"
--   on messages for select
--   using (
--     exists (select 1 from threads where threads.id = messages.thread_id and threads.is_public = true)
--   );
-- create policy "公開スレッドのメッセージは全員閲覧可"
--   on messages for select
--   using (
--     coalesce(is_hidden, false) = false
--     and provider <> 'memo'
--     and exists (
--       select 1 from threads
--       where threads.id = messages.thread_id
--         and threads.is_public = true
--         and (threads.shared_at is null or messages.created_at <= threads.shared_at)
--     )
--   );
-- create policy "Users can manage own messages"
--   on messages for all
--   using (auth.uid() = user_id)
--   with check (auth.uid() = user_id);
-- create policy "自分のメッセージのみ操作可"
--   on messages for all
--   using (auth.uid() = user_id)
--   with check (
--     auth.uid() = user_id
--     and exists (select 1 from threads where threads.id = messages.thread_id and threads.user_id = auth.uid())
--   );
-- commit;
-- notify pgrst, 'reload schema';


-- ============================================================
-- 適用後の確認クエリ（各STEP後にSQL Editorで実行推奨）
-- ============================================================
-- select tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = '<対象テーブル名>'
-- order by policyname;