export interface CspReportSummary {
  documentUri?: string;
  blockedUri?: string;
  violatedDirective?: string;
}

export function buildCspHeaderValue(params: {
  nonce: string;
  isDev: boolean;
  supabaseHttpOrigin: string;
  supabaseWsOrigin: string;
  reportEndpointConfigured: boolean;
}): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${params.nonce}'`,
    "'strict-dynamic'",
    ...(params.isDev ? ["'unsafe-eval'"] : []),
  ];
  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    ...(params.supabaseHttpOrigin ? [params.supabaseHttpOrigin] : []),
  ];
  const connectSrc = [
    "'self'",
    ...(params.supabaseHttpOrigin ? [params.supabaseHttpOrigin] : []),
    ...(params.supabaseWsOrigin ? [params.supabaseWsOrigin] : []),
  ];
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src ${imgSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "report-uri /api/csp-report",
  ];

  if (params.reportEndpointConfigured) {
    directives.push("report-to csp-endpoint");
  }

  return directives.join("; ");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function reportSummaryFromBody(body: unknown): CspReportSummary | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const report = body as Record<string, unknown>;
  const summary = {
    documentUri: optionalString(
      report.documentURL ?? report["document-uri"]
    ),
    blockedUri: optionalString(report.blockedURL ?? report["blocked-uri"]),
    violatedDirective: optionalString(
      report.effectiveDirective ??
        report.violatedDirective ??
        report["violated-directive"] ??
        report["effective-directive"]
    ),
  };

  return Object.values(summary).some((value) => value !== undefined)
    ? summary
    : null;
}

export function parseCspReportBody(
  contentType: string,
  rawBody: string
): CspReportSummary | null {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (mediaType === "application/csp-report") {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return reportSummaryFromBody(
      (parsed as Record<string, unknown>)["csp-report"]
    );
  }

  if (mediaType === "application/reports+json") {
    if (!Array.isArray(parsed)) {
      return null;
    }

    for (const item of parsed) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const record = item as Record<string, unknown>;
      if (record.type !== undefined && record.type !== "csp-violation") {
        continue;
      }
      const summary = reportSummaryFromBody(record.body);
      if (summary) return summary;
    }
  }

  return null;
}

const NON_URL_REPORT_VALUES = new Set([
  "inline",
  "eval",
  "data",
  "data:",
  "blob",
  "blob:",
  "self",
  "none",
  "wasm-eval",
  "trusted-types-sink",
  "trusted-types-policy",
]);

function isFirstPartyReportOrigin(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "kabehub.com" ||
    hostname === "www.kabehub.com" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    return true;
  }

  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configuredSiteUrl) return false;

  try {
    return url.origin === new URL(configuredSiteUrl).origin;
  } catch {
    return false;
  }
}

export function sanitizeReportUrl(
  value: string | undefined
): string | undefined {
  if (value === undefined) return undefined;

  const trimmed = value.trim();
  if (NON_URL_REPORT_VALUES.has(trimmed.toLowerCase())) {
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }

  const redactedPath = url.pathname.replace(
    /^\/(share|arena)\/[^/]+(?=\/|$)/,
    "/$1/[redacted]"
  );
  if (redactedPath !== url.pathname) {
    return `${url.origin}${redactedPath}`;
  }

  return isFirstPartyReportOrigin(url)
    ? `${url.origin}${url.pathname}`
    : url.origin;
}
