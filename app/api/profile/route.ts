import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler'

// ✅v32追加: 予約語リスト（/@handle URLと衝突するシステムパス）
const RESERVED_HANDLES = new Set([
  'explore', 'arena', 'settings', 'login', 'share', 'api',
  'auth', 'admin', 'about', 'help', 'support', 'terms',
  'privacy', 'profile', 'user', 'users', 'me', 'home',
])

export async function GET(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createRouteHandlerSupabaseClient(req, res)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ profile: data ?? null })
}

export async function POST(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createRouteHandlerSupabaseClient(req, res)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { handle, display_name, bio } = await req.json()

  const normalized = handle?.toLowerCase()
  const formatOk = /^[a-z][a-z0-9_-]{2,19}$/.test(normalized ?? '')
  const notAllUpper = handle !== handle?.toUpperCase()

  if (!formatOk) {
    return NextResponse.json({ error: '英字始まり・英数字/_/-・3〜20文字で入力してください' }, { status: 400 })
  }
  if (!notAllUpper) {
    return NextResponse.json({ error: '全て大文字のIDは使用できません（将来の限定機能です）' }, { status: 400 })
  }
  // ✅v32追加: 予約語チェック
  if (RESERVED_HANDLES.has(normalized)) {
    return NextResponse.json({ error: 'そのハンドルネームは使用できません' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, handle: normalized, display_name: display_name ?? null, bio: bio ?? null })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'そのハンドルネームは既に使われています' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}
