"use client";

import { useEffect, useMemo, useState } from "react";
import { diffLines } from "diff";
import type {
  ConsolidationApplyResult,
  ProjectMemoryConsolidationPreview,
} from "@/lib/project-memory/consolidation-client";

interface ProjectMemoryConsolidationModalProps {
  isOpen: boolean;
  projectName: string;
  preview: ProjectMemoryConsolidationPreview;
  isApplying: boolean;
  results: ConsolidationApplyResult[] | null;
  onApply: (topicIds: string[]) => void;
  onCancel: () => void;
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = useMemo(() => diffLines(oldText, newText), [oldText, newText]);

  return (
    <div
      aria-label="変更差分"
      style={{
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: "7px",
        overflow: "hidden",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "11px",
        lineHeight: 1.6,
      }}
    >
      {parts.map((part, partIndex) => {
        const lines = part.value.match(/[^\n]*\n|[^\n]+$/g) ?? [part.value];
        const prefix = part.added ? "+" : part.removed ? "−" : " ";
        const background = part.added ? "#ecfdf5" : part.removed ? "#fef2f2" : "#ffffff";
        const color = part.added ? "#065f46" : part.removed ? "#991b1b" : "var(--ink-muted, #6b7280)";
        return lines.map((line, lineIndex) => (
          <div
            key={`${partIndex}-${lineIndex}`}
            style={{
              display: "grid",
              gridTemplateColumns: "22px minmax(0, 1fr)",
              background,
              color,
            }}
          >
            <span
              aria-hidden="true"
              style={{ textAlign: "center", userSelect: "none", opacity: 0.8 }}
            >
              {prefix}
            </span>
            <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {line}
            </span>
          </div>
        ));
      })}
    </div>
  );
}

export default function ProjectMemoryConsolidationModal({
  isOpen,
  projectName,
  preview,
  isApplying,
  results,
  onApply,
  onCancel,
}: ProjectMemoryConsolidationModalProps) {
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setSelectedTopicIds(new Set(preview.topics.map((topic) => topic.topic_id)));
    }
  }, [isOpen, preview]);

  useEffect(() => {
    if (!isOpen || isApplying) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isApplying, isOpen, onCancel]);

  if (!isOpen) return null;
  const resultByTopicId = new Map((results ?? []).map((result) => [result.topic_id, result]));
  const hasResults = results !== null;

  const toggleTopic = (topicId: string) => {
    if (isApplying || hasResults) return;
    setSelectedTopicIds((previous) => {
      const next = new Set(previous);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  return (
    <>
      <div
        onClick={() => { if (!isApplying) onCancel(); }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 1100,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-memory-consolidation-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1101,
          display: "flex",
          flexDirection: "column",
          width: "min(920px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 32px)",
          background: "var(--color-background-primary, #ffffff)",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "24px 28px 18px", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
          <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "#7c3aed", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "7px" }}>
            Project Memoryを整理
          </div>
          <div id="project-memory-consolidation-title" style={{ fontSize: "17px", fontFamily: "'Lora', serif", color: "var(--ink, #111827)", fontWeight: 600 }}>
            「{projectName}」の更新案
          </div>
          <div style={{ marginTop: "7px", fontSize: "12px", color: "var(--ink-muted, #6b7280)", lineHeight: 1.6 }}>
            採用するtopicだけを選択してください。各topicは現在のrevisionに対して個別に更新されます。
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "18px 28px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {preview.topics.map((topic) => {
            const result = resultByTopicId.get(topic.topic_id);
            return (
              <section key={topic.topic_id} style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: "9px", padding: "14px", background: "var(--color-background-secondary, #f9fafb)" }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: isApplying || hasResults ? "default" : "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedTopicIds.has(topic.topic_id)}
                    disabled={isApplying || hasResults}
                    onChange={() => toggleTopic(topic.topic_id)}
                    style={{ marginTop: "3px" }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 600, color: "var(--ink, #111827)" }}>
                      {topic.topic_key} <span style={{ color: "var(--ink-faint, #9ca3af)", fontWeight: 400 }}>rev.{topic.revision}</span>
                    </span>
                    {topic.reason && (
                      <span style={{ display: "block", marginTop: "3px", fontSize: "11px", color: "var(--ink-muted, #6b7280)", lineHeight: 1.5 }}>
                        {topic.reason}
                      </span>
                    )}
                    {result && (
                      <span style={{ display: "block", marginTop: "5px", fontSize: "11px", color: result.status === "applied" ? "#047857" : result.status === "conflict" ? "#b45309" : "#b91c1c" }}>
                        {result.status === "applied" ? "適用済み" : result.status === "conflict" ? "revision conflictのため未適用" : result.error ?? "適用失敗"}
                      </span>
                    )}
                  </span>
                </label>
                <div style={{ marginTop: "12px" }}>
                  <DiffView oldText={topic.old_content_md} newText={topic.new_content_md} />
                </div>
              </section>
            );
          })}
        </div>

        <div style={{ padding: "16px 28px 20px", borderTop: "1px solid var(--border, #e5e7eb)", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button
            onClick={onCancel}
            disabled={isApplying}
            style={{ padding: "8px 16px", borderRadius: "7px", border: "1px solid var(--border, #e5e7eb)", background: "white", color: "var(--ink-muted, #6b7280)", fontSize: "12px", cursor: isApplying ? "not-allowed" : "pointer" }}
          >
            {hasResults ? "閉じる" : "キャンセル"}
          </button>
          {!hasResults && (
            <button
              onClick={() => onApply([...selectedTopicIds])}
              disabled={isApplying || selectedTopicIds.size === 0}
              style={{ padding: "8px 18px", borderRadius: "7px", border: "none", background: isApplying || selectedTopicIds.size === 0 ? "#d1d5db" : "#7c3aed", color: isApplying || selectedTopicIds.size === 0 ? "#9ca3af" : "white", fontSize: "12px", fontWeight: 600, cursor: isApplying || selectedTopicIds.size === 0 ? "not-allowed" : "pointer" }}
            >
              {isApplying ? "適用中…" : `選択した${selectedTopicIds.size}件を適用`}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
