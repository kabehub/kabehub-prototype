import { createClient } from '@supabase/supabase-js'

function serviceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function authenticateMcpToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  console.error('[MCP-AUTH] authHeader:', authHeader ? authHeader.slice(0, 20) + '...' : 'null')
  
  if (!authHeader?.startsWith('Bearer ')) return null

  const rawToken = authHeader.slice(7).trim()
  console.error('[MCP-AUTH] rawToken length:', rawToken.length)

  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken))
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  console.error('[MCP-AUTH] computed hash:', tokenHash)

  const supabase = serviceRoleClient()
  const { data, error } = await supabase
    .from('mcp_tokens')
    .select('id, user_id, token_hash')
    .single()
  console.error('[MCP-AUTH] DB result:', JSON.stringify({ data, error }))

  if (!data) return null

  supabase
    .from('mcp_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})

  return data.user_id
}

export { serviceRoleClient }