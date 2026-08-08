import { NextRequest, NextResponse } from 'next/server'
import { authenticateMcpToken, serviceRoleClient } from '@/lib/mcp-auth'
import { checkMcpLimitResponse } from '@/lib/rate-limit'
import * as logger from "@/lib/logger"

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await authenticateMcpToken(req)
  if (!userId) return NextResponse.json(
    { error: 'Unauthorized', hint: 'Use https://www.kabehub.com as the base URL for API requests.' },
    { status: 401 }
  )
  // Future MCP methods such as DELETE should apply this after authentication and before DB access.
  const rateLimitResponse = await checkMcpLimitResponse(userId)
  if (rateLimitResponse) return rateLimitResponse

  const supabase = serviceRoleClient()

  // スレッドの所有者確認
  const { data: thread, error: threadError } = await supabase
    .from('threads')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (threadError) {
    logger.dbOperationFailed({
      route: 'mcp_threads_messages_get',
      operation: 'verify_thread_ownership',
      table: 'threads',
      errorCode: threadError.code,
    })
    return NextResponse.json({ error: 'Failed to verify thread' }, { status: 500 })
  }
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, provider, created_at')
    .eq('thread_id', params.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data })
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await authenticateMcpToken(req)
  if (!userId) return NextResponse.json(
    { error: 'Unauthorized', hint: 'Use https://www.kabehub.com as the base URL for API requests.' },
    { status: 401 }
  )
  // Future MCP methods such as DELETE should apply this after authentication and before DB access.
  const rateLimitResponse = await checkMcpLimitResponse(userId)
  if (rateLimitResponse) return rateLimitResponse

  const supabase = serviceRoleClient()

  // スレッドの所有者確認
  const { data: thread, error: threadError } = await supabase
    .from('threads')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (threadError) {
    logger.dbOperationFailed({
      route: 'mcp_threads_messages_post',
      operation: 'verify_thread_ownership',
      table: 'threads',
      errorCode: threadError.code,
    })
    return NextResponse.json({ error: 'Failed to verify thread' }, { status: 500 })
  }
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

  // 更新失敗はベストエフォート。失敗してもmessages取得自体は成功として返す。
  const { error: threadUpdateError } = await supabase
    .from('threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', userId)

  if (threadUpdateError) {
    logger.dbOperationFailedBestEffort({
      route: 'mcp_threads_messages_post',
      operation: 'update_thread_timestamp',
      table: 'threads',
      errorCode: threadUpdateError.code,
    })
  }

  return NextResponse.json({ message: data }, { status: 201 })
}
