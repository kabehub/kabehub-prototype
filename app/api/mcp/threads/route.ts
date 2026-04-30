import { NextRequest, NextResponse } from 'next/server'
import { authenticateMcpToken, serviceRoleClient } from '@/lib/mcp-auth'

export async function GET(req: NextRequest) {
  const userId = await authenticateMcpToken(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
