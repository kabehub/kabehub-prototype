import type { ProjectMemoryUploadCandidate } from "@/lib/project-memory/use-project-memory-topics";

interface Props {
  confirm: ProjectMemoryUploadCandidate | null;
  uploading: boolean;
  onCancel: () => void;
  onExecute: () => void;
}

export default function ProjectMemoryUploadConfirm({ confirm, uploading, onCancel, onExecute }: Props) {
  if (!confirm) return null;
  return <>
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1102 }} />
    <div role="alertdialog" aria-modal="true" style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 1103, width: "min(440px, calc(100vw - 32px))", padding: "24px", borderRadius: "12px", background: "var(--color-background-primary, #ffffff)", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
      <p>{confirm.kind === "overwrite" ? `『${confirm.topicKey}』(現在rev.${confirm.currentRevision})をアップロードした内容で丸ごと上書きします。よろしいですか？` : `新しいtopic『${confirm.topicKey}』として保存します。よろしいですか？`}</p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <button type="button" onClick={onCancel} disabled={uploading}>キャンセル</button>
        <button type="button" onClick={onExecute} disabled={uploading}>実行</button>
      </div>
    </div>
  </>;
}
