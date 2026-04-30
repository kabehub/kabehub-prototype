import { createClient } from '@supabase/supabase-js'

function serviceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function authenticateMcpToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
    
  if (!authHeader?.startsWith('Bearer ')) return null

  const rawToken = authHeader.slice(7).trim()

  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken))
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const supabase = serviceRoleClient()
  const { data } = await supabase
    .from('mcp_tokens')
    .select('id, user_id')
    .eq('token_hash', tokenHash)
    .single()

  if (!data) return null

  supabase
    .from('mcp_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})

  return data.user_id
}

export { serviceRoleClient }