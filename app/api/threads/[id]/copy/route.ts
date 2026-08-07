import { NextRequest } from 'next/server'
import { requireRouteUser } from '@/lib/supabase/route-auth'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req)
  if (!auth.ok) return auth.response
  const { user, supabase, finalizeJson } = auth

  const sourceThreadId = params.id

  // このAPIは本人所有スレッド専用。公開スレッドの複製は /api/share/[token]/fork を使うこと
  const { data: sourceThread, error: threadError } = await supabase
    .from('threads')
    .select('*')
    .eq('id', sourceThreadId)
    .eq('user_id', user.id)
    .single()

  if (threadError || !sourceThread) {
    return finalizeJson({ error: 'Thread not found' }, { status: 404 })
  }

  // コピー元メッセージの取得
  const { data: sourceMessages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('thread_id', sourceThreadId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (messagesError) {
    return finalizeJson({ error: 'Failed to fetch messages' }, { status: 500 })
  }

  // 新スレッドの作成
  const { data: newThread, error: newThreadError } = await supabase
    .from('threads')
    .insert({
      title: `${sourceThread.title}（コピー）`,
      user_id: user.id,
      system_prompt: sourceThread.system_prompt,
      forked_from_id: sourceThreadId,
      roleplay_mode: false,
      rp_char_name: null,
      rp_char_icon_url: null,
    })
    .select()
    .single()

  if (newThreadError || !newThread) {
    return finalizeJson({ error: 'Failed to create thread' }, { status: 500 })
  }

  // メッセージの一括コピー
  if (sourceMessages && sourceMessages.length > 0) {
    const newMessages = sourceMessages.map(({ id, thread_id, created_at, metadata, ...rest }) => ({
      ...rest,
      thread_id: newThread.id,
      user_id: user.id,
      parent_id: null,
      metadata: {
        copied_from_message_id: id,
        copied_from_thread_id: sourceThreadId,
        copied_by: 'copy',
        ...(rest.provider === 'image_gen' ? { image_deleted: true } : {}),
      },
    }))

    const { error: insertError } = await supabase
      .from('messages')
      .insert(newMessages)

    if (insertError) {
      console.error('[db-insert-failed]', {
        route: 'threads-copy',
        operation: 'insert-copied-messages',
        table: 'messages',
        errorCode: insertError.code,
      })
      // スレッドだけ作成されてメッセージが入らない中途半端な状態を防ぐ
      const { error: compensationError } = await supabase
        .from('threads')
        .delete()
        .eq('id', newThread.id)
      if (compensationError) {
        console.error('[db-compensation-failed]', {
          route: 'threads-copy',
          operation: 'delete-created-thread',
          table: 'threads',
          errorCode: compensationError.code,
        })
      }
      return finalizeJson({ error: 'Failed to copy messages' }, { status: 500 })
    }
  }

  return finalizeJson({ thread: newThread })
}
