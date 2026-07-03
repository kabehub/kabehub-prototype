/**
 * storagePath 名前空間検証ヘルパー
 *
 * generated-images バケット等の storagePath が、指定ユーザーの名前空間
 * （`${userId}/` 配下）に属する正規の相対パスであることを確認する。
 *
 * 使うべき場面（4つ）:
 *   - 参照（img2img で他メッセージの画像を読み込む時）
 *   - 削除（画像削除の前）
 *   - 署名URL作成
 *   - ダウンロード
 * のいずれも、Storageパスをユーザー入力やDBのmetadataから受け取って使う前に
 * 必ずこの関数を通すこと。
 */
export function isOwnedStoragePath(path: unknown, userId: string): path is string {
  if (typeof path !== 'string' || path.length === 0) return false
  if (path.startsWith('/')) return false
  if (path.includes('..')) return false
  return path.startsWith(`${userId}/`)
}
