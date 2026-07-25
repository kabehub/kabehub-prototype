import { parseCspReportBody, sanitizeReportUrl } from "@/lib/csp";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_REPORT_BODY_BYTES = 32 * 1024;

function noContent(): Response {
  return new Response(null, { status: 204 });
}

async function hashClientIp(request: Request): Promise<string> {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",", 1)[0].trim() || "unknown";
  const input = new TextEncoder().encode(ipAddress);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Buffer.from(digest).toString("hex");
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_REPORT_BODY_BYTES
    ) {
      return noContent();
    }
  }

  let rateLimitAllowed = true;
  try {
    const cspReportRateLimiter = createRateLimiter(
      "kabehub:csp-report",
      60,
      "1 m"
    );
    if (cspReportRateLimiter) {
      const result = await cspReportRateLimiter.limit(
        await hashClientIp(request)
      );
      rateLimitAllowed = result.success;
    }
  } catch {
    rateLimitAllowed = true;
  }

  if (!rateLimitAllowed) {
    return noContent();
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return noContent();
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_REPORT_BODY_BYTES) {
    return noContent();
  }

  const report = parseCspReportBody(
    request.headers.get("content-type") ?? "",
    rawBody
  );
  if (!report) {
    return noContent();
  }

  console.warn("CSP violation", {
    documentUri: sanitizeReportUrl(report.documentUri),
    blockedUri: sanitizeReportUrl(report.blockedUri),
    violatedDirective: report.violatedDirective,
  });

  return noContent();
}
