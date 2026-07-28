// MCP Bearerトークン認証専用。
// authenticateMcpToken は Cookie / Supabaseセッションを読まない。
// ブラウザのログイン認証とは混ぜないこと。

import { createClient } from '@supabase/supabase-js'
import { hashMcpToken } from './mcp-token-hash'

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

  const tokenHash = await hashMcpToken(rawToken)

  const supabase = serviceRoleClient()
  const { data, error } = await supabase
    .from('mcp_tokens')
    .select('id, user_id')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error) {
    console.warn('[mcp-auth] Failed to fetch MCP token:', error.message)
    return null
  }

  if (!data) return null

  try {
    const { error: updateError } = await supabase
      .from('mcp_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)

    if (updateError) {
      console.warn('[mcp-auth] Failed to update MCP token last_used_at:', updateError.message)
    }
  } catch (err) {
    console.warn('[mcp-auth] Failed to update MCP token last_used_at:', err)
  }

  return data.user_id
}

export { serviceRoleClient }
