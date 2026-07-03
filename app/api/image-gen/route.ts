export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler'
import { downloadImageAsBase64 } from '@/lib/supabase/download-image'
import { isOwnedStoragePath } from '@/lib/storage-path-guard'

const ALLOWED_GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
]
const ALLOWED_IDEOGRAM_MODELS = ['ideogram-v3']
const ALLOWED_OPENROUTER_MODELS = ['black-forest-labs/flux.2-pro']

type ImageResult = { imageData: string; mimeType: string }
type HandlerResult = { result: ImageResult; error: null } | { result: null; error: string }
type ImageInput = { base64: string; mimeType: string }

async function handleGemini(req: NextRequest, prompt: string, modelId: string | undefined, imageInput?: ImageInput): Promise<HandlerResult> {
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
    contents: [{
      parts: [
        ...(imageInput ? [{ inlineData: { mimeType: imageInput.mimeType, data: imageInput.base64 } }] : []),
        { text: prompt },
      ],
    }],
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

async function handleOpenAI(req: NextRequest, prompt: string, imageInput?: ImageInput): Promise<HandlerResult> {
  if (imageInput) {
    return { result: null, error: 'OpenAIはimg2imgに非対応です' }
  }
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

async function handleIdeogram(req: NextRequest, prompt: string, imageInput?: ImageInput): Promise<HandlerResult> {
  const apiKey = req.headers.get('x-ideogram-api-key')
  if (!apiKey) {
    return { result: null, error: 'APIキーが設定されていません' }
  }

  const formData = new FormData()
  formData.append('prompt', prompt)
  formData.append('rendering_speed', 'TURBO')
  formData.append('style_type', 'AUTO')

  let endpoint = 'https://api.ideogram.ai/v1/ideogram-v3/generate'
  if (imageInput) {
    const buffer = Buffer.from(imageInput.base64, 'base64')
    const blob = new Blob([buffer], { type: imageInput.mimeType })
    formData.append('image', blob, 'base_image.png')
    formData.append('image_weight', '90')
    endpoint = 'https://api.ideogram.ai/v1/ideogram-v3/remix'
  }

  const res = await fetch(endpoint, {
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
  const { provider, prompt, modelId, threadId, imageRefId, imageRefUpload } = await req.json()

  if (imageRefId && !threadId) {
    return NextResponse.json({ error: 'imageRefIdを使用する場合はthreadIdが必要です' }, { status: 400 })
  }

  // 認証を処理の先頭に移動：threadIdの有無にかかわらず、外部AI APIを呼ぶ前に本人確認を済ませる
  const supabaseRes = NextResponse.next()
  const supabase = createRouteHandlerSupabaseClient(req, supabaseRes)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  const userId = user.id

  // thread所有確認も先頭に移動：外部AI APIを呼ぶ前にthreadIdが本人所有か確認する
  if (threadId) {
    const { data: thread, error: threadError } = await supabase
      .from('threads')
      .select('id')
      .eq('id', threadId)
      .eq('user_id', userId)
      .single()

    if (threadError || !thread) {
      return NextResponse.json({ error: 'スレッドが見つかりません' }, { status: 404 })
    }
  }

  let imageInput: ImageInput | undefined

  if (imageRefId) {
    const { data: refMessage, error: refError } = await supabase
      .from('messages')
      .select('metadata')
      .eq('id', imageRefId)
      .eq('user_id', userId)
      .single()

    const refStoragePath = refMessage?.metadata?.storagePath
    if (refError || !isOwnedStoragePath(refStoragePath, userId)) {
      return NextResponse.json({ error: '参照画像が見つかりません' }, { status: 404 })
    }

    const downloaded = await downloadImageAsBase64(supabase, refStoragePath)
    if (!downloaded) {
      return NextResponse.json({ error: '参照画像のダウンロードに失敗しました' }, { status: 500 })
    }

    imageInput = {
      base64: downloaded.base64,
      mimeType: (refMessage?.metadata?.mimeType as string) || downloaded.mimeType,
    }
  } else if (imageRefUpload) {
    imageInput = {
      base64: imageRefUpload.base64,
      mimeType: imageRefUpload.mimeType,
    }
  }

  let handlerResult: HandlerResult
  switch (provider) {
    case 'gemini':     handlerResult = await handleGemini(req, prompt, modelId, imageInput); break
    case 'openai':     handlerResult = await handleOpenAI(req, prompt, imageInput); break
    case 'ideogram':   handlerResult = await handleIdeogram(req, prompt, imageInput); break
    case 'openrouter': handlerResult = await handleOpenRouter(req, prompt); break
    default:           return NextResponse.json({ error: '不正なproviderです' }, { status: 400 })
  }

  if (handlerResult.error !== null) {
    return NextResponse.json({ error: handlerResult.error }, { status: 500 })
  }

  const { imageData, mimeType } = handlerResult.result

  // threadId なし → 従来通り imageData/mimeType のみ返す（認証は先頭で確認済み）
  if (!threadId) {
    return NextResponse.json({ imageData, mimeType })
  }

  // threadId は先頭で本人所有を確認済み。Storage アップロード → DB保存へ進む
  const storagePath = `${userId}/${threadId}/${crypto.randomUUID()}.png`

  const buffer = Buffer.from(imageData, 'base64')
  const { error: uploadError, data: uploadData } = await supabase.storage
    .from('generated-images')
    .upload(storagePath, buffer, { contentType: mimeType })

  if (uploadError) {
    return NextResponse.json({ error: `Storage アップロード失敗: ${uploadError.message}` }, { status: 500 })
  }

  // TODO: sharp による WebP 圧縮対応（現在は未圧縮のままアップロード）

  const actualPath = uploadData?.path ?? storagePath
  const { data: message, error: dbError } = await supabase
    .from('messages')
    .insert({
      thread_id: threadId,
      user_id: userId,
      role: 'assistant',
      provider: 'image_gen',
      content: prompt,
      metadata: {
        storagePath: actualPath,
        mimeType: mimeType,
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

  return NextResponse.json({ messageId: message.id, storagePath: actualPath, imageData, mimeType })
}
