'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getClientUser } from '@/lib/supabase/client-auth'
import { generateBulkExportZip } from '@/lib/exportUtils'
import { MODEL_CONFIG, loadModel, saveModel, type ModelId } from '@/components/ChatInput'
import { useToast } from '@/components/Toast'
import { isValidHandleFormat, isAllUpperHandle, HANDLE_MIN_LENGTH, HANDLE_MAX_LENGTH } from '@/lib/validationLimits'
import type { McpToken } from '@/types'

type Profile = {
  id: string
  handle: string
  display_name: string | null
  bio: string | null
  created_at: string
  updated_at: string
}

type GithubStatus = {
  connected: boolean
  github_login: string | null
  scope: string | null
}

// ① APIキーのLocalStorageキー名（壁打ち画面と統一）
const LS_KEYS = {
  claude:     'kabehub_anthropic_key',
  gemini:     'kabehub_gemini_key',
  openai:     'kabehub_openai_key',
  ideogram:   'kabehub_ideogram_key',
  openrouter: 'kabehub_openrouter_key',
} as const

function validateHandle(value: string): string | null {
  if (!value) return '入力してください'
  if (!isValidHandleFormat(value)) {
    return `英字始まり・英数字/_/-・${HANDLE_MIN_LENGTH}〜${HANDLE_MAX_LENGTH}文字で入力してください`
  }
  if (isAllUpperHandle(value)) {
    return '全て大文字のIDは使用できません（将来の限定機能です）'
  }
  return null
}

// ① APIキーのマスク表示（末尾4文字のみ表示）
function maskKey(key: string): string {
  if (key.length <= 4) return '****'
  return '••••••••' + key.slice(-4)
}

function SettingsContent() {
  const { showToast } = useToast()
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
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [isBatchTraining, setIsBatchTraining] = useState(false)
  const [batchTrainResult, setBatchTrainResult] = useState<{
    ok: boolean; processedCount: number; insertedCount: number
  } | null>(null)

  // ① APIキー state
  const [claudeKey, setClaudeKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [ideogramKey, setIdeogramKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [showClaudeKey, setShowClaudeKey] = useState(false)
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [showIdeogramKey, setShowIdeogramKey] = useState(false)
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false)
  // モデル選択 state
  const [claudeModel, setClaudeModel] = useState<ModelId>(MODEL_CONFIG.claude.defaultModel)
  const [geminiModel, setGeminiModel] = useState<ModelId>(MODEL_CONFIG.gemini.defaultModel)
  const [openaiModel, setOpenaiModel] = useState<ModelId>(MODEL_CONFIG.openai.defaultModel)

  // MCPトークン state
  const [mcpTokens, setMcpTokens] = useState<McpToken[]>([])
  const [issuingToken, setIssuingToken] = useState(false)
  const [newTokenName, setNewTokenName] = useState('')
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)

  // GitHub連携 state
  const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null)
  const [githubLoading, setGithubLoading] = useState(false)
  const [githubDisconnecting, setGithubDisconnecting] = useState(false)
  const [githubMessage, setGithubMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // UI設定 state
  const [navAlwaysOn, setNavAlwaysOn] = useState(false)
  const [enterMode, setEnterMode] = useState<'send' | 'newline'>('send')
  const [fontScale, setFontScale] = useState<number>(1)

  // ① LocalStorageからAPIキーとモデルを読み込む
  useEffect(() => {
    setClaudeKey(localStorage.getItem(LS_KEYS.claude) ?? '')
    setGeminiKey(localStorage.getItem(LS_KEYS.gemini) ?? '')
    setOpenaiKey(localStorage.getItem(LS_KEYS.openai) ?? '')
    setIdeogramKey(localStorage.getItem(LS_KEYS.ideogram) ?? '')
    setOpenrouterKey(localStorage.getItem(LS_KEYS.openrouter) ?? '')
    setClaudeModel(loadModel('claude'))
    setGeminiModel(loadModel('gemini'))
    setOpenaiModel(loadModel('openai'))
    setNavAlwaysOn(localStorage.getItem('kabehub_nav_expanded_always') === 'true')
    setEnterMode(
      localStorage.getItem('kabehub_enter_mode') === 'newline' ? 'newline' : 'send'
    )
  }, [])

  useEffect(() => {
    try {
      var raw = localStorage.getItem('kabehub_font_scale');
      var n = parseFloat(raw || '1');
      if (!isFinite(n)) n = 1;
      n = Math.min(1.5, Math.max(0.8, n));
      setFontScale(n);
    } catch (e) {
      // 既定値フォールバック: font scale読込失敗時は既定値(1.0)のまま表示する。
    }
  }, []);

  const updateFontScale = (value: number) => {
    const next = Math.min(1.5, Math.max(0.8, value))
    setFontScale(next)
    localStorage.setItem('kabehub_font_scale', String(next))
    document.documentElement.style.setProperty('--font-scale', String(next))
  }

  const fetchMcpTokens = useCallback(async () => {
    const res = await fetch('/api/mcp-tokens')
    if (!res.ok) return
    const json = await res.json()
    setMcpTokens(json.tokens ?? [])
  }, [])

  useEffect(() => { fetchMcpTokens() }, [fetchMcpTokens])

  const fetchGithubStatus = useCallback(async () => {
    setGithubLoading(true)
    try {
      const res = await fetch('/api/auth/github/status')
      if (!res.ok) return
      const json = await res.json()
      setGithubStatus(json)
    } finally {
      setGithubLoading(false)
    }
  }, [])

  useEffect(() => { fetchGithubStatus() }, [fetchGithubStatus])

  useEffect(() => {
    const github = searchParams.get('github')
    if (github === 'connected') {
      setGithubMessage({ type: 'success', text: 'GitHubと連携しました' })
      fetchGithubStatus()
      setTimeout(() => setGithubMessage(null), 2500)
    } else if (github === 'error') {
      setGithubMessage({ type: 'error', text: 'GitHub連携に失敗しました' })
      setTimeout(() => setGithubMessage(null), 2500)
    }
  }, [searchParams, fetchGithubStatus])

  const handleIssueToken = async () => {
    setIssuingToken(true)
    setRevealedToken(null)
    try {
      const res = await fetch('/api/mcp-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTokenName.trim() || null }),
      })
      if (!res.ok) return
      const json = await res.json()
      setRevealedToken(json.token)
      setNewTokenName('')
      await fetchMcpTokens()
    } finally {
      setIssuingToken(false)
    }
  }

  const handleDeleteToken = async (id: string) => {
    if (!window.confirm('このトークンを削除しますか？削除後は使用できなくなります。')) return
    await fetch('/api/mcp-tokens', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await fetchMcpTokens()
  }

  const handleConnectGithub = () => {
    window.location.href = '/api/auth/github'
  }

  const handleDisconnectGithub = async () => {
    setGithubDisconnecting(true)
    setGithubMessage(null)
    try {
      const res = await fetch('/api/auth/github', { method: 'DELETE' })
      if (!res.ok) {
        setGithubMessage({ type: 'error', text: 'GitHub連携の解除に失敗しました' })
        return
      }
      await fetchGithubStatus()
      setGithubMessage({ type: 'success', text: 'GitHub連携を解除しました' })
      setTimeout(() => setGithubMessage(null), 2500)
    } finally {
      setGithubDisconnecting(false)
    }
  }

  const handleCopyToken = async (token: string) => {
    await navigator.clipboard.writeText(token)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 2000)
  }

  // ① APIキーとモデルを保存（LocalStorage）
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
    if (ideogramKey.trim()) {
      localStorage.setItem(LS_KEYS.ideogram, ideogramKey.trim())
    } else {
      localStorage.removeItem(LS_KEYS.ideogram)
    }
    if (openrouterKey.trim()) {
      localStorage.setItem(LS_KEYS.openrouter, openrouterKey.trim())
    } else {
      localStorage.removeItem(LS_KEYS.openrouter)
    }
    // モデルも保存
    saveModel('claude', claudeModel)
    saveModel('gemini', geminiModel)
    saveModel('openai', openaiModel)
    showToast("APIキー・モデルを保存しました")
  }, [claudeKey, geminiKey, openaiKey, ideogramKey, openrouterKey, claudeModel, geminiModel, openaiModel, showToast])

  const handleBulkExport = async () => {
    setIsExporting(true)
    try {
      const { user, error } = await getClientUser(supabase)
      if (error) {
        alert("認証状態の確認に失敗しました。もう一度お試しください。")
        return
      }
      if (!user) {
        window.location.href = "/login?next=/settings"
        return
      }

      const userId = user.id
      const exportedAt = new Date().toISOString()

      const [
        { data: threads, error: threadsError },
        { data: messages, error: messagesError },
        { data: tags, error: tagsError },
        { data: notes, error: notesError },
        { data: messageNotes, error: messageNotesError },
        { data: drafts, error: draftsError },
        { data: profiles, error: profilesError },
        { data: likes, error: likesError },
      ] = await Promise.all([
        supabase.from("threads").select("*").eq("user_id", userId),
        supabase.from("messages").select("*").eq("user_id", userId),
        supabase.from("thread_tags").select("*").eq("user_id", userId),
        supabase.from("thread_notes").select("*").eq("user_id", userId),
        supabase.from("message_notes").select("*").eq("user_id", userId),
        supabase.from("drafts").select("*").eq("user_id", userId),
        supabase.from("profiles").select("*").eq("id", userId),
        supabase.from("likes").select("*").eq("user_id", userId),
      ])

      const queryErrors = [
        { name: "threads", error: threadsError },
        { name: "messages", error: messagesError },
        { name: "thread_tags", error: tagsError },
        { name: "thread_notes", error: notesError },
        { name: "message_notes", error: messageNotesError },
        { name: "drafts", error: draftsError },
        { name: "profiles", error: profilesError },
        { name: "likes", error: likesError },
      ]

      const failedQuery = queryErrors.find(({ error }) => error)

      if (failedQuery) {
        console.error(`[bulk-export] ${failedQuery.name} query failed:`, failedQuery.error?.message)
        alert("エクスポートに失敗しました。もう一度お試しください。")
        return
      }

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

  const handleBatchTrain = async () => {
    if (!openaiKey) return
    setIsBatchTraining(true)
    setBatchTrainResult(null)
    try {
      const res = await fetch('/api/lore/batch-train', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-openai-api-key': openaiKey,
        },
        body: JSON.stringify({ limit: 5 }),
      })
      if (!res.ok) throw new Error('batch-train failed')
      const json = await res.json()
      setBatchTrainResult(json)
    } catch (err) {
      console.error('[batch-train]', err)
      setBatchTrainResult(null)
      alert('記憶化に失敗しました。')
    } finally {
      setIsBatchTraining(false)
    }
  }

  useEffect(() => {
    const init = async () => {
      const { user } = await getClientUser(supabase)
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
              英字始まり・英数字 / _ / - のみ・{HANDLE_MIN_LENGTH}〜{HANDLE_MAX_LENGTH}文字
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
              APIキー・モデル設定
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              キーはこのブラウザのLocalStorageに保存されます。AI機能の利用時には、選択したAIプロバイダーへリクエストを中継するため、暗号化された通信を通じてKabeHubのサーバーへ一時的に送信されます。KabeHubはAPIキーをアプリケーションのデータベースへ永続保存せず、アプリケーションログへ意図的に記録しません。
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
              {/* Claudeモデル選択 */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-gray-500">デフォルトモデル：</span>
                {MODEL_CONFIG.claude.models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setClaudeModel(m.id)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      claudeModel === m.id
                        ? 'border-orange-500/60 bg-orange-500/10 text-orange-300'
                        : 'border-gray-700 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {m.label}
                    <span className="ml-1 opacity-60">{m.badge === '高性能' ? '↑' : ''}</span>
                  </button>
                ))}
              </div>
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
              {/* Geminiモデル選択 */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-gray-500">デフォルトモデル：</span>
                {MODEL_CONFIG.gemini.models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setGeminiModel(m.id)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      geminiModel === m.id
                        ? 'border-orange-500/60 bg-orange-500/10 text-orange-300'
                        : 'border-gray-700 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {m.label}
                    <span className="ml-1 opacity-60">{m.badge === '高性能' ? '↑' : ''}</span>
                  </button>
                ))}
              </div>
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
              {/* OpenAIモデル選択 */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-gray-500">デフォルトモデル：</span>
                {MODEL_CONFIG.openai.models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setOpenaiModel(m.id)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      openaiModel === m.id
                        ? 'border-orange-500/60 bg-orange-500/10 text-orange-300'
                        : 'border-gray-700 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {m.label}
                    <span className="ml-1 opacity-60">{m.badge === '高性能' ? '↑' : ''}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Ideogram */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400">
                Ideogram
              </label>
              <div className="flex gap-2">
                <input
                  type={showIdeogramKey ? 'text' : 'password'}
                  value={ideogramKey}
                  onChange={e => setIdeogramKey(e.target.value)}
                  placeholder="APIキーを入力"
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                />
                <button
                  onClick={() => setShowIdeogramKey(v => !v)}
                  className="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg transition-colors"
                >
                  {showIdeogramKey ? '隠す' : '表示'}
                </button>
              </div>
              {ideogramKey && !showIdeogramKey && (
                <p className="text-xs text-gray-600 font-mono">{maskKey(ideogramKey)}</p>
              )}
            </div>

            {/* OpenRouter (Flux 2 Pro) */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400">
                OpenRouter（Flux等）
                <span className="ml-2 text-gray-600 font-normal">sk-or-v1-... で始まるキー</span>
              </label>
              <div className="flex gap-2">
                <input
                  type={showOpenrouterKey ? 'text' : 'password'}
                  value={openrouterKey}
                  onChange={e => setOpenrouterKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                />
                <button
                  onClick={() => setShowOpenrouterKey(v => !v)}
                  className="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg transition-colors"
                >
                  {showOpenrouterKey ? '隠す' : '表示'}
                </button>
              </div>
              {openrouterKey && !showOpenrouterKey && (
                <p className="text-xs text-gray-600 font-mono">{maskKey(openrouterKey)}</p>
              )}
            </div>

            {/* 保存ボタン */}
            <div className="flex items-center gap-4 pt-1">
              <button
                onClick={handleSaveApiKeys}
                className="px-5 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
              >
                APIキー・モデルを保存
              </button>
            </div>
          </div>
        </section>

        {/* GitHub連携セクション */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
              GitHub連携
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              GitHubのrepo権限はKabeHubではファイルの読み取りにのみ使用します。
            </p>
          </div>

          <div className="border border-gray-800 rounded-xl p-5 space-y-5">
            {githubStatus?.connected ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-200">
                  ✅ @{githubStatus.github_login ?? 'GitHub'} と連携中
                </p>
                <button
                  onClick={handleDisconnectGithub}
                  disabled={githubDisconnecting}
                  className="px-4 py-2 bg-transparent border border-red-500/50 hover:bg-red-500/10 disabled:border-gray-700 disabled:text-gray-500 text-red-400 hover:text-red-300 rounded-lg text-sm transition-colors"
                >
                  {githubDisconnecting ? '解除中...' : '連携を解除する'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={handleConnectGithub}
                  disabled={githubLoading}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors"
                >
                  GitHubと連携する
                </button>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">プライベートリポジトリも読み込めます。</p>
                  <p className="text-xs text-gray-600">※repo権限はファイル読み取りにのみ使用します。</p>
                </div>
              </div>
            )}

            {githubMessage && (
              <p className={`text-sm ${githubMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {githubMessage.text}
              </p>
            )}
          </div>
        </section>

        {/* ClaudeCode連携セクション */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
              ClaudeCode連携
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              MCPトークンを発行すると、ClaudeCodeから壁打ちをKabeHubに保存・公開できます。
            </p>
          </div>

          <div className="border border-gray-800 rounded-xl p-5 space-y-5">

            {/* トークン発行フォーム */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400">トークン名（任意）</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTokenName}
                  onChange={e => setNewTokenName(e.target.value)}
                  placeholder="例: MacBook Pro"
                  maxLength={50}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <button
                  onClick={handleIssueToken}
                  disabled={issuingToken}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                >
                  {issuingToken ? '発行中...' : 'MCPトークンを発行する'}
                </button>
              </div>
            </div>

            {/* 発行直後の生トークン表示 */}
            {revealedToken && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold text-amber-400">
                  このトークンは一度しか表示されません。今すぐコピーしてください。
                </p>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-xs font-mono text-amber-200 bg-gray-900 rounded px-3 py-2 break-all">
                    {revealedToken}
                  </code>
                  <button
                    onClick={() => handleCopyToken(revealedToken)}
                    className="px-3 py-2 text-xs border border-amber-500/40 hover:bg-amber-500/10 text-amber-300 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {tokenCopied ? 'コピーしました！' : 'コピー'}
                  </button>
                </div>
              </div>
            )}

            {/* 発行済みトークン一覧 */}
            {mcpTokens.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-400">発行済みトークン</p>
                <div className="divide-y divide-gray-800">
                  {mcpTokens.map(token => (
                    <div key={token.id} className="flex items-center justify-between py-3">
                      <div className="space-y-0.5">
                        <p className="text-sm text-gray-200">{token.name ?? '（名前なし）'}</p>
                        <p className="text-xs text-gray-600">
                          発行: {new Date(token.created_at).toLocaleDateString('ja-JP')}
                          {token.last_used_at && (
                            <span className="ml-3">
                              最終使用: {new Date(token.last_used_at).toLocaleDateString('ja-JP')}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteToken(token.id)}
                        className="text-xs text-red-500 hover:text-red-400 border border-red-500/30 hover:border-red-500/60 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mcpTokens.length === 0 && !revealedToken && (
              <p className="text-xs text-gray-600">まだトークンが発行されていません。</p>
            )}
          </div>
        </section>

        {/* AI記憶（RAG）セクション */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
              AI記憶（RAG）
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              壁打ちの内容からAIが自動抽出した記憶を管理できます。
            </p>
          </div>
          <div className="border border-gray-800 rounded-xl p-5 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-200">会話を記憶化する</p>
              <p className="text-xs text-gray-500 mt-1">
                未学習の会話を最大20件、AIが要約してRAG記憶として保存します。
                対象: 全フォルダ。OpenAI APIキーが必要です。
              </p>
            </div>
            <button
              onClick={handleBatchTrain}
              disabled={isBatchTraining || !openaiKey}
              className={`px-4 py-2 rounded-lg text-sm transition-colors border ${
                isBatchTraining || !openaiKey
                  ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                  : 'bg-transparent border-gray-600 hover:bg-gray-800 text-gray-300 hover:text-gray-100 cursor-pointer'
              }`}
            >
              {isBatchTraining ? '⏳ 記憶化中...' : ' 未学習メッセージを記憶化'}
            </button>
            {batchTrainResult && (
              <p className="text-xs text-green-400">
                ✅ 完了: {batchTrainResult.insertedCount}件保存
                / {batchTrainResult.processedCount - batchTrainResult.insertedCount}件スキップ
              </p>
            )}
            {!openaiKey && (
              <p className="text-xs text-gray-600">
                ※ OpenAI APIキーを設定・保存すると使用できます
              </p>
            )}
            <hr className="border-gray-800" />
            <button
              onClick={() => router.push("/memory")}
              className="px-4 py-2 rounded-lg text-sm border border-gray-600 hover:bg-gray-800 text-gray-300"
            >
              AI記憶を管理する →
            </button>
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

        {/* UI設定セクション */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
            UI設定
          </h2>
          <div className="border border-gray-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-200">履歴ナビゲーションを常時展開</p>
                <p className="text-xs text-gray-500 mt-1">
                  ONにすると、会話画面の右端に目次形式の履歴パネルを常に表示します。
                  OFFでも右端のインジケータードットは表示されます。
                </p>
              </div>
              <button
                onClick={() => {
                  const next = localStorage.getItem('kabehub_nav_expanded_always') !== 'true'
                  localStorage.setItem('kabehub_nav_expanded_always', String(next))
                  setNavAlwaysOn(next)
                }}
                className="ml-6 relative"
                style={{ width: 48, height: 24, borderRadius: 12, background: navAlwaysOn ? '#2563eb' : '#374151', border: 'none', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: navAlwaysOn ? 27 : 3,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'white',
                    transition: 'left 0.2s',
                    display: 'block',
                  }}
                />
              </button>
            </div>

            <div className="space-y-3 border-t border-gray-800 pt-4">
              <div>
                <p className="text-sm font-medium text-gray-200">フォントサイズ</p>
                <p className="text-xs text-gray-500 mt-1">
                  チャット本文・Markdown本文・入力欄の文字サイズを調整します。
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0.8}
                  max={1.5}
                  step={0.05}
                  value={fontScale}
                  onChange={e => updateFontScale(parseFloat(e.target.value))}
                  className="flex-1 accent-blue-500"
                />
                <span className="w-12 text-right text-xs text-gray-500">
                  {Math.round(fontScale * 100)}%
                </span>
              </div>
              <button
                onClick={() => updateFontScale(1)}
                className="px-3 py-2 rounded-lg text-xs border border-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
              >
                標準に戻す
              </button>
            </div>

            {/* 送信キー設定 */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400">
                送信キー設定（PC）
              </label>
              <div className="flex flex-col gap-2">
                {[
                  { value: 'send' as const, label: 'Enter で送信 / Shift+Enter で改行' },
                  { value: 'newline' as const, label: 'Enter で改行 / Ctrl・⌘+Enter で送信' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      localStorage.setItem('kabehub_enter_mode', opt.value)
                      setEnterMode(opt.value)
                    }}
                    className={`px-3 py-2 rounded-lg text-xs border text-left transition-colors ${
                      enterMode === opt.value
                        ? 'border-orange-500/60 bg-orange-500/10 text-orange-300'
                        : 'border-gray-700 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600">
                スマホでは常に Enter = 改行・送信ボタンで送信されます
              </p>
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

                setIsDeletingAccount(true)
                try {
                  const response = await fetch('/api/account', { method: 'DELETE' })
                  if (!response.ok) throw new Error('Account deletion request failed')

                  try {
                    const { error: signOutError } = await supabase.auth.signOut()
                    if (signOutError) {
                      console.error('[handleDeleteAccount] signOut failed:', signOutError.message)
                      alert(
                        'アカウントの削除は完了しました。ログアウト処理の一部に失敗しましたが、ログイン画面へ移動します。'
                      )
                    }
                  } catch (signOutException) {
                    console.error('[handleDeleteAccount] signOut threw unexpectedly:', signOutException)
                    alert(
                      'アカウントの削除は完了しました。ログアウト処理の一部に失敗しましたが、ログイン画面へ移動します。'
                    )
                  } finally {
                    window.location.replace('/login')
                  }
                } catch (err) {
                  console.error('アカウント削除に失敗しました', err)
                  alert('アカウント削除に失敗しました。時間をおいて再度お試しください。')
                } finally {
                  setIsDeletingAccount(false)
                }
              }}
              disabled={isDeletingAccount}
              className="px-4 py-2 bg-transparent border border-red-500/50 hover:bg-red-500/10 disabled:border-gray-700 disabled:text-gray-500 text-red-400 hover:text-red-300 rounded-lg text-sm transition-colors"
            >
              {isDeletingAccount ? '削除中...' : 'アカウントを削除する'}
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
