import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler'

// GET /api/folder-settings?folder_name=xxx
export async function GET(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createRouteHandlerSupabaseClient(req, res)
  const { searchParams } = new URL(req.url)
  const folder_name = searchParams.get('folder_name')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!folder_name) {
    const { data, error } = await supabase
      .from('folder_settings')
      .select('folder_name, folder_type')
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  }

  const { data, error } = await supabase
    .from('folder_settings')
    .select('system_prompt, folder_type, pinned_github_files, github_repo, github_ref')
    .eq('user_id', user.id)
    .eq('folder_name', folder_name)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    system_prompt: data?.system_prompt ?? null,
    folder_type: data?.folder_type ?? null,
    pinned_github_files: data?.pinned_github_files ?? [],
    github_repo: data?.github_repo ?? null,
    github_ref: data?.github_ref ?? null,
  })
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

  const { folder_name, system_prompt, folder_type, pinned_github_files, github_repo, github_ref } = await req.json()

  if (!folder_name) {
    return NextResponse.json({ error: 'folder_name is required' }, { status: 400 })
  }

  // pinned_github_files バリデーション
  if (pinned_github_files !== undefined && !Array.isArray(pinned_github_files)) {
    return NextResponse.json({ error: 'pinned_github_files must be an array' }, { status: 400 })
  }

  // github_repo バリデーション
  if (github_repo !== undefined && github_repo !== null) {
    if (typeof github_repo !== 'string' || !/^[^/]+\/[^/]+$/.test(github_repo)) {
      return NextResponse.json({ error: 'github_repo は owner/repo 形式で入力してください' }, { status: 400 })
    }
  }

  // github_ref バリデーション
  if (github_ref !== undefined && github_ref !== null) {
    if (typeof github_ref !== 'string' || github_ref.length > 255) {
      return NextResponse.json({ error: 'github_ref は255文字以内の文字列で入力してください' }, { status: 400 })
    }
  }

  const { error } = await supabase
    .from('folder_settings')
    .upsert(
      {
        user_id: user.id,
        folder_name,
        system_prompt: system_prompt ?? null,
        folder_type: folder_type ?? null,
        ...(pinned_github_files !== undefined
          ? { pinned_github_files: (pinned_github_files as string[]).slice(0, 5) }
          : {}),
        ...(github_repo !== undefined ? { github_repo: github_repo ?? null } : {}),
        ...(github_ref !== undefined ? { github_ref: github_ref ?? null } : {}),
      },
      { onConflict: 'user_id,folder_name' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
