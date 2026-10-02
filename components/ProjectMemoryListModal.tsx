"use client";

import { useEffect, useRef, useState } from "react";
import ProjectMemoryTopicList from "@/components/ProjectMemoryTopicList";
import ProjectMemoryInstructionEditModal from "@/components/ProjectMemoryInstructionEditModal";
import ProjectMemoryUploadConfirm from "@/components/ProjectMemoryUploadConfirm";
import { downloadTopicFile } from "@/lib/project-memory/download-topic-file";
import { useProjectMemoryTopics } from "@/lib/project-memory/use-project-memory-topics";

interface Props {
  isOpen: boolean;
  projectId: string;
  projectName: string;
  onCancel: () => void;
}

export default function ProjectMemoryListModal({ isOpen, projectId, projectName, onCancel }: Props) {
  const { topics, loading, error, canPromote, canInstructionEdit, promotingTopicId, uploading, uploadConfirm, instructionEdit,
    pendingConfirm, confirmPromotion, cancelPromotionConfirm, setChatInclusion, chatInclusionTopicId,
    promote, selectUploadFile, executeUpload, cancelUploadConfirm, isActionLocked,
    openInstructionEdit, closeInstructionEdit, setInstructionEditInstruction, generateInstructionEditPreview,
    cancelInstructionEditGeneration, backToInstructionInput, applyInstructionEditPreview } =
    useProjectMemoryTopics({ projectId, enabled: isOpen, keepLoaded: false });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) setExpandedIds(new Set());
  }, [isOpen, projectId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && instructionEdit === null && !isActionLocked() &&
          promotingTopicId === null && !uploading && uploadConfirm === null) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onCancel, promotingTopicId, uploading, uploadConfirm, instructionEdit, isActionLocked]);

  const onToggleExpanded = (topicId: string) => {
    setExpandedIds((previous) => { const next = new Set(previous); if (next.has(topicId)) next.delete(topicId); else next.add(topicId); return next; });
  };
  const selectUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file) await selectUploadFile(file);
  };

  if (!isOpen) return null;
  return (
    <>
      <div onClick={() => { if (instructionEdit === null && !isActionLocked()) onCancel(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100 }} />
      <div role="dialog" aria-modal="true" aria-labelledby="project-memory-list-title" style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 1101, display: "flex", flexDirection: "column", width: "min(920px, calc(100vw - 32px))", maxHeight: "calc(100vh - 32px)", background: "var(--color-background-primary, #ffffff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden" }}>
        <div style={{ padding: "24px 28px 18px", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
          <div style={{ fontSize: "11px", color: "#7c3aed", letterSpacing: "0.1em", marginBottom: "7px" }}>Project Memory一覧</div>
          <div id="project-memory-list-title" style={{ fontSize: "17px", color: "var(--ink, #111827)", fontWeight: 600 }}>「{projectName}」のtopic</div>
          {!canPromote && <p style={{ fontSize: "12px", color: "#92400e" }}>OpenAI APIキーが未設定のため、Loreへの昇格・AI編集はできません。</p>}
          {error && <p role="alert" style={{ fontSize: "12px", color: "#b91c1c" }}>{error}</p>}
        </div>
        <div style={{ overflowY: "auto", padding: "18px 28px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <ProjectMemoryTopicList topics={topics} loading={loading} error={error} expandedIds={expandedIds} onToggleExpanded={onToggleExpanded}
            canPromote={canPromote} canInstructionEdit={canInstructionEdit} promotingTopicId={promotingTopicId} actionsLocked={isActionLocked()} chatInclusionTopicId={chatInclusionTopicId} onChatInclusionChange={(topic, include) => void setChatInclusion(topic, include)}
            pendingConfirm={pendingConfirm} onConfirmPromotion={() => void confirmPromotion()} onCancelPromotion={cancelPromotionConfirm}
            onDownload={downloadTopicFile} onPromote={(topic) => void promote(topic)} onInstructionEdit={openInstructionEdit} />
        </div>
        <div style={{ padding: "16px 28px 20px", borderTop: "1px solid var(--border, #e5e7eb)", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <input ref={uploadInputRef} type="file" accept=".md,.txt" onChange={selectUpload} style={{ display: "none" }} />
          <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={isActionLocked()} style={{ padding: "8px 16px", borderRadius: "7px", border: "1px solid var(--border, #e5e7eb)", background: "white", cursor: "pointer" }}>ファイルをアップロード</button>
          <button onClick={() => { if (instructionEdit === null && !isActionLocked()) onCancel(); }} disabled={promotingTopicId !== null || uploading || uploadConfirm !== null || instructionEdit !== null || isActionLocked()} style={{ padding: "8px 16px", borderRadius: "7px", border: "1px solid var(--border, #e5e7eb)", background: "white", cursor: "pointer" }}>閉じる</button>
        </div>
      </div>
      <ProjectMemoryUploadConfirm confirm={uploadConfirm} uploading={uploading} onCancel={cancelUploadConfirm} onExecute={() => void executeUpload()} />
      <ProjectMemoryInstructionEditModal edit={instructionEdit} onInstructionChange={setInstructionEditInstruction}
        onGenerate={(instruction) => void generateInstructionEditPreview(instruction)}
        onCancelGeneration={cancelInstructionEditGeneration} onBackToInput={backToInstructionInput}
        onApply={() => void applyInstructionEditPreview()} onClose={closeInstructionEdit} />
    </>
  );
}
