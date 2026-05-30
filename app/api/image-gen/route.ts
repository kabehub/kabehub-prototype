export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
]

export async function POST(req: NextRequest) {
  const { provider, prompt, modelId } = await req.json()

  if (provider === 'gemini') {
    const apiKey = req.headers.get('x-gemini-api-key')
    if (!apiKey) {
      return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 400 })
    }

    const geminiModel = modelId ?? 'gemini-2.5-flash-image'
    if (!ALLOWED_GEMINI_IMAGE_MODELS.includes(geminiModel)) {
      return NextResponse.json({ error: '不正なモデルIDです' }, { status: 400 })
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `Gemini API エラー: ${err}` }, { status: res.status })
    }

    const data = await res.json()
    const parts = data?.candidates?.[0]?.content?.parts ?? []
    const imagePart = parts.find((p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData)
    if (!imagePart) {
      return NextResponse.json({ error: '画像データが返ってきませんでした' }, { status: 500 })
    }

    return NextResponse.json({
      imageData: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType,
    })
  }

  if (provider === 'openai') {
    const apiKey = req.headers.get('x-openai-api-key')
    if (!apiKey) {
      return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 400 })
    }

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt,
        n: 1,
        size: '1024x1024',
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `OpenAI API エラー: ${err}` }, { status: res.status })
    }

    const data = await res.json()
    const b64 = data?.data?.[0]?.b64_json
    if (!b64) {
      return NextResponse.json({ error: '画像データが返ってきませんでした' }, { status: 500 })
    }

    return NextResponse.json({ imageData: b64, mimeType: 'image/png' })
  }

  return NextResponse.json({ error: '不正なproviderです' }, { status: 400 })
}
