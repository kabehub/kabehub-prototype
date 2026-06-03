'use client'

import Link from 'next/link'

type Thread = {
  id: string
  title: string | null
  created_at: string
  updated_at: string
  likes_count: number
  fork_count: number
  tags: string[] | null
}

type Profile = {
  id: string
  handle: string
  display_name: string | null
  bio: string | null
  created_at: string
}

type Stats = {
  publicThreadCount: number
  totalLikes: number
  totalForks: number
}

type Props = {
  profile: Profile
  threads: Thread[]
  stats: Stats
}

export default function ProfilePage({ profile, threads, stats }: Props) {
  const displayName = profile.display_name ?? `@${profile.handle}`

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <Link href="/explore" className="text-gray-400 hover:text-gray-200 text-sm transition-colors">
          Explore
        </Link>
        <Link
          href="/login"
          className="text-sm bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded-lg transition-colors"
        >
          Login
        </Link>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-10">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-2xl font-bold mb-4">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold">{displayName}</h1>
          {profile.bio && (
            <p className="text-gray-400 text-sm mt-3 leading-relaxed">{profile.bio}</p>
          )}
          <div className="flex gap-4 mt-3 text-xs text-gray-500">
            <span>{stats.publicThreadCount} public threads</span>
            <span>{stats.totalLikes} likes</span>
            <span>{stats.totalForks} forks</span>
          </div>
        </div>

        {threads.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            <p>No public threads yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {threads.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
        )}

        <div className="mt-16 border border-gray-800 rounded-xl p-6 text-center space-y-3">
          <p className="text-gray-300 text-sm">Start your own conversations with AI.</p>
          <p className="text-gray-500 text-xs">
            Use Claude, Gemini, and ChatGPT in one interface.
          </p>
          <Link
            href="/login"
            className="inline-block mt-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Get started
          </Link>
        </div>
      </div>
    </div>
  )
}

function ThreadCard({ thread }: { thread: Thread }) {
  const title = thread.title ?? 'Untitled thread'
  const updatedAt = new Date(thread.updated_at).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="block border border-gray-800 rounded-xl p-4 hover:border-gray-600 hover:bg-gray-900/50 transition-all group">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-gray-100 group-hover:text-white line-clamp-2">
          {title}
        </h3>
        <span className="text-xs text-gray-600 whitespace-nowrap mt-0.5">{updatedAt}</span>
      </div>

      {(thread.likes_count > 0 || thread.fork_count > 0) && (
        <div className="flex gap-3 mt-2 text-xs text-gray-600">
          {thread.likes_count > 0 && <span>{thread.likes_count} likes</span>}
          {thread.fork_count > 0 && <span>{thread.fork_count} forks</span>}
        </div>
      )}

      {(thread.tags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(thread.tags ?? []).map((tag) => (
            <span
              key={tag}
              className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
