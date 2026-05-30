export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
]
const ALLOWED_IDEOGRAM_MODELS = ['ideogram-v3']
const ALLOWED_OPENROUTER_MODELS = ['black-forest-labs/flux.2-pro']

type ImageResult = { imageData: string; mimeType: string }

async function handleGemini(req: NextRequest, prompt: string, modelId: string | undefined): Promise<NextResponse> {
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

  const result: ImageResult = {
    imageData: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  }
  return NextResponse.json(result)
}

async function handleOpenAI(req: NextRequest, prompt: string): Promise<NextResponse> {
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

  const result: ImageResult = { imageData: b64, mimeType: 'image/png' }
  return NextResponse.json(result)
}

async function handleIdeogram(req: NextRequest, prompt: string): Promise<NextResponse> {
  const apiKey = req.headers.get('x-ideogram-api-key')
  if (!apiKey) {
    return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 400 })
  }

  const formData = new FormData()
  formData.append('prompt', prompt)
  formData.append('rendering_speed', 'TURBO')
  formData.append('style_type', 'AUTO')

  const res = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
    method: 'POST',
    headers: { 'Api-Key': apiKey },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `Ideogram API エラー: ${err}` }, { status: res.status })
  }

  const data = await res.json()
  const imageUrl = data?.data?.[0]?.url
  if (!imageUrl) {
    return NextResponse.json({ error: '画像データが返ってきませんでした' }, { status: 500 })
  }

  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) {
    return NextResponse.json({ error: '画像の取得に失敗しました' }, { status: 500 })
  }

  const arrayBuffer = await imgRes.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'

  const result: ImageResult = { imageData: base64, mimeType: contentType }
  return NextResponse.json(result)
}

async function handleOpenRouter(req: NextRequest, prompt: string): Promise<NextResponse> {
  const apiKey = req.headers.get('x-openrouter-api-key')
  if (!apiKey) {
    return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 400 })
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'black-forest-labs/flux.2-pro',
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image'],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `OpenRouter API エラー: ${err}` }, { status: res.status })
  }

  const data = await res.json()
  const imageDataUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url
  if (!imageDataUrl) {
    return NextResponse.json({ error: '画像データが返ってきませんでした' }, { status: 500 })
  }

  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
  const mimeType = imageDataUrl.match(/^data:(\w+\/\w+);/)?.[1] ?? 'image/png'

  const result: ImageResult = { imageData: base64, mimeType }
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const { provider, prompt, modelId } = await req.json()

  switch (provider) {
    case 'gemini':     return handleGemini(req, prompt, modelId)
    case 'openai':     return handleOpenAI(req, prompt)
    case 'ideogram':   return handleIdeogram(req, prompt)
    case 'openrouter': return handleOpenRouter(req, prompt)
    default:           return NextResponse.json({ error: '不正なproviderです' }, { status: 400 })
  }
}

