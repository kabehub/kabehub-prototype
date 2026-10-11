"use client";

import { useEffect, useRef, useState } from "react";
import ProjectMemoryDiffView from "@/components/ProjectMemoryDiffView";
import type { AutoSummaryUpdatePreview } from "@/lib/project-memory/auto-summary-update-limits";
import type { UpdateTopicResult } from "@/lib/project-memory/auto-summary-update-client";
import { fetchProjectMemorySummaryTopics } from "@/lib/project-memory/summary-client";
import type { ProjectMemorySummaryTopic } from "@/lib/project-memory/summary";
import { computeUpdateWarning } from "@/lib/project-memory/auto-summary-update-warning";

type Preview = Extract<AutoSummaryUpdatePreview, { result: "preview" }>;
interface Props {
  isOpen: boolean;
  projectId: string;
  projectName: string;
  preview: Preview;
  isApplying: boolean;
  results: UpdateTopicResult[] | null;
  onApply: (topicIds: string[]) => void;
  onSkipAll: () => void;
  onCancel: () => void;
}

export function updateResultLabel(result: UpdateTopicResult): string {
  switch (result.status) {
    case "applied": return result.checkpoint === "failed"
      ? "本文は更新されましたが、確認位置を記録できませんでした。次回、同じ発言が再度対象になる場合があります"
      : result.checkpoint === "none" ? "反映しました（記録する確認位置はありません）" : "反映し、確認位置も記録しました";
    case "skipped": return result.checkpoint === "failed"
      ? "見送りの確認位置を記録できませんでした。次回、同じ発言が再度対象になる場合があります" : "見送りました";
    case "unchanged": return result.checkpoint === "failed"
      ? "変更はありませんが、確認位置を記録できませんでした。次回、再度対象になる場合があります" : "変更なし（確認済み）";
    case "conflict": return "別の操作で更新されたため未適用です（確認位置は進めていません）";
    case "failed": return "更新結果を確認できませんでした。Project Memory一覧で現在の内容を確認してください。";
  }
}
const excludedLabels = {
  no_baseline: "基準となる履歴がありません",
  no_auto_summary_history: "自動要約の履歴がありません",
  provenance_mismatch: "履歴の整合性を確認できず除外しました",
  empty_topic: "本文が空です",
};

export default function ProjectMemoryAutoUpdateModal({ isOpen, projectId, projectName, preview, isApplying, results, onApply, onSkipAll, onCancel }: Props) {
  const identityKey = projectId + ":" + preview.run_id;
  const identity = useRef({ key: identityKey, isOpen });
  identity.current = { key: identityKey, isOpen };
  const [selection, setSelection] = useState({ key: identityKey, ids: new Set(preview.proposals.map(topic => topic.topic_id)) });
  const selected = selection.key === identityKey ? selection.ids : new Set(preview.proposals.map(topic => topic.topic_id));
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const confirming = confirmKey === identityKey;
  const [summary, setSummary] = useState<{ key: string; topics: ProjectMemorySummaryTopic[] | null; failed: boolean } | null>(null);
  const currentSummary = summary?.key === identityKey ? summary : null;
  const warningLoading = currentSummary === null;
  const hasResults = results !== null;

  useEffect(() => {
    setSelection({ key: identityKey, ids: new Set(preview.proposals.map(topic => topic.topic_id)) });
    setConfirmKey(null);
    setSummary(null);
    if (!isOpen) return;
    const controller = new AbortController();
    let active = true;
    const current = () => active && !controller.signal.aborted && identity.current.isOpen && identity.current.key === identityKey;
    void fetchProjectMemorySummaryTopics(projectId, controller.signal).then(topics => {
      if (current()) setSummary({ key: identityKey, topics, failed: false });
    }).catch(() => {
      if (current()) setSummary({ key: identityKey, topics: null, failed: true });
    });
    return () => { active = false; controller.abort(); };
  }, [isOpen, projectId, preview.run_id]);

  useEffect(() => {
    if (!isOpen || isApplying || (confirming && !hasResults)) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isApplying, confirming, hasResults, onCancel]);

  if (!isOpen) return null;
  const warning = currentSummary?.topics ? computeUpdateWarning(currentSummary.topics, preview.proposals, selected) : null;
  const actionDisabled = isApplying || warningLoading || hasResults;
  const closeDisabled = isApplying || (confirming && !hasResults);
  const buttonStyle = { padding: "8px 16px", borderRadius: "7px", border: "1px solid var(--border, #e5e7eb)", fontSize: "12px" };
  return <>
    <div onClick={() => { if (!closeDisabled) onCancel(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100 }} />
    <div role="dialog" aria-modal="true" aria-labelledby="project-memory-update-title" style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 1101, display: "flex", flexDirection: "column", width: "min(920px, calc(100vw - 32px))", maxHeight: "calc(100vh - 32px)", background: "var(--color-background-primary, #ffffff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden" }}>
      <div style={{ padding: "24px 28px 18px", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
        <div style={{ fontSize: "11px", color: "#7c3aed", marginBottom: "7px" }}>会話から更新</div>
        <h2 id="project-memory-update-title" style={{ fontSize: "17px", margin: 0 }}>「{projectName}」の反映案</h2>
        <div style={{ marginTop: "7px", fontSize: "12px", lineHeight: 1.6 }}>
          <div>新たに参照する会話はあなたの発言のみです（AIの返答は含みません）</div>
          <div>新規user発言 {preview.stats.user_messages_available}件中 {preview.stats.user_messages_included}件を使用（未使用の発言は次回以降の更新候補として残ります）</div>
          {!hasResults && <div>チェックを外したtopicは「見送り」として、今回の発言について確認位置を記録します。</div>}
        </div>
      </div>
      <div style={{ overflowY: "auto", padding: "18px 28px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {hasResults ? results.map(result => <section key={result.topic_id} style={{ border: "1px solid var(--border)", borderRadius: "9px", padding: "14px" }}>
          <div style={{ fontWeight: 600 }}>{result.topic_key}</div>
          <div style={{ fontSize: "12px", marginTop: "6px" }}>{updateResultLabel(result)}</div>
        </section>) : preview.proposals.map(topic => <section key={topic.topic_id} style={{ border: "1px solid var(--border)", borderRadius: "9px", padding: "14px" }}>
          <label style={{ display: "flex", gap: "10px" }}>
            <input type="checkbox" checked={selected.has(topic.topic_id)} disabled={isApplying || confirming} onChange={() => {
              if (isApplying || confirming || hasResults) return;
              const ids = new Set(selected); if (ids.has(topic.topic_id)) ids.delete(topic.topic_id); else ids.add(topic.topic_id);
              setSelection({ key: identityKey, ids });
            }} />
            <span><strong>{topic.topic_key}</strong> rev.{topic.base_revision}<br />
              <span style={{ fontSize: "11px" }}>出自: {topic.origin}</span><br />
              <span style={{ fontSize: "12px" }}>{topic.reason}</span>
            </span>
          </label>
          <div style={{ marginTop: "12px" }}><ProjectMemoryDiffView oldText={topic.current_content_md} newText={topic.proposed_content_md} /></div>
        </section>)}
        {!hasResults && <div aria-live="polite" style={{ fontSize: "12px", color: "#b45309", lineHeight: 1.6 }}>
          {warningLoading && <div>注入量の警告を確認中…</div>}
          {currentSummary?.failed && <div>注入量の警告を確認できませんでした</div>}
          {warning?.standardOverLimit && <div>標準topicのチャット注入ON本文が7,000字を超えます（{warning.standardCharsAfter.toLocaleString()}字）。</div>}
          {warning?.newlyNotInjected.map(topic => <div key={topic.id}>{topic.topic_key}: 新たにチャット注入されなくなります。</div>)}
          {currentSummary?.topics?.filter(topic => selected.has(topic.id) && topic.promotion.status !== "not_promoted").map(topic => <div key={topic.id}>
            {topic.topic_key}: {topic.promotion.status === "current" ? "このtopicはLoreに昇格済みです。適用するとLore側は『更新あり』になります" : "このtopicのLoreはすでに『更新あり』です。適用後は再昇格が必要です"}
          </div>)}
        </div>}
        {preview.excluded_topics.length > 0 && <div style={{ fontSize: "11px", color: "var(--ink-muted)" }}>{preview.excluded_topics.map(topic => <div key={topic.topic_key}>{topic.topic_key}: {excludedLabels[topic.reason]}</div>)}</div>}
        {confirming && !hasResults && <div role="alert" style={{ fontSize: "12px" }}>今回の発言を確認済みとして記録します。次回は原則として再提案されません</div>}
      </div>
      <div style={{ padding: "16px 28px 20px", borderTop: "1px solid var(--border)", display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "10px" }}>
        <button onClick={() => { if (!closeDisabled) onCancel(); }} disabled={closeDisabled} style={buttonStyle}>{hasResults ? "閉じる" : "閉じる（何も消費しません）"}</button>
        {!hasResults && (confirming ? <>
          <button onClick={() => { if (!isApplying) setConfirmKey(null); }} disabled={isApplying} style={buttonStyle}>確認を取り消す</button>
          <button onClick={() => { if (!actionDisabled) onSkipAll(); }} disabled={actionDisabled} style={buttonStyle}>{isApplying ? "記録中…" : "見送りを確定"}</button>
        </> : <>
          <button onClick={() => { if (!actionDisabled) setConfirmKey(identityKey); }} disabled={actionDisabled} style={buttonStyle}>すべて見送る</button>
          <button onClick={() => { if (!actionDisabled && selected.size > 0) onApply([...selected]); }} disabled={actionDisabled || selected.size === 0} style={{ ...buttonStyle, background: "#7c3aed", color: "white" }}>{isApplying ? "適用中…" : `選択した${selected.size}件を適用`}</button>
        </>)}
      </div>
    </div>
  </>;
}
