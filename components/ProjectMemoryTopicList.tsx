import MarkdownRenderer from "@/components/MarkdownRenderer";
import type { ProjectMemoryTopic } from "@/lib/project-memory/use-project-memory-topics";

interface Props {
  topics: ProjectMemoryTopic[];
  loading: boolean;
  error: string | null;
  expandedIds: Set<string>;
  onToggleExpanded: (topicId: string) => void;
  canPromote: boolean;
  promotingTopicId: string | null;
  actionsLocked: boolean;
  onDownload: (topic: ProjectMemoryTopic) => void;
  onPromote: (topic: ProjectMemoryTopic) => void;
}

export default function ProjectMemoryTopicList({ topics, loading, error, expandedIds, onToggleExpanded, canPromote, promotingTopicId, actionsLocked, onDownload, onPromote }: Props) {
  return <>
    {loading && <p>読み込み中…</p>}
    {!loading && topics.length === 0 && !error && <p>Project Memoryのtopicはありません。</p>}
    {topics.map((topic) => {
      const expanded = expandedIds.has(topic.id);
      const promoting = promotingTopicId === topic.id;
      const statusLabel = topic.promotion.status === "current" ? "昇格済み" : topic.promotion.status === "stale" ? "更新あり" : "未昇格";
      const buttonLabel = promoting ? "昇格中…" : topic.promotion.status === "current" ? "昇格済み" : topic.promotion.status === "stale" ? "Loreに再昇格" : "Loreに昇格";
      return <section key={topic.id} style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: "9px", padding: "14px", background: "var(--color-background-secondary, #f9fafb)" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <button type="button" aria-expanded={expanded} onClick={() => onToggleExpanded(topic.id)} style={{ background: "none", border: 0, color: "var(--ink, #111827)", cursor: "pointer", textAlign: "left" }}>
            {expanded ? "▾" : "▸"} {topic.topic_key} <span style={{ color: "var(--ink-muted, #6b7280)" }}>rev.{topic.revision}</span> <span style={{ color: topic.promotion.status === "current" ? "#047857" : "#92400e" }}>{statusLabel}</span>
          </button>
          <div style={{ display: "flex", gap: "8px" }}>
            {topic.promotion.status !== "not_promoted" && topic.promotion.lore_id !== null && (
              <a href={`/memory#lore-${encodeURIComponent(topic.promotion.lore_id)}`} style={{ alignSelf: "center", color: "#7c3aed" }}>Loreで見る →</a>
            )}
            <button type="button" onClick={() => onDownload(topic)} style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid var(--border, #e5e7eb)", background: "white", cursor: "pointer" }}>DL</button>
            <button type="button" onClick={() => onPromote(topic)} disabled={Boolean(promotingTopicId) || actionsLocked || !canPromote || !topic.content_md.trim() || topic.promotion.status === "current"} style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid #7c3aed", background: "white", color: "#7c3aed", cursor: "pointer" }}>{buttonLabel}</button>
          </div>
        </div>
        {expanded && <div style={{ marginTop: "12px", overflowWrap: "anywhere" }}><MarkdownRenderer content={topic.content_md} /></div>}
      </section>;
    })}
  </>;
}
