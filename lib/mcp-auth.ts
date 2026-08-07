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
    console.error('[db-operation-failed]', {
      route: 'mcp_auth',
      operation: 'fetch_token',
      table: 'mcp_tokens',
      errorCode: error.code,
    })
    return null
  }

  if (!data) return null

  // last_used_at の更新はベストエフォート。失敗しても認証自体は成功として扱う（利用状況の記録に過ぎないため）。
  try {
    const { error: updateError } = await supabase
      .from('mcp_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)

    if (updateError) {
      console.warn('[db-operation-failed]', {
        route: 'mcp_auth',
        operation: 'update_last_used_at',
        table: 'mcp_tokens',
        errorCode: updateError.code,
      })
    }
  } catch (err) {
    console.warn('[db-operation-failed]', {
      route: 'mcp_auth',
      operation: 'update_last_used_at',
      table: 'mcp_tokens',
      errorCode: err instanceof Error ? err.name : 'unknown',
    })
  }

  return data.user_id
}

export { serviceRoleClient }
