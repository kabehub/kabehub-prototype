export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireRouteUser } from '@/lib/supabase/route-auth'
import { downloadImageAsBase64 } from '@/lib/supabase/download-image'
import { isOwnedStoragePath } from '@/lib/storage-path-guard'
import { getDefaultImageModel, isAllowedImageModel } from '@/lib/modelRegistry'
import * as logger from '@/lib/logger'
import { calculateImageUsageCost, recordUsageEvent, type ImageUsage, type UsageEventStatus } from '@/lib/aiUsage'
import { serviceRoleClient } from '@/lib/mcp-auth'

type ImageResult = { imageData: string; mimeType: string }
type ImageProvider = 'gemini' | 'openai' | 'ideogram' | 'openrouter'
type HandlerResult =
  | { result: ImageResult; error: null; modelId: string; usage: ImageUsage; requestAttempted: true }
  | { result: null; error: string; provider: ImageProvider; status: number; modelId: string | null; requestAttempted: boolean }
type ImageInput = { base64: string; mimeType: string }

const PROVIDER_LABELS: Record<ImageProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  ideogram: 'Ideogram',
  openrouter: 'OpenRouter',
}

function handlerError(
  provider: ImageProvider,
  error: string,
  status: number,
  modelId: string | null = null,
  requestAttempted: boolean = false,
): HandlerResult {
  return { result: null, error, provider, status, modelId, requestAttempted }
}

function upstreamError(provider: ImageProvider, status: number, modelId: string): HandlerResult {
  logger.externalApiFailed({
    service: logger.toExternalService(provider),
    status,
    errorCode: 'UPSTREAM_API_ERROR',
  })
  return handlerError(
    provider,
    `${PROVIDER_LABELS[provider]} APIへのリクエストに失敗しました`,
    status,
    modelId,
    true,
  )
}

function modalityTokens(
  details: unknown,
  modality: 'TEXT' | 'IMAGE',
): number | null {
  if (!Array.isArray(details)) return null
  const entry = details.find((item) =>
    typeof item === 'object' &&
    item !== null &&
    String((item as { modality?: unknown }).modality ?? '').toUpperCase() === modality
  ) as { tokenCount?: unknown } | undefined
  return typeof entry?.tokenCount === 'number' ? entry.tokenCount : null
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

async function handleGemini(req: NextRequest, prompt: string, modelId: string | undefined, imageInput?: ImageInput): Promise<HandlerResult> {
  const apiKey = req.headers.get('x-gemini-api-key')
  if (!apiKey) {
    return handlerError('gemini', 'APIキーが設定されていません', 400)
  }

  const geminiModel = modelId ?? getDefaultImageModel('gemini')
  if (!geminiModel) {
    return handlerError('gemini', '画像生成モデルが設定されていません', 500)
  }
  if (!isAllowedImageModel('gemini', geminiModel)) {
    return handlerError('gemini', '不正なモデルIDです', 400, geminiModel)
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`
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
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
    signal: req.signal,
  })

  if (!res.ok) {
    return upstreamError('gemini', res.status, geminiModel)
  }

  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData)
  if (!imagePart) {
    return handlerError('gemini', 'Gemini APIから画像データが返されませんでした', 502, geminiModel, true)
  }

  const usageMetadata = data?.usageMetadata
  const candidates = usageMetadata?.candidatesTokenCount
  const thoughts = usageMetadata?.thoughtsTokenCount
  const textOutputTokens = modalityTokens(usageMetadata?.candidatesTokensDetails, 'TEXT')

  return {
    result: {
      imageData: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType,
    },
    error: null,
    modelId: geminiModel,
    requestAttempted: true,
    usage: {
      inputTokens: usageMetadata?.promptTokenCount ?? null,
      outputTokens: candidates == null && thoughts == null
        ? null
        : (candidates ?? 0) + (thoughts ?? 0),
      textInputTokens: modalityTokens(usageMetadata?.promptTokensDetails, 'TEXT'),
      imageInputTokens: modalityTokens(usageMetadata?.promptTokensDetails, 'IMAGE'),
      textOutputTokens: textOutputTokens == null && thoughts == null
        ? null
        : (textOutputTokens ?? 0) + (thoughts ?? 0),
      imageOutputTokens: modalityTokens(usageMetadata?.candidatesTokensDetails, 'IMAGE'),
      imageCount: 1,
    },
  }
}

async function handleOpenAI(req: NextRequest, prompt: string, imageInput?: ImageInput): Promise<HandlerResult> {
  if (imageInput) {
    return handlerError('openai', 'OpenAIはimg2imgに非対応です', 400)
  }
  const apiKey = req.headers.get('x-openai-api-key')
  if (!apiKey) {
    return handlerError('openai', 'APIキーが設定されていません', 400)
  }

  const openaiModel = getDefaultImageModel('openai')
  if (!openaiModel) {
    return handlerError('openai', '画像生成モデルが設定されていません', 500)
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: openaiModel,
      prompt,
      n: 1,
      size: '1024x1024',
    }),
    signal: req.signal,
  })

  if (!res.ok) {
    return upstreamError('openai', res.status, openaiModel)
  }

  const data = await res.json()
  const b64 = data?.data?.[0]?.b64_json
  if (!b64) {
    return handlerError('openai', 'OpenAI APIから画像データが返されませんでした', 502, openaiModel, true)
  }

  // GPT Image 2 の公式リファレンスにはレスポンスusage内訳の完全なschemaが
  // 掲載されていないため、実運用例のprompt/completion名と従来Images APIの
  // input/output名の両方を受け付ける。どちらも無ければcostはunavailableになる。
  const responseUsage = data?.usage
  const promptDetails = responseUsage?.prompt_tokens_details ?? responseUsage?.input_tokens_details
  const completionDetails = responseUsage?.completion_tokens_details ?? responseUsage?.output_tokens_details
  const inputTokens = responseUsage?.prompt_tokens ?? responseUsage?.input_tokens ?? null
  const outputTokens = responseUsage?.completion_tokens ?? responseUsage?.output_tokens ?? null

  return {
    result: { imageData: b64, mimeType: 'image/png' },
    error: null,
    modelId: openaiModel,
    requestAttempted: true,
    usage: {
      inputTokens,
      outputTokens,
      textInputTokens: promptDetails?.text_tokens ?? null,
      imageInputTokens: promptDetails?.image_tokens ?? null,
      cachedImageInputTokens:
        promptDetails?.cached_image_tokens ??
        promptDetails?.image_cached_tokens ??
        promptDetails?.cached_tokens ??
        null,
      textOutputTokens: completionDetails?.text_tokens ?? null,
      imageOutputTokens: completionDetails?.image_tokens ?? outputTokens,
      imageCount: 1,
    },
  }
}

async function handleIdeogram(req: NextRequest, prompt: string, imageInput?: ImageInput): Promise<HandlerResult> {
  const apiKey = req.headers.get('x-ideogram-api-key')
  if (!apiKey) {
    return handlerError('ideogram', 'APIキーが設定されていません', 400)
  }

  const formData = new FormData()
  formData.append('prompt', prompt)
  formData.append('rendering_speed', 'TURBO')
  formData.append('style_type', 'AUTO')

  const ideogramModel = getDefaultImageModel('ideogram')
  if (!ideogramModel) {
    return handlerError('ideogram', '画像生成モデルが設定されていません', 500)
  }
  let endpoint = `https://api.ideogram.ai/v1/${ideogramModel}/generate`
  if (imageInput) {
    const buffer = Buffer.from(imageInput.base64, 'base64')
    const blob = new Blob([buffer], { type: imageInput.mimeType })
    formData.append('image', blob, 'base_image.png')
    formData.append('image_weight', '90')
    endpoint = `https://api.ideogram.ai/v1/${ideogramModel}/remix`
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Api-Key': apiKey },
    body: formData,
    signal: req.signal,
  })

  if (!res.ok) {
    return upstreamError('ideogram', res.status, ideogramModel)
  }

  const data = await res.json()
  const imageUrl = data?.data?.[0]?.url
  if (!imageUrl) {
    return handlerError('ideogram', 'Ideogram APIから画像データが返されませんでした', 502, ideogramModel, true)
  }

  const imgRes = await fetch(imageUrl, { signal: req.signal })
  if (!imgRes.ok) {
    return upstreamError('ideogram', imgRes.status, ideogramModel)
  }

  const arrayBuffer = await imgRes.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'

  return {
    result: { imageData: base64, mimeType: contentType },
    error: null,
    modelId: ideogramModel,
    requestAttempted: true,
    usage: {
      inputTokens: null,
      outputTokens: null,
      imageCount: 1,
    },
  }
}

async function handleOpenRouter(req: NextRequest, prompt: string): Promise<HandlerResult> {
  const apiKey = req.headers.get('x-openrouter-api-key')
  if (!apiKey) {
    return handlerError('openrouter', 'APIキーが設定されていません', 400)
  }

  const openrouterModel = getDefaultImageModel('openrouter')
  if (!openrouterModel) {
    return handlerError('openrouter', '画像生成モデルが設定されていません', 500)
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: openrouterModel,
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image'],
    }),
    signal: req.signal,
  })

  if (!res.ok) {
    return upstreamError('openrouter', res.status, openrouterModel)
  }

  const data = await res.json()
  const imageDataUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url
  if (!imageDataUrl) {
    return handlerError('openrouter', 'OpenRouter APIから画像データが返されませんでした', 502, openrouterModel, true)
  }

  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
  const mimeType = imageDataUrl.match(/^data:(\w+\/\w+);/)?.[1] ?? 'image/png'

  return {
    result: { imageData: base64, mimeType },
    error: null,
    modelId: openrouterModel,
    requestAttempted: true,
    usage: {
      inputTokens: data?.usage?.prompt_tokens ?? null,
      outputTokens: data?.usage?.completion_tokens ?? null,
      imageCount: 1,
      providerReportedCostUsd: finiteNumber(data?.usage?.cost),
    },
  }
}

export async function POST(req: NextRequest) {
  const { provider, prompt, modelId, threadId, imageRefId, imageRefUpload } = await req.json()

  if (imageRefId && !threadId) {
    return NextResponse.json({ error: 'imageRefIdを使用する場合はthreadIdが必要です' }, { status: 400 })
  }

  // 認証を処理の先頭に移動：threadIdの有無にかかわらず、外部AI APIを呼ぶ前に本人確認を済ませる
  const auth = await requireRouteUser(req)
  if (!auth.ok) return auth.response
  const { user, supabase, finalizeJson } = auth
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
      return finalizeJson({ error: 'スレッドが見つかりません' }, { status: 404 })
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
      return finalizeJson({ error: '参照画像が見つかりません' }, { status: 404 })
    }

    const downloaded = await downloadImageAsBase64(supabase, refStoragePath)
    if (!downloaded) {
      return finalizeJson({ error: '参照画像のダウンロードに失敗しました' }, { status: 500 })
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

  if (provider !== 'gemini' && provider !== 'openai' && provider !== 'ideogram' && provider !== 'openrouter') {
    return finalizeJson({ error: '不正なproviderです' }, { status: 400 })
  }
  const imageProvider = provider as ImageProvider

  const usageEventId = crypto.randomUUID()
  const pricedAt = new Date()
  const requestedModelId = imageProvider === 'gemini'
    ? modelId ?? getDefaultImageModel('gemini')
    : getDefaultImageModel(imageProvider)
  const emptyUsage: ImageUsage = { inputTokens: null, outputTokens: null }
  const persistImageUsage = async (
    resolvedModelId: string | null,
    usage: ImageUsage,
    status: UsageEventStatus,
    messageId: string | null,
  ) => {
    if (!resolvedModelId) return false
    const cost = calculateImageUsageCost(resolvedModelId, usage)
    try {
      return await recordUsageEvent(serviceRoleClient(), {
        id: usageEventId,
        userId,
        threadId: typeof threadId === 'string' ? threadId : null,
        messageId,
        provider: imageProvider,
        modelId: resolvedModelId,
        requestType: 'image_gen',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedImageInputTokens ?? null,
        imageCount: usage.imageCount ?? null,
        estimatedCostUsd: cost.estimatedCostUsd,
        costSource: cost.costSource,
        status,
        pricedAt,
      })
    } catch (err) {
      logger.dbOperationFailed({
        route: 'image-gen',
        operation: 'record-usage-event',
        table: 'ai_usage_events',
        errorType: err instanceof Error ? err.name : 'unknown',
      })
      return false
    }
  }

  let handlerResult: HandlerResult
  try {
    switch (imageProvider) {
      case 'gemini':     handlerResult = await handleGemini(req, prompt, modelId, imageInput); break
      case 'openai':     handlerResult = await handleOpenAI(req, prompt, imageInput); break
      case 'ideogram':   handlerResult = await handleIdeogram(req, prompt, imageInput); break
      case 'openrouter': handlerResult = await handleOpenRouter(req, prompt); break
      default:           return finalizeJson({ error: '不正なproviderです' }, { status: 400 })
    }
  } catch (err) {
    const failedProvider = imageProvider
    await persistImageUsage(
      typeof requestedModelId === 'string' ? requestedModelId : null,
      emptyUsage,
      req.signal.aborted || (err as Error).name === 'AbortError' ? 'aborted' : 'failed',
      null,
    )
    logger.externalApiFailed({
      service: logger.toExternalService(failedProvider),
      errorCode: 'UPSTREAM_REQUEST_FAILED',
    })
    return finalizeJson(
      {
        error: `${PROVIDER_LABELS[failedProvider]} APIへのリクエストに失敗しました`,
        provider: failedProvider,
        status: 502,
      },
      { status: 502 },
    )
  }

  if (handlerResult.error !== null) {
    if (handlerResult.requestAttempted) {
      await persistImageUsage(handlerResult.modelId, emptyUsage, 'failed', null)
    }
    return finalizeJson(
      {
        error: handlerResult.error,
        provider: handlerResult.provider,
        status: handlerResult.status,
      },
      { status: handlerResult.status },
    )
  }

  const { imageData, mimeType } = handlerResult.result
  await persistImageUsage(handlerResult.modelId, handlerResult.usage, 'completed', null)

  // threadId なし → 従来通り imageData/mimeType のみ返す（認証は先頭で確認済み）
  if (!threadId) {
    return finalizeJson({ imageData, mimeType })
  }

  // threadId は先頭で本人所有を確認済み。Storage アップロード → DB保存へ進む
  const storagePath = `${userId}/${threadId}/${crypto.randomUUID()}.png`

  const buffer = Buffer.from(imageData, 'base64')
  const { error: uploadError, data: uploadData } = await supabase.storage
    .from('generated-images')
    .upload(storagePath, buffer, { contentType: mimeType })

  if (uploadError) {
    return finalizeJson({ error: `Storage アップロード失敗: ${uploadError.message}` }, { status: 500 })
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
      model_id: handlerResult.modelId,
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
    return finalizeJson({ error: `DB保存失敗: ${dbError.message}` }, { status: 500 })
  }

  await persistImageUsage(handlerResult.modelId, handlerResult.usage, 'completed', message.id)

  return finalizeJson({ messageId: message.id, storagePath: actualPath, imageData, mimeType })
}
