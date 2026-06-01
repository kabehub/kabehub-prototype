import { SupabaseClient } from '@supabase/supabase-js'

export async function downloadImageAsBase64(
  supabase: SupabaseClient,
  storagePath: string
): Promise<{ base64: string; mimeType: string } | null> {
  const { data: blob, error } = await supabase.storage
    .from('generated-images')
    .download(storagePath)
  if (error || !blob) return null
  const arrayBuffer = await blob.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  return { base64, mimeType: blob.type || 'image/png' }
}
