import { NextRequest, NextResponse } from 'next/server'
import { authenticateMcpToken, serviceRoleClient } from '@/lib/mcp-auth'
import { checkMcpLimitResponse } from '@/lib/rate-limit'
import { getOwnedProject } from '@/lib/project-memory/get-owned-project'

type McpThreadRow = {
  id: string
  title: string
  created_at: string
  updated_at: string
  is_public: boolean
  genre: string | null
  project_id: string | null
  projects: { user_id: string; name: string } | null
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
    .select('id, title, created_at, updated_at, is_public, genre, project_id, projects(user_id, name)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(100)
    // The untyped client cannot infer this many-to-one foreign-key join.
    .overrideTypes<McpThreadRow[], { merge: false }>()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const threads = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_public: row.is_public,
    genre: row.genre,
    project_id: row.project_id,
    folder_name: row.project_id && row.projects?.user_id === userId
      ? row.projects.name
      : null,
  }))
  return NextResponse.json({ threads })
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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const requestBody = body as Record<string, unknown>
  const hasProjectId = Object.prototype.hasOwnProperty.call(requestBody, 'project_id')
  const hasFolderName = Object.prototype.hasOwnProperty.call(requestBody, 'folder_name')
  const projectIdSpecified = hasProjectId && requestBody.project_id !== null
  const folderNameSpecified = hasFolderName && requestBody.folder_name !== null

  if (projectIdSpecified && typeof requestBody.project_id !== 'string') {
    return NextResponse.json({ error: 'project_id must be a string' }, { status: 400 })
  }
  if (folderNameSpecified && typeof requestBody.folder_name !== 'string') {
    return NextResponse.json({ error: 'folder_name must be a string' }, { status: 400 })
  }
  if (projectIdSpecified && folderNameSpecified) {
    return NextResponse.json({ error: 'project_id and folder_name are mutually exclusive' }, { status: 400 })
  }

  const title = requestBody.title ?? '無題'
  const systemPrompt = requestBody.system_prompt ?? null
  const genre = requestBody.genre ?? null

  const supabase = serviceRoleClient()
  let projectId: string | null = null
  if (projectIdSpecified) {
    const owned = await getOwnedProject(supabase, userId, requestBody.project_id as string)
    if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status })
    projectId = requestBody.project_id as string
  } else if (folderNameSpecified) {
    // Preserve the legacy name exactly: " Foo " and "Foo" are separate projects.
    const { data, error } = await supabase.rpc('get_or_create_project', {
      p_user_id: userId,
      p_name: requestBody.folder_name as string,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    projectId = data
  }

  const { data, error } = await supabase
    .from('threads')
    .insert({
      user_id: userId,
      title,
      system_prompt: systemPrompt,
      project_id: projectId,
      genre,
    })
    .select('id, title, created_at, updated_at, project_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ thread: data }, { status: 201 })
}
