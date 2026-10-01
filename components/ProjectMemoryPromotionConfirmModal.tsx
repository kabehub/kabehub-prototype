"use client";

import { useEffect, useRef } from "react";
import type { ProjectMemoryPromotionConfirm } from "@/lib/project-memory/use-project-memory-topics";

interface Props {
  confirm: ProjectMemoryPromotionConfirm | null;
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ProjectMemoryPromotionConfirmModal({ confirm, submitting, error, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const currentRef = useRef({ submitting, onCancel });
  currentRef.current = { submitting, onCancel };
  const confirmedTopicId = confirm?.topic.id;

  useEffect(() => {
    if (!confirmedTopicId) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!currentRef.current.submitting) currentRef.current.onCancel();
      }
      if (event.key === "Tab") {
        const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (!first) {
          event.preventDefault();
          dialogRef.current?.focus();
        } else if (!dialogRef.current?.contains(document.activeElement) ||
          (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    const focusin = (event: FocusEvent) => {
      if (!dialogRef.current?.contains(event.target as Node)) {
        if (currentRef.current.submitting) dialogRef.current?.focus();
        else cancelRef.current?.focus();
      }
    };
    window.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focusin);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", focusin);
      if (previous?.isConnected) previous.focus();
    };
  }, [confirmedTopicId]);

  if (!confirm) return null;
  const cancel = () => { if (!currentRef.current.submitting) currentRef.current.onCancel(); };
  return <>
    <div onClick={cancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1200 }} />
    <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="promotion-confirm-title"
      aria-describedby="promotion-confirm-description" aria-busy={submitting} tabIndex={-1}
      style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 1201,
        width: "min(560px, calc(100vw - 32px))", maxHeight: "calc(100vh - 32px)", overflowY: "auto",
        padding: "28px", borderRadius: "12px", border: "1px solid var(--border, #e5e7eb)",
        background: "var(--color-background-primary, #ffffff)", boxShadow: "0 8px 32px rgba(0,0,0,0.16)" }}>
      <h2 id="promotion-confirm-title" style={{ fontSize: "17px", marginTop: 0 }}>「{confirm.topic.topic_key}」をLoreに再昇格しますか？</h2>
      <p id="promotion-confirm-description" style={{ fontSize: "13px", lineHeight: 1.7 }}>
        このtopicの{confirm.editedLores.length > 1 ? `${confirm.editedLores.length}件のLore` : "Lore"}には手動編集が含まれています。
        再昇格すると、現在のProject Memoryの内容で新しいLoreが作られ、既存Loreの編集内容は引き継がれず、Lore一覧から見えなくなります。
      </p>
      <ul style={{ fontSize: "12px", overflowWrap: "anywhere" }}>{confirm.editedLores.map((row) => <li key={row.id}>{row.title}</li>)}</ul>
      {error && <p role="alert" style={{ color: "#b91c1c", fontSize: "12px" }}>{error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
        <button ref={cancelRef} type="button" onClick={cancel} disabled={submitting}
          style={{ padding: "8px 16px", borderRadius: "7px", border: "1px solid var(--border, #e5e7eb)", background: "white" }}>キャンセル</button>
        <button type="button" onClick={() => { if (!submitting) onConfirm(); }} disabled={submitting}
          style={{ padding: "8px 16px", borderRadius: "7px", border: "none", background: submitting ? "#d1d5db" : "#b91c1c", color: "white" }}>
          {submitting ? "昇格中…" : "編集を破棄して再昇格"}
        </button>
      </div>
    </div>
  </>;
}
