export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler'

const ALLOWED_GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
]
const ALLOWED_IDEOGRAM_MODELS = ['ideogram-v3']
const ALLOWED_OPENROUTER_MODELS = ['black-forest-labs/flux.2-pro']

type ImageResult = { imageData: string; mimeType: string }
type HandlerResult = { result: ImageResult; error: null } | { result: null; error: string }

async function handleGemini(req: NextRequest, prompt: string, modelId: string | undefined): Promise<HandlerResult> {
  const apiKey = req.headers.get('x-gemini-api-key')
  if (!apiKey) {
    return { result: null, error: 'APIキーが設定されていません' }
  }

  const geminiModel = modelId ?? 'gemini-2.5-flash-image'
  if (!ALLOWED_GEMINI_IMAGE_MODELS.includes(geminiModel)) {
    return { result: null, error: '不正なモデルIDです' }
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
    return { result: null, error: `Gemini API エラー: ${err}` }
  }

  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData)
  if (!imagePart) {
    return { result: null, error: '画像データが返ってきませんでした' }
  }

  return {
    result: {
      imageData: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType,
    },
    error: null,
  }
}

async function handleOpenAI(req: NextRequest, prompt: string): Promise<HandlerResult> {
  const apiKey = req.headers.get('x-openai-api-key')
  if (!apiKey) {
    return { result: null, error: 'APIキーが設定されていません' }
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
    return { result: null, error: `OpenAI API エラー: ${err}` }
  }

  const data = await res.json()
  const b64 = data?.data?.[0]?.b64_json
  if (!b64) {
    return { result: null, error: '画像データが返ってきませんでした' }
  }

  return { result: { imageData: b64, mimeType: 'image/png' }, error: null }
}

async function handleIdeogram(req: NextRequest, prompt: string): Promise<HandlerResult> {
  const apiKey = req.headers.get('x-ideogram-api-key')
  if (!apiKey) {
    return { result: null, error: 'APIキーが設定されていません' }
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
    return { result: null, error: `Ideogram API エラー: ${err}` }
  }

  const data = await res.json()
  const imageUrl = data?.data?.[0]?.url
  if (!imageUrl) {
    return { result: null, error: '画像データが返ってきませんでした' }
  }

  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) {
    return { result: null, error: '画像の取得に失敗しました' }
  }

  const arrayBuffer = await imgRes.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'

  return { result: { imageData: base64, mimeType: contentType }, error: null }
}

async function handleOpenRouter(req: NextRequest, prompt: string): Promise<HandlerResult> {
  const apiKey = req.headers.get('x-openrouter-api-key')
  if (!apiKey) {
    return { result: null, error: 'APIキーが設定されていません' }
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
    return { result: null, error: `OpenRouter API エラー: ${err}` }
  }

  const data = await res.json()
  const imageDataUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url
  if (!imageDataUrl) {
    return { result: null, error: '画像データが返ってきませんでした' }
  }

  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
  const mimeType = imageDataUrl.match(/^data:(\w+\/\w+);/)?.[1] ?? 'image/png'

  return { result: { imageData: base64, mimeType }, error: null }
}

export async function POST(req: NextRequest) {
  const { provider, prompt, modelId, threadId } = await req.json()

  let handlerResult: HandlerResult
  switch (provider) {
    case 'gemini':     handlerResult = await handleGemini(req, prompt, modelId); break
    case 'openai':     handlerResult = await handleOpenAI(req, prompt); break
    case 'ideogram':   handlerResult = await handleIdeogram(req, prompt); break
    case 'openrouter': handlerResult = await handleOpenRouter(req, prompt); break
    default:           return NextResponse.json({ error: '不正なproviderです' }, { status: 400 })
  }

  if (handlerResult.error !== null) {
    return NextResponse.json({ error: handlerResult.error }, { status: 500 })
  }

  const { imageData, mimeType } = handlerResult.result

  // threadId なし → 従来通り imageData/mimeType のみ返す
  if (!threadId) {
    return NextResponse.json({ imageData, mimeType })
  }

  // threadId あり → 認証チェック → Storage アップロード → DB保存
  const nextRes = NextResponse.next()
  const supabase = createRouteHandlerSupabaseClient(req, nextRes)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const userId = user.id
  const storagePath = `${userId}/${threadId}/${crypto.randomUUID()}.png`

  const buffer = Buffer.from(imageData, 'base64')
  console.log("uploading to storagePath:", storagePath)
  const { error: uploadError } = await supabase.storage
    .from('generated-images')
    .upload(storagePath, buffer, { contentType: mimeType })

  if (uploadError) {
    return NextResponse.json({ error: `Storage アップロード失敗: ${uploadError.message}` }, { status: 500 })
  }

  // TODO: sharp による WebP 圧縮対応（現在は未圧縮のままアップロード）

  const { data: message, error: dbError } = await supabase
    .from('messages')
    .insert({
      thread_id: threadId,
      user_id: userId,
      role: 'assistant',
      provider: 'image_gen',
      content: prompt,
      metadata: {
        storagePath,
        mimeType,
        image_deleted: false,
        width: null,
        height: null,
        seed: null,
      },
    })
    .select('id')
    .single()

  if (dbError) {
    return NextResponse.json({ error: `DB保存失敗: ${dbError.message}` }, { status: 500 })
  }

  return NextResponse.json({ messageId: message.id, storagePath, imageData, mimeType })
}
