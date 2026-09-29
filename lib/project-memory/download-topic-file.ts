import { encodeTopicFile } from "@/lib/project-memory/topic-file";
import type { ProjectMemoryTopic } from "@/lib/project-memory/use-project-memory-topics";

export function downloadTopicFile(topic: ProjectMemoryTopic) {
  const blob = new Blob([encodeTopicFile(topic)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${topic.topic_key}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}
