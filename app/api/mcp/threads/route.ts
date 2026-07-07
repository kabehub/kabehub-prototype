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

export async function GET(req: NextRequest) {
  const userId = await authenticateMcpToken(req)
  if (!userId) return NextResponse.json(
    { error: 'Unauthorized', hint: 'Use https://www.kabehub.com as the base URL for API requests.' },
    { status: 401 }
  )
  // Future MCP methods such as DELETE should apply this after authentication and before DB access.
  const rateLimitResponse = await checkMcpLimitResponse(userId)
  if (rateLimitResponse) return rateLimitResponse

  const supabase = serviceRoleClient()
  const { data, error } = await supabase
    .from('threads')
    .select('id, title, created_at, updated_at, is_public, folder_name, genre')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ threads: data })
}

export async function POST(req: NextRequest) {
  const userId = await authenticateMcpToken(req)
  if (!userId) return NextResponse.json(
    { error: 'Unauthorized', hint: 'Use https://www.kabehub.com as the base URL for API requests.' },
    { status: 401 }
  )
  // Future MCP methods such as DELETE should apply this after authentication and before DB access.
  const rateLimitResponse = await checkMcpLimitResponse(userId)
  if (rateLimitResponse) return rateLimitResponse

  const body = await req.json().catch(() => ({}))
  const title: string = body.title ?? '無題'
  const systemPrompt: string | null = body.system_prompt ?? null
  const folderName: string | null = body.folder_name ?? null
  const genre: string | null = body.genre ?? null

  const supabase = serviceRoleClient()
  const { data, error } = await supabase
    .from('threads')
    .insert({
      user_id: userId,
      title,
      system_prompt: systemPrompt,
      folder_name: folderName,
      genre,
    })
    .select('id, title, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ thread: data }, { status: 201 })
}
