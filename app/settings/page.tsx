'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { generateBulkExportZip } from '@/lib/exportUtils'

type Profile = {
  id: string
  handle: string
  display_name: string | null
  bio: string | null
  created_at: string
  updated_at: string
}

// ① APIキーのLocalStorageキー名（壁打ち画面と統一）
const LS_KEYS = {
  claude: 'kabehub_anthropic_key',
  gemini: 'kabehub_gemini_key',
  openai: 'kabehub_openai_key',
} as const

function validateHandle(value: string): string | null {
  if (!value) return '入力してください'
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{2,19}$/.test(value)) {
    return '英字始まり・英数字/_/-・3〜20文字で入力してください'
  }
  return null
}

// ① APIキーのマスク表示（末尾4文字のみ表示）
function maskKey(key: string): string {
  if (key.length <= 4) return '****'
  return '••••••••' + key.slice(-4)
}

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // ③ ?onboarding=true のとき初回オンボーディングモード
  const isOnboarding = searchParams.get('onboarding') === 'true'

  const [profile, setProfile] = useState<Profile | null>(null)
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [handleError, setHandleError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  // ① APIキー state
  const [claudeKey, setClaudeKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [showClaudeKey, setShowClaudeKey] = useState(false)
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [apiKeySaved, setApiKeySaved] = useState(false)

  // ① LocalStorageからAPIキーを読み込む
  useEffect(() => {
    setClaudeKey(localStorage.getItem(LS_KEYS.claude) ?? '')
    setGeminiKey(localStorage.getItem(LS_KEYS.gemini) ?? '')
    setOpenaiKey(localStorage.getItem(LS_KEYS.openai) ?? '')
  }, [])

  // ① APIキーを保存（LocalStorage）
  const handleSaveApiKeys = useCallback(() => {
    if (claudeKey.trim()) {
      localStorage.setItem(LS_KEYS.claude, claudeKey.trim())
    } else {
      localStorage.removeItem(LS_KEYS.claude)
    }
    if (geminiKey.trim()) {
      localStorage.setItem(LS_KEYS.gemini, geminiKey.trim())
    } else {
      localStorage.removeItem(LS_KEYS.gemini)
    }
    if (openaiKey.trim()) {
      localStorage.setItem(LS_KEYS.openai, openaiKey.trim())
    } else {
      localStorage.removeItem(LS_KEYS.openai)
    }
    // トースト表示
    setApiKeySaved(true)
    setTimeout(() => setApiKeySaved(false), 2500)
  }, [claudeKey, geminiKey, openaiKey])

  const handleBulkExport = async () => {
    setIsExporting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const userId = user.id
      const exportedAt = new Date().toISOString()

      const [
        { data: threads },
        { data: messages },
        { data: tags },
        { data: notes },
        { data: messageNotes },
        { data: drafts },
        { data: profiles },
        { data: likes },
      ] = await Promise.all([
        supabase.from("threads").select("*").eq("user_id", userId),
        supabase.from("messages").select("*").eq("user_id", userId),
        supabase.from("thread_tags").select("*").eq("user_id", userId),
        supabase.from("thread_notes").select("*").eq("user_id", userId),
        supabase.from("message_notes").select("*").eq("user_id", userId),
        supabase.from("drafts").select("*").eq("user_id", userId),
        supabase.from("profiles").select("*").eq("user_id", userId),
        supabase.from("likes").select("*").eq("user_id", userId),
      ])

      const blob = await generateBulkExportZip({
        threads: threads ?? [],
        messages: messages ?? [],
        tags: tags ?? [],
        notes: notes ?? [],
        messageNotes: messageNotes ?? [],
        drafts: drafts ?? [],
        profiles: profiles ?? [],
        likes: likes ?? [],
        exportedAt,
      })

      const dateStr = exportedAt.slice(0, 10)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `kabehub-export-${dateStr}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Export failed:", err)
      alert("エクスポートに失敗しました。もう一度お試しください。")
    } finally {
      setIsExporting(false)
    }
  }

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
        setBio(json.profile.bio ?? '')
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
      body: JSON.stringify({ handle, display_name: displayName || null, bio: bio || null })
    })
    const json = await res.json()

    if (!res.ok) {
      setSaveMessage({ type: 'error', text: json.error })
    } else {
      setProfile(json.profile)
      setSaveMessage({ type: 'success', text: '保存しました！' })
      // ③ オンボーディング完了後は壁打ち画面へ
      if (isOnboarding) {
        setTimeout(() => router.push('/'), 800)
      }
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
      {/* ③ オンボーディングバナー */}
      {isOnboarding && (
        <div className="bg-gradient-to-r from-orange-500/20 to-amber-500/20 border-b border-orange-500/30 px-6 py-4">
          <div className="max-w-xl mx-auto">
            <p className="text-sm font-semibold text-orange-300">🎉 KabeHubへようこそ！</p>
            <p className="text-xs text-orange-200/80 mt-1">
              まずはハンドルネーム（あなたのID）を設定しましょう。APIキーを登録するとすぐに壁打ちを始められます。
            </p>
          </div>
        </div>
      )}

      {/* ヘッダー */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        {!isOnboarding && (
          <button
            onClick={() => router.push('/')}
            className="text-gray-400 hover:text-gray-200 transition-colors text-sm"
          >
            ← ホームに戻る
          </button>
        )}
        <h1 className="text-lg font-semibold">
          {isOnboarding ? 'プロフィール・初期設定' : '設定'}
        </h1>
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
              {isOnboarding
                ? <span className="ml-2 text-xs text-orange-400">（必須）</span>
                : <span className="ml-2 text-xs text-gray-500">（変更可能）</span>
              }
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

          {/* 自己紹介 */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-300">
              自己紹介
              <span className="ml-2 text-xs text-gray-500">（任意・300文字以内）</span>
            </label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              maxLength={300}
              rows={4}
              placeholder="壁打ちのスタイルや興味分野を書いてみましょう"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors resize-none"
            />
            <div className="text-right text-xs text-gray-600">{bio.length} / 300</div>
          </div>

          {/* 保存ボタン */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving || !!handleError}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? '保存中...' : isOnboarding ? '保存して始める →' : '保存する'}
            </button>
            {saveMessage && (
              <p className={`text-sm ${saveMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {saveMessage.text}
              </p>
            )}
          </div>

          {/* ③ オンボーディング時のスキップリンク */}
          {isOnboarding && (
            <p className="text-xs text-gray-600">
              あとで設定する場合は
              <button
                onClick={() => router.push('/')}
                className="text-gray-400 hover:text-gray-200 underline ml-1"
              >
                スキップ →
              </button>
            </p>
          )}
        </section>

        {/* ① APIキーセクション */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
              APIキー
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              キーはこのブラウザのローカルストレージに保存されます。KabeHubのサーバーには送信されません。
            </p>
          </div>

          <div className="border border-gray-800 rounded-xl p-5 space-y-5">

            {/* Claude */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400">
                Claude（Anthropic）
                <span className="ml-2 text-gray-600 font-normal">sk-ant-... で始まるキー</span>
              </label>
              <div className="flex gap-2">
                <input
                  type={showClaudeKey ? 'text' : 'password'}
                  value={claudeKey}
                  onChange={e => setClaudeKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                />
                <button
                  onClick={() => setShowClaudeKey(v => !v)}
                  className="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg transition-colors"
                >
                  {showClaudeKey ? '隠す' : '表示'}
                </button>
              </div>
              {claudeKey && !showClaudeKey && (
                <p className="text-xs text-gray-600 font-mono">{maskKey(claudeKey)}</p>
              )}
            </div>

            {/* Gemini */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400">
                Gemini（Google）
                <span className="ml-2 text-gray-600 font-normal">AIza... で始まるキー</span>
              </label>
              <div className="flex gap-2">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder="AIza..."
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                />
                <button
                  onClick={() => setShowGeminiKey(v => !v)}
                  className="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg transition-colors"
                >
                  {showGeminiKey ? '隠す' : '表示'}
                </button>
              </div>
              {geminiKey && !showGeminiKey && (
                <p className="text-xs text-gray-600 font-mono">{maskKey(geminiKey)}</p>
              )}
            </div>

            {/* OpenAI */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400">
                ChatGPT（OpenAI）
                <span className="ml-2 text-gray-600 font-normal">sk-... で始まるキー</span>
              </label>
              <div className="flex gap-2">
                <input
                  type={showOpenaiKey ? 'text' : 'password'}
                  value={openaiKey}
                  onChange={e => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                />
                <button
                  onClick={() => setShowOpenaiKey(v => !v)}
                  className="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg transition-colors"
                >
                  {showOpenaiKey ? '隠す' : '表示'}
                </button>
              </div>
              {openaiKey && !showOpenaiKey && (
                <p className="text-xs text-gray-600 font-mono">{maskKey(openaiKey)}</p>
              )}
            </div>

            {/* APIキー保存ボタン＋トースト */}
            <div className="flex items-center gap-4 pt-1">
              <button
                onClick={handleSaveApiKeys}
                className="px-5 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
              >
                APIキーを保存
              </button>
              {/* ① 保存トースト */}
              {apiKeySaved && (
                <span className="text-sm text-green-400 flex items-center gap-1">
                  ✅ 保存しました
                </span>
              )}
            </div>
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

        {/* データ管理セクション */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
            データ管理
          </h2>
          <div className="border border-gray-800 rounded-xl p-5 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-200">全データをエクスポート</p>
              <p className="text-xs text-gray-500 mt-1">
                すべてのスレッドとメッセージをJSON＋Markdownで一括ダウンロードします。アカウント削除前に必ず実行することをおすすめします。
              </p>
            </div>
            <button
              onClick={handleBulkExport}
              disabled={isExporting}
              className={`px-4 py-2 rounded-lg text-sm transition-colors border ${
                isExporting
                  ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                  : 'bg-transparent border-gray-600 hover:bg-gray-800 text-gray-300 hover:text-gray-100 cursor-pointer'
              }`}
            >
              {isExporting ? '⏳ エクスポート中...' : '📦 全データをエクスポート (.zip)'}
            </button>
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

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        読み込み中...
      </div>
    }>
      <SettingsContent />
    </Suspense>
  )
}
