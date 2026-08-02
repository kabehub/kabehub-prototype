import { NextRequest } from 'next/server'
import { requireRouteUser } from '@/lib/supabase/route-auth'
import { isValidHandleFormat, isAllUpperHandle, HANDLE_MIN_LENGTH, HANDLE_MAX_LENGTH } from '@/lib/validationLimits'

// ✅v32追加: 予約語リスト（/@handle URLと衝突するシステムパス）
const RESERVED_HANDLES = new Set([
  'explore', 'arena', 'settings', 'login', 'share', 'api',
  'auth', 'admin', 'about', 'help', 'support', 'terms',
  'privacy', 'profile', 'user', 'users', 'me', 'home',
])

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req)
  if (!auth.ok) return auth.response
  const { user, supabase, finalizeJson } = auth

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    return finalizeJson({ error: error.message }, { status: 500 })
  }

  return finalizeJson({ profile: data ?? null })
}

export async function POST(req: NextRequest) {
  const auth = await requireRouteUser(req)
  if (!auth.ok) return auth.response
  const { user, supabase, finalizeJson } = auth

  const { handle, display_name, bio } = await req.json()

  const rawHandle = typeof handle === 'string' ? handle : ''
  const normalized = rawHandle.toLowerCase()
  const formatOk = isValidHandleFormat(rawHandle)
  const notAllUpper = !isAllUpperHandle(rawHandle)

  if (!formatOk) {
    return finalizeJson({ error: `英字始まり・英数字/_/-・${HANDLE_MIN_LENGTH}〜${HANDLE_MAX_LENGTH}文字で入力してください` }, { status: 400 })
  }
  if (!notAllUpper) {
    return finalizeJson({ error: '全て大文字のIDは使用できません（将来の限定機能です）' }, { status: 400 })
  }
  // ✅v32追加: 予約語チェック
  if (RESERVED_HANDLES.has(normalized)) {
    return finalizeJson({ error: 'そのハンドルネームは使用できません' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, handle: normalized, display_name: display_name ?? null, bio: bio ?? null })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return finalizeJson({ error: 'そのハンドルネームは既に使われています' }, { status: 409 })
    }
    return finalizeJson({ error: error.message }, { status: 500 })
  }

  return finalizeJson({ profile: data })
}
