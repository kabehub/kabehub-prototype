"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { webApiKeyStore } from "@/lib/apiKeyStore";

type Promotion = {
  status: "not_promoted" | "current" | "stale";
  source_revision: number | null;
  lore_id: string | null;
};
type Topic = {
  id: string;
  topic_key: string;
  content_md: string;
  revision: number;
  created_at: string;
  updated_at: string;
  promotion: Promotion;
};

interface Props {
  isOpen: boolean;
  projectId: string;
  projectName: string;
  onCancel: () => void;
}

export default function ProjectMemoryListModal({ isOpen, projectId, projectName, onCancel }: Props) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canPromote, setCanPromote] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [promotingTopicId, setPromotingTopicId] = useState<string | null>(null);
  const promotingRef = useRef<string | null>(null);
  const requestId = useRef(0);

  const loadTopics = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/memory/topics`);
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.topics)) {
        throw new Error(typeof body?.error === "string" ? body.error : "Project Memoryを読み込めませんでした");
      }
      if (id === requestId.current) setTopics(body.topics as Topic[]);
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : "Project Memoryを読み込めませんでした");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!isOpen) {
      requestId.current++;
      return;
    }
    setTopics([]);
    setExpandedIds(new Set());
    void loadTopics();
    let active = true;
    setCanPromote(false);
    webApiKeyStore.getKey("openai")
      .then((key) => { if (active) setCanPromote(Boolean(key?.trim())); })
      .catch(() => { if (active) setCanPromote(false); });
    return () => { active = false; requestId.current++; };
  }, [isOpen, loadTopics]);

  useEffect(() => {
    if (!isOpen || promotingTopicId !== null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onCancel, promotingTopicId]);

  const promote = async (topic: Topic) => {
    if (promotingRef.current || !canPromote || !topic.content_md.trim() || topic.promotion.status === "current") return;
    promotingRef.current = topic.id;
    setPromotingTopicId(topic.id);
    setError(null);
    try {
      const key = await webApiKeyStore.getKey("openai");
      if (!key?.trim()) {
        setCanPromote(false);
        throw new Error("OpenAI APIキーが設定されていません");
      }
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/memory/topics/${encodeURIComponent(topic.id)}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-openai-api-key": key },
        body: JSON.stringify({ expected_revision: topic.revision }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) await loadTopics();
        throw new Error(typeof body?.error === "string" ? body.error : "Loreへの昇格に失敗しました");
      }
      await loadTopics();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Loreへの昇格に失敗しました");
    } finally {
      promotingRef.current = null;
      setPromotingTopicId(null);
    }
  };

  if (!isOpen) return null;
  return (
    <>
      <div onClick={() => { if (!promotingRef.current) onCancel(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100 }} />
      <div role="dialog" aria-modal="true" aria-labelledby="project-memory-list-title" style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 1101, display: "flex", flexDirection: "column", width: "min(920px, calc(100vw - 32px))", maxHeight: "calc(100vh - 32px)", background: "var(--color-background-primary, #ffffff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden" }}>
        <div style={{ padding: "24px 28px 18px", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
          <div style={{ fontSize: "11px", color: "#7c3aed", letterSpacing: "0.1em", marginBottom: "7px" }}>Project Memory一覧</div>
          <div id="project-memory-list-title" style={{ fontSize: "17px", color: "var(--ink, #111827)", fontWeight: 600 }}>「{projectName}」のtopic</div>
          {!canPromote && <p style={{ fontSize: "12px", color: "#92400e" }}>OpenAI APIキーが未設定のため、Loreへの昇格はできません。</p>}
          {error && <p role="alert" style={{ fontSize: "12px", color: "#b91c1c" }}>{error}</p>}
        </div>
        <div style={{ overflowY: "auto", padding: "18px 28px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {loading && <p>読み込み中…</p>}
          {!loading && topics.length === 0 && !error && <p>Project Memoryのtopicはありません。</p>}
          {topics.map((topic) => {
            const expanded = expandedIds.has(topic.id);
            const promoting = promotingTopicId === topic.id;
            const statusLabel = topic.promotion.status === "current" ? "昇格済み" : topic.promotion.status === "stale" ? "更新あり" : "未昇格";
            const buttonLabel = promoting ? "昇格中…" : topic.promotion.status === "current" ? "昇格済み" : topic.promotion.status === "stale" ? "Loreに再昇格" : "Loreに昇格";
            return <section key={topic.id} style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: "9px", padding: "14px", background: "var(--color-background-secondary, #f9fafb)" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <button type="button" aria-expanded={expanded} onClick={() => setExpandedIds((previous) => { const next = new Set(previous); if (next.has(topic.id)) next.delete(topic.id); else next.add(topic.id); return next; })} style={{ background: "none", border: 0, color: "var(--ink, #111827)", cursor: "pointer", textAlign: "left" }}>
                  {expanded ? "▾" : "▸"} {topic.topic_key} <span style={{ color: "var(--ink-muted, #6b7280)" }}>rev.{topic.revision}</span> <span style={{ color: topic.promotion.status === "current" ? "#047857" : "#92400e" }}>{statusLabel}</span>
                </button>
                <button type="button" onClick={() => void promote(topic)} disabled={Boolean(promotingTopicId) || !canPromote || !topic.content_md.trim() || topic.promotion.status === "current"} style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid #7c3aed", background: "white", color: "#7c3aed", cursor: "pointer" }}>{buttonLabel}</button>
              </div>
              {expanded && <div style={{ marginTop: "12px", overflowWrap: "anywhere" }}><MarkdownRenderer content={topic.content_md} /></div>}
            </section>;
          })}
        </div>
        <div style={{ padding: "16px 28px 20px", borderTop: "1px solid var(--border, #e5e7eb)", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => { if (!promotingRef.current) onCancel(); }} disabled={promotingTopicId !== null} style={{ padding: "8px 16px", borderRadius: "7px", border: "1px solid var(--border, #e5e7eb)", background: "white", cursor: "pointer" }}>閉じる</button>
        </div>
      </div>
    </>
  );
}
