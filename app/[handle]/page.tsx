import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import ProfilePage from './ProfilePage'

type Props = {
  params: { handle: string }
}

// ✅v32: 動的OGP
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const rawHandle = params?.handle
  if (!rawHandle) return { title: 'KabeHub' }

  const handle = rawHandle.replace(/^@/, '').toLowerCase()
  const supabase = createServerSupabaseClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('handle, display_name, bio')
    .eq('handle', handle)
    .single()

  if (!profile) {
    return { title: 'ユーザーが見つかりません - KabeHub' }
  }

  const name = profile.display_name ?? `@${profile.handle}`
  return {
    title: `${name}の壁打ち - KabeHub`,
    description: profile.bio ?? `${name}さんの公開壁打ち一覧です。`,
    openGraph: {
      title: `${name}の壁打ち - KabeHub`,
      description: `${name}さんの公開壁打ち一覧です。`,
    },
    twitter: {
      card: 'summary',
      title: `${name}の壁打ち - KabeHub`,
      description: `${name}さんの公開壁打ち一覧です。`,
    },
  }
}

export default async function Page({ params }: Props) {
  const rawHandle = params?.handle
  if (!rawHandle) notFound()

  const handle = rawHandle.replace(/^@/, '').toLowerCase()
  const supabase = createServerSupabaseClient()

  // プロフィール取得
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, handle, display_name, bio, created_at')
    .eq('handle', handle)
    .single()


  if (!profile) notFound()

  // 公開スレッド取得 + 統計用カラム追加
  const { data: threads } = await supabase
    .from('threads')
    .select(`
      id, title, created_at, updated_at, share_token,
      likes_count, fork_count,
      thread_tags ( name )
    `)
    .eq('user_id', profile.id)
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
    .limit(50)

  const threadList = threads ?? []
  const stats = {
    publicThreadCount: threadList.length,
    totalLikes: threadList.reduce((sum, t) => sum + (t.likes_count ?? 0), 0),
    totalForks: threadList.reduce((sum, t) => sum + (t.fork_count ?? 0), 0),
  }

  return <ProfilePage profile={profile} threads={threadList} stats={stats} />
}
