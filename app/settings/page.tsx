'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

type Profile = {
  id: string
  handle: string
  display_name: string | null
  created_at: string
  updated_at: string
}

function validateHandle(value: string): string | null {
  if (!value) return '入力してください'
  if (value !== value.toUpperCase() === false && value === value.toUpperCase()) {
    return '全て大文字のIDは使用できません（将来の限定機能です）'
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{2,19}$/.test(value)) {
    return '英字始まり・英数字/_/-・3〜20文字で入力してください'
  }
  return null
}

export default function SettingsPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [handleError, setHandleError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const res = await fetch('/api/profile')
      const json = await res.json()
      if (json.profile) {
        setProfile(json.profile)
        setHandle(json.profile.handle)
        setDisplayName(json.profile.display_name ?? '')
      }
      setLoading(false)
    }
    init()
  }, [])

  const handleChange = (value: string) => {
    setHandle(value)
    setHandleError(validateHandle(value))
  }

  const handleSave = async () => {
    const err = validateHandle(handle)
    if (err) { setHandleError(err); return }

    setSaving(true)
    setSaveMessage(null)

    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, display_name: displayName || null })
    })
    const json = await res.json()

    if (!res.ok) {
      setSaveMessage({ type: 'error', text: json.error })
    } else {
      setProfile(json.profile)
      setSaveMessage({ type: 'success', text: '保存しました！' })
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        読み込み中...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ヘッダー */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/')}
          className="text-gray-400 hover:text-gray-200 transition-colors text-sm"
        >
          ← ホームに戻る
        </button>
        <h1 className="text-lg font-semibold">設定</h1>
      </div>

      <div className="max-w-xl mx-auto px-6 py-10 space-y-10">

        {/* プロフィールセクション */}
        <section className="space-y-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
            プロフィール
          </h2>

          {/* ハンドルネーム */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-300">
              ハンドルネーム
              <span className="ml-2 text-xs text-gray-500">（変更可能）</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">@</span>
              <input
                type="text"
                value={handle}
                onChange={e => handleChange(e.target.value)}
                placeholder="your_handle"
                className={`flex-1 bg-gray-900 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors ${
                  handleError
                    ? 'border-red-500 focus:ring-red-500/40'
                    : 'border-gray-700 focus:ring-blue-500/40'
                }`}
              />
            </div>
            {handleError && (
              <p className="text-xs text-red-400">{handleError}</p>
            )}
            {!handleError && handle && handle !== profile?.handle && (
              <p className="text-xs text-blue-400">変更されます</p>
            )}
            <p className="text-xs text-gray-600">
              英字始まり・英数字 / _ / - のみ・3〜20文字
            </p>
          </div>

          {/* 表示名 */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-300">
              表示名
              <span className="ml-2 text-xs text-gray-500">（任意・日本語OK）</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="松本 塁"
              maxLength={50}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
            />
            <p className="text-xs text-gray-600">最大50文字。共有ページに表示予定。</p>
          </div>

          {/* 保存ボタン */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving || !!handleError}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? '保存中...' : '保存する'}
            </button>
            {saveMessage && (
              <p className={`text-sm ${saveMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {saveMessage.text}
              </p>
            )}
          </div>
        </section>

        {/* 将来の有料機能ティーザー */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
            プレミアム（準備中）
          </h2>
          <div className="border border-gray-800 rounded-xl p-5 space-y-3 opacity-60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">大文字ID</p>
                <p className="text-xs text-gray-500">@RUI のような大文字ハンドルネームが使えるようになります</p>
              </div>
              <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full px-3 py-1">
                近日公開
              </span>
            </div>
          </div>
        </section>
        {/* 危険ゾーン */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-red-500 uppercase tracking-widest">
            危険ゾーン
          </h2>
          <div className="border border-red-500/30 rounded-xl p-5 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-200">アカウントを削除する</p>
              <p className="text-xs text-gray-500 mt-1">
                全ての壁打ちデータが完全に削除されます。この操作は取り消せません。
              </p>
            </div>
            <button
              onClick={async () => {
                const confirmed = window.confirm(
                  "⚠️ アカウントを削除しますか？\n\n" +
                  "削除すると、全ての壁打ちデータ（スレッド・メッセージ・タグ・メモ等）が完全に消去され、元に戻すことはできません。\n\n" +
                  "💾 削除前に「エクスポート」機能（各スレッドのTXT / MD / CSV）でデータを手元に保存することをおすすめします。\n\n" +
                  "本当に削除してよろしいですか？"
                )
                if (!confirmed) return

                try {
                  const { error } = await supabase.rpc('delete_current_user')
                  if (error) throw error
                  await supabase.auth.signOut()
                  router.push('/login')
                } catch (err) {
                  console.error('アカウント削除に失敗しました', err)
                  alert('アカウント削除に失敗しました。時間をおいて再度お試しください。')
                }
              }}
              className="px-4 py-2 bg-transparent border border-red-500/50 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-lg text-sm transition-colors"
            >
              アカウントを削除する
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}