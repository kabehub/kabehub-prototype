import { summarizeChatInclusion } from "@/lib/project-memory/chat-inclusion-limits";
import { PROJECT_MEMORY_BULK_DELETE_MAX_TOPICS } from "@/lib/project-memory/topic-delete-limits";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import ProjectMemoryPromotionConfirmModal from "@/components/ProjectMemoryPromotionConfirmModal";
import type { ProjectMemoryPromotionConfirm, ProjectMemoryTopic } from "@/lib/project-memory/use-project-memory-topics";

interface Props {
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  selectionLocked?: boolean;
  onStartSelection?: () => void;
  onStopSelection?: () => void;
  onToggleSelected?: (id: string) => void;
  onDeleteSelected?: () => void;
  pendingConfirm?: ProjectMemoryPromotionConfirm | null;
  onConfirmPromotion?: () => void;
  onCancelPromotion?: () => void;
  topics: ProjectMemoryTopic[];
  loading: boolean;
  error: string | null;
  expandedIds: Set<string>;
  onToggleExpanded: (topicId: string) => void;
  canPromote: boolean;
  canInstructionEdit: boolean;
  promotingTopicId: string | null;
  actionsLocked: boolean;
  chatInclusionTopicId: string | null;
  onChatInclusionChange: (topic: ProjectMemoryTopic, include: boolean) => void;
  onDownload: (topic: ProjectMemoryTopic) => void;
  onPromote: (topic: ProjectMemoryTopic) => void;
  onInstructionEdit: (topic: ProjectMemoryTopic) => void;
}

export default function ProjectMemoryTopicList({ selectionMode = false, selectedIds = new Set(), selectionLocked = false, onStartSelection, onStopSelection, onToggleSelected, onDeleteSelected, pendingConfirm = null, onConfirmPromotion, onCancelPromotion, topics, loading, error, expandedIds, onToggleExpanded, canPromote, canInstructionEdit, promotingTopicId, actionsLocked, chatInclusionTopicId, onChatInclusionChange, onDownload, onPromote, onInstructionEdit }: Props) {
  const summary = summarizeChatInclusion(topics);
  const notInjectedIds = new Set(summary.notInjected.map(t => t.id));
  const maxChars = summary.max.toLocaleString("ja-JP");
  return <>
    <ProjectMemoryPromotionConfirmModal confirm={pendingConfirm} submitting={promotingTopicId !== null}
      error={error} onConfirm={onConfirmPromotion ?? (() => {})} onCancel={onCancelPromotion ?? (() => {})} />
    {loading && <p>読み込み中…</p>}
    {onStartSelection && topics.length > 0 && <button type="button" aria-pressed={selectionMode} disabled={selectionLocked || loading}
      onClick={selectionMode ? onStopSelection : onStartSelection}>選択して削除</button>}
    {selectionMode && <p style={{ fontSize: "12px" }}>一度に{PROJECT_MEMORY_BULK_DELETE_MAX_TOPICS}件まで選択できます。</p>}
    {!loading && topics.length === 0 && !error && <p>Project Memoryのtopicはありません。</p>}
    {topics.length > 0 && <div style={{ fontSize: "12px", color: "var(--ink-muted, #6b7280)" }}>
      <p>Memory注入: {summary.usedChars.toLocaleString("ja-JP")} / {maxChars}字</p>
      {summary.notInjected.length > 0 && <p role="alert" style={{ color: "#92400e", overflowWrap: "anywhere" }}>上限超過または本文が空のため、現在注入されていないtopic: {summary.notInjected.map(topic => topic.topic_key).join(", ")}</p>}
      <p>ONのtopicは、{maxChars}字の上限内で、このProjectのチャットに次の送信から毎回含まれます。{maxChars}字はtopic本文の合計です。<br />Lore昇格済みのtopicをONにすると、検索経由で同じ内容が重複して参照される場合があります。</p>
    </div>}
    {topics.map((topic) => {
      const expanded = expandedIds.has(topic.id);
      const notInjected = notInjectedIds.has(topic.id);
      const promoting = promotingTopicId === topic.id;
      const statusLabel = topic.promotion.status === "current" ? "昇格済み" : topic.promotion.status === "stale" ? "更新あり" : "未昇格";
      const buttonLabel = promoting ? "昇格中…" : topic.promotion.status === "current" ? "昇格済み" : topic.promotion.status === "stale" ? "Loreに再昇格" : "Loreに昇格";
      return <section key={topic.id} style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: "9px", padding: "14px", background: "var(--color-background-secondary, #f9fafb)" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          {selectionMode && <input type="checkbox" aria-label={`${topic.topic_key}を削除対象に選択`} checked={selectedIds.has(topic.id)}
            disabled={selectionLocked || (!selectedIds.has(topic.id) && selectedIds.size >= PROJECT_MEMORY_BULK_DELETE_MAX_TOPICS)}
            onChange={() => onToggleSelected?.(topic.id)} />}
          <button type="button" aria-expanded={expanded} onClick={() => onToggleExpanded(topic.id)} style={{ background: "none", border: 0, color: "var(--ink, #111827)", cursor: "pointer", textAlign: "left" }}>
            {expanded ? "▾" : "▸"} {topic.topic_key} <span style={{ color: "var(--ink-muted, #6b7280)" }}>rev.{topic.revision}</span> <span style={{ color: topic.promotion.status === "current" ? "#047857" : "#92400e" }}>{statusLabel}</span>
          </button>
          {topic.include_in_chat && <span style={{ padding: "2px 7px", borderRadius: "4px", background: notInjected ? "#fef3c7" : "#dbeafe", color: notInjected ? "#92400e" : "#1d4ed8", fontSize: "11px" }}>{`${notInjected ? `未注入（${topic.content_md.trim() === "" ? "本文が空" : "上限超過"}）` : "チャット注入中"}`}</span>}
          <label style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "12px" }}>
            <input type="checkbox" checked={topic.include_in_chat}
              disabled={actionsLocked || chatInclusionTopicId !== null || (!topic.include_in_chat && !topic.content_md.trim())}
              aria-label={`${topic.topic_key}をチャットに含める`}
              onChange={(event) => onChatInclusionChange(topic, event.currentTarget.checked)} />
            {chatInclusionTopicId === topic.id ? "反映中…" : "チャットに含める"}
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            {topic.promotion.status !== "not_promoted" && topic.promotion.lore_id !== null && (
              <a href={`/memory#lore-${encodeURIComponent(topic.promotion.lore_id)}`} style={{ alignSelf: "center", color: "#7c3aed" }}>Loreで見る →</a>
            )}
            <button type="button" onClick={() => onDownload(topic)} style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid var(--border, #e5e7eb)", background: "white", cursor: "pointer" }}>DL</button>
            <button type="button" onClick={() => onInstructionEdit(topic)} disabled={actionsLocked || !canInstructionEdit} style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid #7c3aed", background: "white", color: "#7c3aed", cursor: "pointer" }}>AIで編集</button>
            <button type="button" onClick={() => onPromote(topic)} disabled={Boolean(promotingTopicId) || actionsLocked || !canPromote || !topic.content_md.trim() || topic.promotion.status === "current"} style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid #7c3aed", background: "white", color: "#7c3aed", cursor: "pointer" }}>{buttonLabel}</button>
          </div>
        </div>
        {expanded && <div style={{ marginTop: "12px", overflowWrap: "anywhere" }}><MarkdownRenderer content={topic.content_md} /></div>}
      </section>;
    })}
    {selectionMode && <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
      <button type="button" disabled={selectionLocked || loading || selectedIds.size === 0} onClick={onDeleteSelected}>{selectedIds.size}件を削除…</button>
      <button type="button" disabled={selectionLocked} onClick={onStopSelection}>選択をやめる</button>
    </div>}
  </>;
}
