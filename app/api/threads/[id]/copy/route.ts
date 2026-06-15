import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerSupabaseClient(req, new NextResponse())
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sourceThreadId = params.id

    // コピー元スレッドの取得（自分のデータのみ・RLSで保護済み）
    const { data: sourceThread, error: threadError } = await supabase
      .from('threads')
      .select('*')
      .eq('id', sourceThreadId)
      .single()

    if (threadError || !sourceThread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // コピー元メッセージの取得
    const { data: sourceMessages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', sourceThreadId)
      .order('created_at', { ascending: true })

    if (messagesError) {
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
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
      return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 })
    }

    // メッセージの一括コピー
    if (sourceMessages && sourceMessages.length > 0) {
      let newMessages
      try {
        newMessages = sourceMessages.map(({ id, thread_id, created_at, ...rest }) => ({
          ...rest,
          thread_id: newThread.id,
          user_id: user.id,
          parent_id: null,
        }))
      } catch (e) {
        console.error('copy build newMessages error:', e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : '')
        await supabase.from('threads').delete().eq('id', newThread.id)
        return NextResponse.json({ error: 'Failed to build messages', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
      }

      const { error: insertError } = await supabase
        .from('messages')
        .insert(newMessages)

      if (insertError) {
        console.error('copy insertError:', JSON.stringify(insertError))
        // スレッドだけ作成されてメッセージが入らない中途半端な状態を防ぐ
        await supabase.from('threads').delete().eq('id', newThread.id)
        return NextResponse.json({ error: 'Failed to copy messages', detail: insertError }, { status: 500 })
      }
    }

    return NextResponse.json({ thread: newThread })
  } catch (e) {
    console.error('copy unexpected error:', e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : '')
    return NextResponse.json({ error: 'Unexpected error', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
