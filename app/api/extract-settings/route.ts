import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler'

// GET /api/extract-settings?thread_id=xxx
export async function GET(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createRouteHandlerSupabaseClient(req, res)
  const { searchParams } = new URL(req.url)
  const thread_id = searchParams.get('thread_id')

  if (!thread_id) {
    return NextResponse.json({ error: 'thread_id is required' }, { status: 400 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('novel_settings')
    .select('*')
    .eq('user_id', user.id)
    .eq('thread_id', thread_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const arr = data ?? []
  return NextResponse.json({
    characters: arr.find(r => r.type === 'character')?.data?.characters ?? [],
    factions:   arr.find(r => r.type === 'faction')?.data?.factions   ?? [],
    glossary:   arr.find(r => r.type === 'glossary')?.data?.glossary  ?? [],
  })
}

// POST /api/extract-settings
// body: { threadId: string, messages: {role:string, content:string}[], folderName?: string }
export async function POST(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createRouteHandlerSupabaseClient(req, res)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = req.headers.get('x-anthropic-api-key')
  if (!apiKey) {
    return NextResponse.json({ error: 'x-anthropic-api-key header is required' }, { status: 400 })
  }

  try {
    const { threadId, messages, folderName } = await req.json()

    const userContent = (messages as { role: string; content: string }[])
      .map(m => `role: ${m.role}\ncontent: ${m.content}`)
      .join('\n\n---\n\n')

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: `会話から登場人物・勢力・用語を抽出してください。
必ず以下のJSONスキーマのみを返してください。
説明文・コードフェンス（\`\`\`）は一切不要です。JSONのみ返してください。
スキーマ:
{
  "characters": [{"name":string,"role":string,"faction":string,"status":string,"notes":string}],
  "factions":   [{"name":string,"description":string,"members":string[]}],
  "glossary":   [{"term":string,"description":string}]
}`,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      console.error('[extract-settings] Claude API error:', claudeRes.status, errText)
      return NextResponse.json({ error: 'Claude API error', detail: errText }, { status: 500 })
    }

    const claudeData = await claudeRes.json()
    const rawText: string = claudeData.content[0].text
    const cleanText = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    let parsed: { characters?: unknown[]; factions?: unknown[]; glossary?: unknown[] }
    try {
      parsed = JSON.parse(cleanText)
    } catch (parseErr) {
      console.error('[extract-settings] JSON parse error:', parseErr, '\nrawText:', rawText)
      return NextResponse.json({ error: 'parse_error', raw: rawText }, { status: 500 })
    }

    const { error: upsertError } = await supabase
      .from('novel_settings')
      .upsert(
        [
          { user_id: user.id, thread_id: threadId, folder_name: folderName ?? null, type: 'character', data: { characters: parsed.characters ?? [] } },
          { user_id: user.id, thread_id: threadId, folder_name: folderName ?? null, type: 'faction',   data: { factions:   parsed.factions   ?? [] } },
          { user_id: user.id, thread_id: threadId, folder_name: folderName ?? null, type: 'glossary',  data: { glossary:   parsed.glossary   ?? [] } },
        ],
        { onConflict: 'user_id,thread_id,type' }
      )

    if (upsertError) {
      console.error('[extract-settings] Supabase upsert error:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[extract-settings] エラー詳細:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
