"use client";

import { useEffect, useState } from "react";
import ProjectMemoryDiffView from "@/components/ProjectMemoryDiffView";
import type { AutoSummaryPreview } from "@/lib/project-memory/auto-summary-limits";
import type { AutoSummaryApplyResult } from "@/lib/project-memory/auto-summary-client";

export default function ProjectMemoryBootstrapModal({ projectName, preview, isApplying, results, onApply, onCancel }: {
  projectName: string; preview: AutoSummaryPreview; isApplying: boolean; results: AutoSummaryApplyResult[] | null;
  onApply: (keys: string[]) => void; onCancel: () => void;
}) {
  const [selected, setSelected] = useState(() => new Set<string>(preview.topics.map(t => t.topic_key)));
  useEffect(() => { setSelected(new Set(preview.topics.map(t => t.topic_key))); }, [preview]);
  useEffect(() => {
    if (isApplying) return;
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [isApplying, onCancel]);
  const locked = isApplying || results !== null;
  const byKey = new Map((results ?? []).map(r => [r.topic_key, r]));
  return <>
    <div onClick={() => { if (!isApplying) onCancel(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100 }} />
    <div role="dialog" aria-modal="true" aria-labelledby="project-memory-bootstrap-title" style={{
      position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 1101,
      display: "flex", flexDirection: "column", width: "min(920px, calc(100vw - 32px))", maxHeight: "calc(100vh - 32px)",
      background: "var(--color-background-primary, #ffffff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden",
    }}>
      <div style={{ padding: "24px 28px 18px", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
        <h2 id="project-memory-bootstrap-title" style={{ fontSize: "17px", fontWeight: 600 }}>「{projectName}」のMemory作成案</h2>
        <p style={{ fontSize: "12px", color: "var(--ink-muted, #6b7280)" }}>採用するtopicを選択してください。</p>
        <p style={{ fontSize: "12px" }}>{preview.stats.threads_total}件のスレッドのうち{preview.stats.threads_included}件を使用（対象条件を満たすスレッド: {preview.stats.threads_eligible}件）</p>
        {preview.stats.threads_included < preview.stats.threads_eligible && <p style={{ color: "#b45309", fontSize: "12px" }}>対象{preview.stats.threads_eligible}件中{preview.stats.threads_included}件のみ使用しています。Project全体を網羅していません</p>}
        <p style={{ fontSize: "12px" }}>使用したスレッド内のuser発言: {preview.stats.user_messages_included} / {preview.stats.user_messages_available}件</p>
        {preview.stats.user_messages_included < preview.stats.user_messages_available && <p style={{ color: "#b45309", fontSize: "12px" }}>古いuser発言{preview.stats.user_messages_available - preview.stats.user_messages_included}件は使用していません</p>}
        {preview.stats.messages_truncated > 0 && <p style={{ color: "#b45309", fontSize: "12px" }}>長文のuser発言{preview.stats.messages_truncated}件は一部を中略しています</p>}
        <p style={{ fontSize: "12px", color: "var(--ink-muted, #6b7280)" }}>作成したtopicは、デフォルトでは『チャットに含める』がOFFです。Project Memory一覧でONにすると、チャットに注入されます。</p>
      </div>
      <div style={{ overflowY: "auto", padding: "18px 28px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {preview.topics.map(topic => {
          const result = byKey.get(topic.topic_key);
          return <section key={topic.topic_key} style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: "9px", padding: "14px" }}>
            <label style={{ display: "flex", gap: "10px" }}>
              <input type="checkbox" checked={selected.has(topic.topic_key)} disabled={locked} onChange={() => {
                if (locked) return;
                setSelected(previous => { const next = new Set(previous); if (next.has(topic.topic_key)) next.delete(topic.topic_key); else next.add(topic.topic_key); return next; });
              }} />
              <span>{topic.topic_key}</span>
            </label>
            {result && <p role="status" style={{ fontSize: "12px", color: result.status === "applied" ? "#047857" : "#b45309" }}>
              {result.status === "applied" ? "作成済み" : result.status === "conflict" ? "別の操作で作成済みのため未適用" : result.error ?? "作成に失敗しました"}
            </p>}
            <div style={{ marginTop: "12px" }}><ProjectMemoryDiffView oldText="" newText={topic.content_md} /></div>
          </section>;
        })}
        {preview.empty_topic_keys.length > 0 && <section style={{ fontSize: "12px", color: "var(--ink-muted, #6b7280)" }}>
          <h3 style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>作成案がないtopic</h3>
          {preview.empty_topic_keys.map(key => <p key={key}>
            {key}: {key === "principles"
              ? "この会話の範囲では、Projectでの作業や応答の進め方についてあなたが明示した恒常的な指示が見つからなかったため、作成案はありません"
              : "この会話の範囲では、根拠となる記述が見つからなかったため、作成案はありません"}
          </p>)}
          {preview.stats.user_messages_included < preview.stats.user_messages_available && <p>古いuser発言は使用していないため、そこに含まれている可能性があります</p>}
        </section>}
      </div>
      <div style={{ padding: "16px 28px 20px", borderTop: "1px solid var(--border, #e5e7eb)", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <button disabled={isApplying} onClick={() => { if (!isApplying) onCancel(); }} style={{ padding: "8px 16px", borderRadius: "7px", border: "1px solid var(--border, #e5e7eb)" }}>{results !== null ? "閉じる" : "キャンセル"}</button>
        {results === null && <button disabled={isApplying || !selected.size} onClick={() => { if (!isApplying && selected.size) onApply([...selected]); }} style={{ padding: "8px 18px", borderRadius: "7px", background: isApplying || !selected.size ? "#d1d5db" : "#7c3aed", color: "white", border: "none" }}>
          {isApplying ? "適用中…" : `選択した${selected.size}件を作成`}
        </button>}
      </div>
    </div>
  </>;
}
