// 機微情報ログ対策の共通ロガー。
// - 各関数はcaller側から渡されたオブジェクトをそのまま出力せず、
//   関数内部で許可フィールドだけを pickDefined() により再構築してから console へ渡す。
// - これは「余分なプロパティ（userIdやtoken等）が紛れ込んでも出力されない」ことを保証する設計であり、
//   「許可フィールド自体に機微な値を渡さない」ことまでは保証しない。
//   例：route に req.nextUrl.pathname 等のURL全体やIDを埋め込まない、
//       errorCode に error.message 等の自由文字列を渡さない、といった運用はcaller側の責務。

// DBログの各フィールドは静的ラベルまたは機械的コードに限定し、URL・ID・自由文字列を含めない。
type DbOperationParams = {
  route: string; // 静的な分類ラベルのみ（例: "chat/branch-edit"）。URL・IDを埋め込まない
  operation: string; // 静的な操作名のみ（例: "apply_branch_edit"）
  table: string; // テーブル名のみ
  errorCode?: string; // Postgrest等の機械的エラーコードのみ（error.code）。自由文字列を渡さない
  errorType?: string; // JS例外のクラス名のみ（err.name）。catchブロック由来
};

function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) result[key] = obj[key];
  }
  return result;
}

function logDbOperation(
  level: "error" | "warn",
  tag: string,
  p: DbOperationParams
): void {
  const payload = pickDefined({
    route: p.route,
    operation: p.operation,
    table: p.table,
    errorCode: p.errorCode,
    errorType: p.errorType,
  });
  console[level](tag, payload);
}

/** DB操作（INSERT/UPDATE/DELETE/SELECT）失敗。主処理を阻害する場合に使う */
export function dbOperationFailed(p: DbOperationParams): void {
  logDbOperation("error", "[db-operation-failed]", p);
}

/** ベストエフォート処理として扱うDB操作の失敗（last_used_at更新等） */
export function dbOperationFailedBestEffort(p: DbOperationParams): void {
  logDbOperation("warn", "[db-operation-failed]", p);
}

/** 補償操作（ロールバック用DELETE等）の失敗 */
export function dbCompensationFailed(p: DbOperationParams): void {
  logDbOperation("error", "[db-compensation-failed]", p);
}

// 外部サービス名はこの固定集合だけを許可し、任意のURL・ホスト名・識別子を受け取らない。
type ExternalService =
  | "anthropic"
  | "gemini"
  | "openai"
  | "github"
  | "ideogram"
  | "openrouter"
  | "supabase";

// 外部APIログの各フィールドはサービス分類、HTTP status、機械的コード、例外クラス名に限定する。
type ExternalApiParams = {
  service: ExternalService;
  status?: number; // HTTP status code のみ
  errorCode?: string; // 分類コードのみ（例: "UPSTREAM_API_ERROR"）
  errorType?: string; // JS例外のクラス名のみ
};

/** 外部APIのエラー応答。本文（errText/res.text()）は絶対に渡さない設計とする */
export function externalApiFailed(p: ExternalApiParams): void {
  const payload = pickDefined({
    service: p.service,
    status: p.status,
    errorCode: p.errorCode,
    errorType: p.errorType,
  });
  console.error("[external-api-failed]", payload);
}

// ベストエフォートログには静的な操作名と例外クラス名だけを渡し、自由文字列を含めない。
type BestEffortParams = {
  operation: string; // 静的な操作名のみ
  errorType?: string; // JS例外のクラス名のみ
};

/** 失敗しても主処理を継続するベストエフォート処理（RAG検索・画像コンテキスト等） */
export function bestEffortFailed(p: BestEffortParams): void {
  const payload = pickDefined({
    operation: p.operation,
    errorType: p.errorType,
  });
  console.warn("[best-effort-failed]", payload);
}

// security guardログには静的な操作名と件数だけを渡し、ユーザー識別子などを含めない。
type SecurityGuardParams = {
  operation: string; // 静的な操作名のみ
  skippedCount?: number; // 件数のみ。0も有効な値として扱う（truthy判定で落とさない）
};

/** セキュリティguardが意図通り拒否したイベント（所有権検証の失敗等）。
 *  処理失敗ではなく正常な防御動作であることに注意 */
export function securityGuardRejected(p: SecurityGuardParams): void {
  const payload = pickDefined({
    operation: p.operation,
    skippedCount: p.skippedCount,
  });
  console.warn("[security-guard-rejected]", payload);
}
