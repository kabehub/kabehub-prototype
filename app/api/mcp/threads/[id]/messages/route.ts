import { NextRequest, NextResponse } from 'next/server'
import { authenticateMcpToken, serviceRoleClient } from '@/lib/mcp-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await authenticateMcpToken(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = serviceRoleClient()

  // スレッドの所有者確認
  const { data: thread } = await supabase
    .from('threads')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single()
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, provider, created_at')
    .eq('thread_id', params.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await authenticateMcpToken(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = serviceRoleClient()

  // スレッドの所有者確認
  const { data: thread } = await supabase
    .from('threads')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single()
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const role: 'user' | 'assistant' = body.role === 'assistant' ? 'assistant' : 'user'
  const content: string = body.content ?? ''
  const provider: string = body.provider ?? 'unknown'

  if (!content.trim()) return NextResponse.json({ error: 'content is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('messages')
    .insert({ thread_id: params.id, user_id: userId, role, content, provider })
    .select('id, role, content, provider, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // updated_at を threads に反映
  await supabase
    .from('threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', params.id)

  return NextResponse.json({ message: data }, { status: 201 })
}
