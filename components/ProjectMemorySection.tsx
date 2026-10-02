"use client";

import { useRef, useState } from "react";
import ProjectMemoryTopicList from "@/components/ProjectMemoryTopicList";
import ProjectMemoryInstructionEditModal from "@/components/ProjectMemoryInstructionEditModal";
import ProjectMemoryUploadConfirm from "@/components/ProjectMemoryUploadConfirm";
import { downloadTopicFile } from "@/lib/project-memory/download-topic-file";
import { useProjectMemoryTopics } from "@/lib/project-memory/use-project-memory-topics";

interface Props {
  projectId: string;
  projectName: string;
}

export default function ProjectMemorySection({ projectId, projectName }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const { topics, loading, error, canPromote, canInstructionEdit, promotingTopicId, uploading, uploadConfirm, instructionEdit,
    pendingConfirm, confirmPromotion, cancelPromotionConfirm, setChatInclusion, chatInclusionTopicId,
    promote, selectUploadFile, executeUpload, cancelUploadConfirm, isActionLocked,
    openInstructionEdit, closeInstructionEdit, setInstructionEditInstruction, generateInstructionEditPreview,
    cancelInstructionEditGeneration, backToInstructionInput, applyInstructionEditPreview } =
    useProjectMemoryTopics({ projectId, enabled: expanded, keepLoaded: true });

  const onToggleExpanded = (topicId: string) => {
    setExpandedIds((previous) => { const next = new Set(previous); if (next.has(topicId)) next.delete(topicId); else next.add(topicId); return next; });
  };
  const selectUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file) await selectUploadFile(file);
  };

  return (
    <section style={{ background: "white", border: "1px solid var(--border, #e5e7eb)", borderRadius: "10px", overflow: "hidden" }}>
      <button type="button" aria-expanded={expanded} disabled={isActionLocked()} onClick={() => setExpanded((value) => !value)}
        style={{ display: "block", width: "100%", padding: "16px 20px", textAlign: "left", background: "white", border: 0, color: "var(--ink, #111827)", fontSize: "15px", fontWeight: 600, cursor: "pointer" }}>
        {expanded ? "▾" : "▸"} {projectName}
      </button>
      {expanded && (
        <>
          <div style={{ padding: "0 20px 12px" }}>
            {!canPromote && <p style={{ fontSize: "12px", color: "#92400e" }}>OpenAI APIキーが未設定のため、Loreへの昇格・AI編集はできません。</p>}
            {error && <p role="alert" style={{ fontSize: "12px", color: "#b91c1c" }}>{error}</p>}
            <ProjectMemoryTopicList topics={topics} loading={loading} error={error} expandedIds={expandedIds} onToggleExpanded={onToggleExpanded}
              canPromote={canPromote} canInstructionEdit={canInstructionEdit} promotingTopicId={promotingTopicId} actionsLocked={isActionLocked()} chatInclusionTopicId={chatInclusionTopicId} onChatInclusionChange={(topic, include) => void setChatInclusion(topic, include)}
              pendingConfirm={pendingConfirm} onConfirmPromotion={() => void confirmPromotion()} onCancelPromotion={cancelPromotionConfirm}
            onDownload={downloadTopicFile} onPromote={(topic) => void promote(topic)} onInstructionEdit={openInstructionEdit} />
          </div>
          <div style={{ padding: "12px 20px 16px", borderTop: "1px solid var(--border, #e5e7eb)", display: "flex", justifyContent: "flex-end" }}>
            <input ref={uploadInputRef} type="file" accept=".md,.txt" onChange={selectUpload} style={{ display: "none" }} />
            <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={isActionLocked()}
              style={{ padding: "8px 16px", borderRadius: "7px", border: "1px solid var(--border, #e5e7eb)", background: "white", cursor: "pointer" }}>ファイルをアップロード</button>
          </div>
          <ProjectMemoryUploadConfirm confirm={uploadConfirm} uploading={uploading} onCancel={cancelUploadConfirm} onExecute={() => void executeUpload()} />
          <ProjectMemoryInstructionEditModal edit={instructionEdit} onInstructionChange={setInstructionEditInstruction}
            onGenerate={(instruction) => void generateInstructionEditPreview(instruction)}
            onCancelGeneration={cancelInstructionEditGeneration} onBackToInput={backToInstructionInput}
            onApply={() => void applyInstructionEditPreview()} onClose={closeInstructionEdit} />
        </>
      )}
    </section>
  );
}
