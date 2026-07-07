import { NextRequest, NextResponse } from 'next/server'
import { authenticateMcpToken, serviceRoleClient } from '@/lib/mcp-auth'
import { checkMcpRateLimit } from '@/lib/rate-limit'

async function checkMcpLimitResponse(userId: string): Promise<NextResponse | null> {
  const rl = await checkMcpRateLimit(userId)
  if (rl.allowed) return null

  const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
  return NextResponse.json(
    {
      error: 'リクエストが多すぎます。少し待ってから再度お試しください。',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(rl.limit),
        'X-RateLimit-Remaining': String(rl.remaining),
        'Retry-After': String(retryAfter),
      },
    }
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
  if (!userId) return NextResponse.json(
    { error: 'Unauthorized', hint: 'Use https://www.kabehub.com as the base URL for API requests.' },
    { status: 401 }
  )
  // Future MCP methods such as DELETE should apply this after authentication and before DB access.
  const rateLimitResponse = await checkMcpLimitResponse(userId)
  if (rateLimitResponse) return rateLimitResponse

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
