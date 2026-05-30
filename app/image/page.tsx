'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const LS_KEYS = {
  gemini: 'kabehub_gemini_key',
  openai: 'kabehub_openai_key',
} as const

type Provider = 'gemini' | 'openai'

const GEMINI_IMAGE_MODELS = [
  { id: 'gemini-2.5-flash-image', label: '2.5 Flash Image', badge: '既存' },
  { id: 'gemini-3.1-flash-image', label: '3.1 Flash Image', badge: '新' },
  { id: 'gemini-3-pro-image',     label: '3 Pro Image',     badge: '高性能' },
]

export default function ImageGenPage() {
  const router = useRouter()
  const [provider, setProvider] = useState<Provider>('gemini')
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash-image')
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const prevObjectUrl = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (prevObjectUrl.current) URL.revokeObjectURL(prevObjectUrl.current)
    }
  }, [])

  const handleGenerate = async () => {
    setError(null)

    const apiKey = localStorage.getItem(LS_KEYS[provider]) ?? ''
    if (!apiKey) {
      setError(`${provider === 'gemini' ? 'Gemini' : 'OpenAI'} の APIキーが設定されていません。設定ページで登録してください。`)
      return
    }

    if (prevObjectUrl.current) {
      URL.revokeObjectURL(prevObjectUrl.current)
      prevObjectUrl.current = null
      setObjectUrl(null)
    }

    setIsLoading(true)

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (provider === 'gemini') headers['x-gemini-api-key'] = apiKey
      if (provider === 'openai') headers['x-openai-api-key'] = apiKey

      const res = await fetch('/api/image-gen', {
        method: 'POST',
        headers,
        body: JSON.stringify({ provider, prompt, modelId: provider === 'gemini' ? geminiModel : undefined }),
      })

      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? '生成に失敗しました')
        return
      }

      const binary = atob(json.imageData)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: json.mimeType })
      const url = URL.createObjectURL(blob)
      prevObjectUrl.current = url
      setObjectUrl(url)
    } catch (e) {
      setError(String(e))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
      {/* ヘッダー */}
      <div style={{ borderBottom: '1px solid #1f2937', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => router.push('/')}
          style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '14px', padding: '4px 8px', borderRadius: '6px' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1f2937')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          ← ホームに戻る
        </button>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>🎨 画像生成</h1>
      </div>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* プロバイダー選択 */}
        <div>
          <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '8px' }}>モデル</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['gemini', 'openai'] as Provider[]).map(p => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: provider === p ? '1px solid #6366f1' : '1px solid #374151',
                  background: provider === p ? '#1e1b4b' : '#111827',
                  color: provider === p ? '#a5b4fc' : '#9ca3af',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: provider === p ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {p === 'gemini' ? '✦ Gemini' : '⬡ OpenAI'}
              </button>
            ))}
          </div>
          {/* Gemini サブモデル選択 */}
          {provider === 'gemini' && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              {GEMINI_IMAGE_MODELS.map(m => (
                <button
                  key={m.id}
                  onClick={() => setGeminiModel(m.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: geminiModel === m.id ? '1px solid #6366f1' : '1px solid #374151',
                    background: geminiModel === m.id ? '#1e1b4b' : '#111827',
                    color: geminiModel === m.id ? '#a5b4fc' : '#9ca3af',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: geminiModel === m.id ? 600 : 400,
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {m.label}
                  <span style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: m.badge === '新' ? '#14532d' : m.badge === '高性能' ? '#312e81' : '#1f2937',
                    color: m.badge === '新' ? '#86efac' : m.badge === '高性能' ? '#c7d2fe' : '#6b7280',
                  }}>
                    {m.badge}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '6px' }}>
            {provider === 'gemini' ? geminiModel : 'gpt-image-2'}
          </div>
        </div>

        {/* プロンプト入力 */}
        <div>
          <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '8px' }}>プロンプト</div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="日本語・英語どちらでも入力できます。例: 夕暮れの海辺を歩く猫、水彩画風"
            rows={4}
            style={{
              width: '100%',
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#f3f4f6',
              fontSize: '14px',
              padding: '12px',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
              lineHeight: 1.6,
            }}
            onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
            onBlur={e => (e.currentTarget.style.borderColor = '#374151')}
          />
        </div>

        {/* 生成ボタン */}
        <button
          onClick={handleGenerate}
          disabled={isLoading || !prompt.trim()}
          style={{
            padding: '12px',
            borderRadius: '8px',
            border: 'none',
            background: isLoading || !prompt.trim() ? '#374151' : '#4f46e5',
            color: isLoading || !prompt.trim() ? '#6b7280' : '#fff',
            fontSize: '15px',
            fontWeight: 600,
            cursor: isLoading || !prompt.trim() ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {isLoading ? '生成中...' : '🎨 生成する'}
        </button>

        {/* エラー表示 */}
        {error && (
          <div style={{ background: '#1f0f0f', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '12px 16px', color: '#fca5a5', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {/* 画像プレビュー */}
        {objectUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <img
              src={objectUrl}
              alt="生成された画像"
              style={{ width: '100%', borderRadius: '12px', border: '1px solid #1f2937' }}
            />
            <a
              href={objectUrl}
              download="kabehub-image.png"
              style={{
                display: 'inline-block',
                textAlign: 'center',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #374151',
                background: '#111827',
                color: '#9ca3af',
                fontSize: '14px',
                textDecoration: 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1f2937'; e.currentTarget.style.color = '#f3f4f6' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#111827'; e.currentTarget.style.color = '#9ca3af' }}
            >
              ⬇ ダウンロード
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
