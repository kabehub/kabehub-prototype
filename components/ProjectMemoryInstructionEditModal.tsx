"use client";

import { useEffect } from "react";
import ProjectMemoryDiffView from "@/components/ProjectMemoryDiffView";
import { MAX_INSTRUCTION_CHARS } from "@/lib/project-memory/instruction-edit-limits";
import type { InstructionEditState } from "@/lib/project-memory/use-project-memory-topics";

interface Props {
  edit: InstructionEditState | null;
  onInstructionChange: (instruction: string) => void;
  onGenerate: (instruction: string) => void;
  onCancelGeneration: () => void;
  onBackToInput: () => void;
  onApply: () => void;
  onClose: () => void;
}

export default function ProjectMemoryInstructionEditModal({ edit, onInstructionChange, onGenerate,
  onCancelGeneration, onBackToInput, onApply, onClose }: Props) {
  const phase = edit?.phase;
  useEffect(() => {
    if (!phase) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (phase === "generating") onCancelGeneration();
      else if (phase !== "applying") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, onCancelGeneration, onClose]);

  if (!edit) return null;
  const generating = phase === "generating";
  const applying = phase === "applying";
  const hasPreview = (phase === "preview" || applying) && edit.preview !== null;
  const revision = hasPreview ? edit.preview!.revision : edit.topicRevision;
  const dismiss = () => {
    if (generating) onCancelGeneration();
    else if (!applying) onClose();
  };

  return <>
    <div onClick={dismiss} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1200 }} />
    <div role="dialog" aria-modal="true" aria-labelledby="project-memory-instruction-edit-title"
      style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        zIndex: 1201, display: "flex", flexDirection: "column", width: "min(920px, calc(100vw - 32px))",
        maxHeight: "calc(100vh - 32px)", background: "var(--color-background-primary, #ffffff)",
        border: "1px solid var(--border, #e5e7eb)", borderRadius: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden" }}>
      <div style={{ padding: "22px 28px", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
        <div style={{ fontSize: "11px", color: "#7c3aed", marginBottom: "7px" }}>Project MemoryをAIで編集</div>
        <div id="project-memory-instruction-edit-title" style={{ fontSize: "17px", fontWeight: 600 }}>
          {edit.topicKey} <span style={{ color: "var(--ink-muted, #6b7280)", fontWeight: 400 }}>rev.{revision}</span>
        </div>
      </div>
      <div style={{ padding: "20px 28px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px" }}>
        {(phase === "input" || generating) && <>
          <label htmlFor="project-memory-instruction-edit-input">編集の指示</label>
          <textarea id="project-memory-instruction-edit-input" value={edit.instruction}
            maxLength={MAX_INSTRUCTION_CHARS} disabled={generating}
            onChange={(event) => onInstructionChange(event.currentTarget.value)}
            rows={6} style={{ width: "100%", resize: "vertical", padding: "10px", borderRadius: "7px",
              border: "1px solid var(--border, #e5e7eb)" }} />
        </>}
        {hasPreview && <>
          <p style={{ margin: 0 }}>{edit.preview!.summary}</p>
          {edit.promotionStatus === "current" && <p style={{ color: "#92400e", margin: 0 }}>
            このtopicはLoreに昇格済みです。適用するとLore側は『更新あり』になります。
          </p>}
          <ProjectMemoryDiffView oldText={edit.preview!.old_content_md} newText={edit.preview!.new_content_md} />
        </>}
        {phase === "done" && <p role="status" style={{ margin: 0 }}>
          {edit.doneStatus === "applied" ? "適用しました" :
            edit.doneStatus === "conflict" ? "内容が更新されたため、この編集案は失効しました（先ほどの適用が反映済みの場合もあります）。最新内容を確認し、必要なら指示を再入力して再生成してください" :
              "対象のProjectまたはtopicが見つからないため、この編集案は失効しました"}
        </p>}
        {edit.notice && <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>{edit.notice}</p>}
      </div>
      <div style={{ padding: "16px 28px 20px", borderTop: "1px solid var(--border, #e5e7eb)",
        display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        {(phase === "input" || generating) && <>
          {generating ? <button type="button" onClick={onCancelGeneration}>キャンセル</button> :
            <button type="button" onClick={onClose}>閉じる</button>}
          <button type="button" disabled={generating || !edit.instruction.trim()}
            onClick={() => onGenerate(edit.instruction)}>{generating ? "生成中…" : "生成"}</button>
        </>}
        {(phase === "preview" || applying) && <>
          <button type="button" disabled={applying} onClick={onBackToInput}>指示を書き直す</button>
          <button type="button" disabled={applying} onClick={onApply}>{applying ? "適用中…" : "適用"}</button>
        </>}
        {phase === "done" && <button type="button" onClick={onClose}>閉じる</button>}
      </div>
    </div>
  </>;
}
