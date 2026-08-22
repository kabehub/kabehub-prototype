// KabeHub shared package (Web/Mobile共有コード置き場)
//
// 実コードの移植はタスク9（shared component/libの段階的抽出、実装方針v5 §7）で行う。
// 対象は実装方針v5 §3.2に列挙されたcomponents 13ファイル・lib 10モジュール・types/index.ts。
//
// 契約（実装方針v5 §3.5、本タスクで確定した範囲）：
// - shared package内部ではconsumer app（Web/Mobile）の `@/` エイリアスに依存しない。
//   package内部の相互importはrelative importを使用する。
// - consumerからのimportは、現時点では package.json の exports で定義した
//   root export（`import { ... } from "@kabehub/shared"`）のみを契約する。
//   サブパスexports（`@kabehub/shared/foo` 等）は本タスクでは導入しない。
//
// 以下はタスク3のworkspace wiring smoke test用マーカー。apps/mobile/app/page.tsx からimportされ、
// npm workspaces経由の解決とNext.jsのtranspilePackagesが機能していることを恒久的に証明する。
// タスク9で実コードに置き換わっても消さず、smoke testとしてどこかに残すか、
// 別のsmoke test手段へ移行してから削除すること。
export const SHARED_PACKAGE_MARKER = "kabehub-shared-workspace-skeleton";

export type { ApiClient } from "./platform/apiClient";
export type { AccessTokenProvider } from "./platform/accessToken";
export {
  API_KEY_HEADER_NAMES,
  buildApiKeyHeaders,
  type ApiKeyProvider,
  type ApiKeyStore,
} from "./platform/apiKeyStore";
export type { SecureStorageAdapter } from "./platform/secureStorage";
export type { ExternalBrowser } from "./platform/externalBrowser";

export { formatDateTime, timeAgo } from "./formatters";
export {
  SECRET_MASK,
  generateMessageSummary,
  maskSecretNotation,
} from "./stringUtils";
export {
  BULK_ARCHIVE_MAX_ITEMS,
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  PINNED_GITHUB_FILES_MAX,
  TAG_NAME_MAX_LENGTH,
  isAllUpperHandle,
  isValidHandleFormat,
  normalizeTagName,
} from "./validationLimits";
export {
  GENRES,
  getChildIds,
  type GenreId,
  type ParentGenreId,
} from "./genres";
