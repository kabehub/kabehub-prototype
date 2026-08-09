# MH-5b DB確認記録（2026-08-09）

対象環境: production
実施チケット: MH-5b（H-10・H-11）
原則: read-only確認のみ。DB変更なし。

## H-10：messages RLSポリシーの現況確認

実行SQL:

```sql
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'messages'
order by policyname;
```

結果（2件）:

| policyname | cmd | roles | qual |
|---|---|---|---|
| 公開スレッドのメッセージは全員閲覧可 | SELECT | {public} | (COALESCE(is_hidden, false) = false) AND (provider <> 'memo'::text) AND is_visible_public_message(thread_id, created_at) |
| 自分のメッセージのみ操作可 | ALL | {public} | auth.uid() = user_id |

解釈: 2026-07-10に削除した旧ポリシー2本（"Messages of public threads are readable by anyone" / "Users can manage own messages"）は存在しない。同等の緩いポリシーの再混入もなし。なお、production の実際の構成（単一ALL）は docs/schema.sql が定義するcanonical形（コマンド別4本＋公開SELECT1本）とは異なるが、これはB-01のpreflight時（2026-07-19）に既に発見・記録済みの環境差異であり、H-10の懸念事項とは無関係。

Disposition: 混入経路は当時のログが残っておらず特定不能。追加調査は行わない。再発検知機構はMH-5bでは導入しない。**クローズ。**

## H-11：thread_tags所有者不一致行の確認

実行SQL:

```sql
select tt.id, tt.thread_id, tt.user_id, t.user_id as thread_owner_id
from thread_tags tt
join threads t on t.id = tt.thread_id
where t.is_public = true
  and tt.user_id <> t.user_id;
```

結果: 0件（該当行なし）

解釈: migration_rls_cleanup_p0.sqlのSTEP4（thread_tags）が懸念していた「所有者不一致タグ行が公開表示から消える」というデータ状態は、production上に実害として存在しなかったことを確認した。当時要求されていた目視確認事項は、このデータ確認をもってクローズする。UI全体の表示確認をDB照会で代替したという主張ではない。

Disposition: **クローズ。**
