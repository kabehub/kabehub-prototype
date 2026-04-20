import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler'

// GET /api/folder-settings?folder_name=xxx
export async function GET(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createRouteHandlerSupabaseClient(req, res)
  const { searchParams } = new URL(req.url)
  const folder_name = searchParams.get('folder_name')

  if (!folder_name) {
    return NextResponse.json({ error: 'folder_name is required' }, { status: 400 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('folder_settings')
    .select('system_prompt')
    .eq('user_id', user.id)
    .eq('folder_name', folder_name)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ system_prompt: data?.system_prompt ?? null })
}

// POST /api/folder-settings
// body: { folder_name: string, system_prompt: string }
export async function POST(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createRouteHandlerSupabaseClient(req, res)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { folder_name, system_prompt } = await req.json()

  if (!folder_name) {
    return NextResponse.json({ error: 'folder_name is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('folder_settings')
    .upsert(
      {
        user_id: user.id,
        folder_name,
        system_prompt: system_prompt ?? null,
      },
      { onConflict: 'user_id,folder_name' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}