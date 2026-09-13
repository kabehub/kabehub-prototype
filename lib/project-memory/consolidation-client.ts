import type { ProjectMemoryConsolidationProposal } from "./consolidation";

export type ConsolidationConsideredTopic = {
  topic_id: string;
  topic_key: string;
  revision: number;
};

export type ProjectMemoryConsolidationPreview = {
  run_id: string;
  model: string;
  prompt_version: number;
  considered_topics: ConsolidationConsideredTopic[];
  topics: ProjectMemoryConsolidationProposal[];
};

export type ConsolidationApplyResult = {
  topic_id: string;
  status: "applied" | "conflict" | "failed";
  error?: string;
};

type Fetcher = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;

export async function applyProjectMemoryConsolidation(
  projectId: string,
  preview: ProjectMemoryConsolidationPreview,
  selectedTopicIds: readonly string[],
  fetcher: Fetcher = fetch,
): Promise<ConsolidationApplyResult[]> {
  const selected = new Set(selectedTopicIds);
  const proposals = preview.topics.filter((topic) => selected.has(topic.topic_id));
  const sourceRefs = [{
    type: "consolidation_run",
    run_id: preview.run_id,
    model: preview.model,
    prompt_version: preview.prompt_version,
    considered_topics: preview.considered_topics,
  }];

  return Promise.all(proposals.map(async (proposal) => {
    try {
      const response = await fetcher(
        `/api/projects/${encodeURIComponent(projectId)}/memory/topics/${encodeURIComponent(proposal.topic_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected_revision: proposal.revision,
            edit_kind: "full",
            new_content_md: proposal.new_content_md,
            source_refs: sourceRefs,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (response.ok) {
        return { topic_id: proposal.topic_id, status: "applied" };
      }
      const error = typeof body?.error === "string"
        ? body.error
        : "Project Memoryの更新に失敗しました";
      return {
        topic_id: proposal.topic_id,
        status: response.status === 409 ? "conflict" : "failed",
        error,
      };
    } catch {
      return {
        topic_id: proposal.topic_id,
        status: "failed",
        error: "Project Memoryの更新に失敗しました",
      };
    }
  }));
}
