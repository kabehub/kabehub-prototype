"use client";

import { summarizeProjectMemory } from "@/lib/project-memory/summary";
import { useProjectMemorySummary } from "@/lib/project-memory/use-project-memory-summary";

interface ProjectMemoryTabProps {
  projectId: string | null;
  refreshToken: number;
  // 自動要約ボタンの既存disabled条件をSidebarから受け取る。
  disabled?: boolean;
  update?: { canGenerate: boolean; generating: boolean; busy: boolean; onGenerate: () => void };
  autoSummary: {
    buttonLabel: string;
    canGenerate: boolean;
    error: string | null;
    generating: boolean;
    onGenerate: () => void;
  };
  consolidation: { onOpen: () => void; loading: boolean };
  list: { onOpen: () => void };
}

export default function ProjectMemoryTab({ projectId, refreshToken, disabled, autoSummary, consolidation, list, update }: ProjectMemoryTabProps) {
  const { topics, loading, error } = useProjectMemorySummary({ projectId, refreshToken });
  const summary = topics === null ? null : summarizeProjectMemory(topics);
  const autoDisabled = Boolean(update?.busy) || (disabled ?? (!autoSummary.canGenerate || consolidation.loading));
  const autoPrimary = summary !== null && summary.standardCreated < summary.standardTotal && !autoDisabled;
  const updatePrimary = !autoPrimary && summary !== null && summary.standardCreated === summary.standardTotal && Boolean(update?.canGenerate);
  const listPrimary = !autoPrimary && !updatePrimary && (summary !== null || error !== null);

  return (
    <div style={{ marginTop: "16px", border: "1px solid var(--border)", borderRadius: "7px", padding: "12px", background: "white" }}>
      <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--ink)", marginBottom: "3px" }}>Project Memory</div>
      <div style={{ fontSize: "11px", color: "var(--ink-muted)", lineHeight: 1.6, marginBottom: "10px" }}>
        会話から自動要約してProject Memory topicを作成できます。『チャットに含める』をONにしたtopicは、上限内で通常チャットへの注入対象になります。『会話からMemoryを更新』は、前回以降のあなたの発言から既存の標準topicへの反映案を作ります。更新が不要と判定された発言は、確認済みとして自動的に記録されます。Loreに昇格すると検索対象になり、『整理』では既存topicの重複・矛盾・古い記述の更新案を作成できます。
      </div>
      <div style={{ fontSize: "12px", color: "var(--ink-muted)", lineHeight: 1.8, marginBottom: "10px" }}>
        {summary ? (
          <>
            <div>標準 {summary.standardCreated}/{summary.standardTotal} 作成</div>
            <div>チャット注入ON {summary.chatOnCount}件／現在注入 {summary.chatInjectedCount}件（{summary.chatUsedChars.toLocaleString()} / {summary.chatMaxChars.toLocaleString()}字）</div>
            <div>Lore登録済み {summary.loreRegisteredCount}件（更新あり {summary.loreStaleCount}件）</div>
            <div>チャット未注入・Lore未登録 {summary.notInjectedNotPromotedCount}件</div>
          </>
        ) : error ? <div>サマリを読み込めませんでした</div> : loading ? <div>読み込み中…</div> : null}
        <div style={{ fontSize: "11px", color: "var(--ink-faint)", lineHeight: 1.6, marginTop: "6px" }}>
          注入ONでも上限超過・空本文のtopicは現在注入に数えません。Lore登録済みは検索対象になりますが、会話ごとに必ず参照されるわけではありません。
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          onClick={autoSummary.onGenerate}
          disabled={autoDisabled}
          title={autoSummary.error ?? undefined}
          style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid #7c3aed", background: autoPrimary ? "#7c3aed" : "white", color: autoPrimary ? "white" : autoSummary.canGenerate ? "#7c3aed" : "var(--ink-faint)", fontSize: "12px", cursor: autoSummary.canGenerate ? "pointer" : "not-allowed", fontWeight: 500 }}
        >{autoSummary.buttonLabel}</button>
        <button
          onClick={consolidation.onOpen}
          disabled={!projectId || consolidation.loading || autoSummary.generating || Boolean(update?.busy)}
          style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid #7c3aed", background: "white", color: projectId && !consolidation.loading ? "#7c3aed" : "var(--ink-faint)", fontSize: "12px", cursor: projectId && !consolidation.loading ? "pointer" : "not-allowed", fontWeight: 500 }}
        >{consolidation.loading ? "整理案を生成中…" : "Project Memoryを整理"}</button>
        {update && <button
          onClick={update.onGenerate}
          disabled={!update.canGenerate}
          style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid #7c3aed", background: updatePrimary ? "#7c3aed" : "white", color: update.canGenerate ? (updatePrimary ? "white" : "#7c3aed") : "var(--ink-faint)", fontSize: "12px", cursor: update.canGenerate ? "pointer" : "not-allowed", fontWeight: 500 }}
        >{update.generating ? "更新案を生成中…" : "会話からMemoryを更新"}</button>}
        <button
          onClick={list.onOpen}
          disabled={!projectId || Boolean(update?.busy)}
          style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid #7c3aed", background: listPrimary ? "#7c3aed" : "white", color: listPrimary ? "white" : "#7c3aed", fontSize: "12px", cursor: "pointer", fontWeight: 500 }}
        >Project Memory一覧</button>
      </div>
    </div>
  );
}
