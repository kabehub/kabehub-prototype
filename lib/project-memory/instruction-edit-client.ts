export type InstructionEditPreviewEnvelope = {
  run_id: string;
  model: string;
  prompt_version: number;
  topic_id: string;
  topic_key: string;
  revision: number;
  updated_at: string;
};

export type InstructionEditPreview =
  | (InstructionEditPreviewEnvelope & { result: "proposal"; old_content_md: string; new_content_md: string; summary: string })
  | (InstructionEditPreviewEnvelope & { result: "no_change" })
  | (InstructionEditPreviewEnvelope & { result: "not_applicable"; reason: string });

export type ProposalPreview = Extract<InstructionEditPreview, { result: "proposal" }>;
export type InstructionEditPreviewRequestResult =
  | { ok: true; preview: InstructionEditPreview }
  | { ok: false; kind: "aborted" }
  | { ok: false; kind: "error"; status: number | null; message: string };

type Fetcher = (input: string | URL | globalThis.Request, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, specific: readonly string[]): boolean {
  const allowed = ["result", "run_id", "model", "prompt_version", "topic_id", "topic_key",
    "revision", "updated_at", ...specific];
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parsePreview(value: unknown): InstructionEditPreview | null {
  if (!isRecord(value)) return null;
  for (const field of ["run_id", "model", "topic_id", "topic_key", "updated_at"]) {
    if (typeof value[field] !== "string" || value[field] === "") return null;
  }
  if (!Number.isInteger(value.prompt_version) || (value.prompt_version as number) < 1 ||
      !Number.isInteger(value.revision) || (value.revision as number) < 1) return null;
  const envelope: InstructionEditPreviewEnvelope = {
    run_id: value.run_id as string,
    model: value.model as string,
    prompt_version: value.prompt_version as number,
    topic_id: value.topic_id as string,
    topic_key: value.topic_key as string,
    revision: value.revision as number,
    updated_at: value.updated_at as string,
  };
  if (value.result === "proposal") {
    if (!hasOnlyKeys(value, ["old_content_md", "new_content_md", "summary"]) ||
        typeof value.old_content_md !== "string" || typeof value.new_content_md !== "string" ||
        typeof value.summary !== "string" || value.summary.trim() === "") return null;
    if (value.old_content_md.trim() !== "" && value.new_content_md.trim() === "") return null;
    return { ...envelope, result: "proposal", old_content_md: value.old_content_md,
      new_content_md: value.new_content_md, summary: value.summary };
  }
  if (value.result === "no_change") {
    if (!hasOnlyKeys(value, [])) return null;
    return { ...envelope, result: "no_change" };
  }
  if (value.result === "not_applicable") {
    if (!hasOnlyKeys(value, ["reason"]) || typeof value.reason !== "string" || value.reason.trim() === "") return null;
    return { ...envelope, result: "not_applicable", reason: value.reason };
  }
  return null;
}

export async function requestInstructionEditPreview({ projectId, topicId, instruction, apiKey, signal, fetcher = fetch }: {
  projectId: string; topicId: string; instruction: string; apiKey: string; signal?: AbortSignal; fetcher?: Fetcher;
}): Promise<InstructionEditPreviewRequestResult> {
  try {
    const response = await fetcher(
      `/api/projects/${encodeURIComponent(projectId)}/memory/topics/${encodeURIComponent(topicId)}/edit-preview`,
      { method: "POST", headers: { "Content-Type": "application/json", "x-openai-api-key": apiKey },
        body: JSON.stringify({ instruction }), signal },
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const serverMessage = isRecord(body) && typeof body.error === "string" ? body.error : null;
      return { ok: false, kind: "error", status: response.status, message:
        response.status === 400 ? "指示を確認してください" :
          (response.status === 413 || response.status === 502) && serverMessage
            ? serverMessage : "AI編集案を生成できませんでした" };
    }
    const preview = parsePreview(body);
    if (!preview || preview.topic_id !== topicId) {
      return { ok: false, kind: "error", status: response.status, message: "AI編集案を生成できませんでした" };
    }
    return { ok: true, preview };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return { ok: false, kind: "aborted" };
    return { ok: false, kind: "error", status: null, message: "AI編集案を生成できませんでした" };
  }
}

export async function applyInstructionEdit({ projectId, preview, fetcher = fetch }: {
  projectId: string; preview: ProposalPreview; fetcher?: Fetcher;
}): Promise<{ status: "applied" } | { status: "conflict" } | { status: "not_found" } | { status: "failed"; message: string }> {
  try {
    const response = await fetcher(
      `/api/projects/${encodeURIComponent(projectId)}/memory/topics/${encodeURIComponent(preview.topic_id)}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        expected_revision: preview.revision,
        edit_kind: "full",
        new_content_md: preview.new_content_md,
        source_refs: [{ type: "instruction_edit", run_id: preview.run_id,
          model: preview.model, prompt_version: preview.prompt_version }],
      }) },
    );
    if (response.status === 200) return { status: "applied" };
    if (response.status === 409) return { status: "conflict" };
    if (response.status === 404) return { status: "not_found" };
    return { status: "failed", message: "AI編集案を適用できませんでした" };
  } catch {
    return { status: "failed", message: "AI編集案を適用できませんでした" };
  }
}
