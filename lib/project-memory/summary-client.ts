import type { ProjectMemorySummaryTopic } from "./summary";

const LOAD_ERROR = "Project Memoryを読み込めませんでした";

export async function fetchProjectMemorySummaryTopics(projectId: string, signal?: AbortSignal): Promise<ProjectMemorySummaryTopic[]> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/memory/topics`, { signal });
  if (!response.ok) throw new Error(LOAD_ERROR);
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("topics" in body) || !Array.isArray(body.topics)) {
    throw new Error(LOAD_ERROR);
  }
  return body.topics.map((topic: unknown) => {
    if (typeof topic !== "object" || topic === null ||
      !("id" in topic) || typeof topic.id !== "string" ||
      !("topic_key" in topic) || typeof topic.topic_key !== "string" ||
      !("content_md" in topic) || typeof topic.content_md !== "string" ||
      !("include_in_chat" in topic) || typeof topic.include_in_chat !== "boolean" ||
      !("promotion" in topic) || typeof topic.promotion !== "object" || topic.promotion === null ||
      !("status" in topic.promotion) ||
      (topic.promotion.status !== "not_promoted" && topic.promotion.status !== "current" && topic.promotion.status !== "stale")) {
      throw new Error(LOAD_ERROR);
    }
    return {
      id: topic.id,
      topic_key: topic.topic_key,
      content_md: topic.content_md,
      include_in_chat: topic.include_in_chat,
      promotion: { status: topic.promotion.status },
    };
  });
}
