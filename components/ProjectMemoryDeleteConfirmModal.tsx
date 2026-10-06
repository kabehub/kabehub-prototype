"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectMemoryDeleteTopic } from "@/lib/project-memory/use-project-memory-topics";

interface Props {
  confirm: ProjectMemoryDeleteTopic[] | null;
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ProjectMemoryDeleteConfirmModal({ confirm, submitting, error, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const currentRef = useRef({ submitting, onCancel });
  currentRef.current = { submitting, onCancel };
  // Include all snapshot fields; a changed selection invalidates acknowledgement immediately.
  const signature = confirm === null ? null : JSON.stringify(confirm);
  const [acknowledgement, setAcknowledgement] = useState({ signature, history: false, lore: false });
  useEffect(() => { setAcknowledgement({ signature, history: false, lore: false }); }, [signature]);
  const history = acknowledgement.signature === signature && acknowledgement.history;
  const lore = acknowledgement.signature === signature && acknowledgement.lore;
  const open = confirm !== null;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!currentRef.current.submitting) currentRef.current.onCancel();
      }
      if (event.key === "Tab") {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href]") ?? []);
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); dialogRef.current?.focus(); }
        else if (!dialogRef.current?.contains(document.activeElement) ||
          (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault(); (event.shiftKey ? last : first).focus();
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
  }, [open]);

  if (!confirm) return null;
  const needsLore = confirm.some(t => t.promotion.status !== "not_promoted");
  const ready = confirm.length > 0 && history && (!needsLore || lore) && !submitting;
  const cancel = () => { if (!currentRef.current.submitting) currentRef.current.onCancel(); };
  return <>
    <div onClick={cancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1200 }} />
    <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="memory-delete-title"
      aria-describedby="memory-delete-description" aria-busy={submitting} tabIndex={-1}
      style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 1201,
        width: "min(600px, calc(100vw - 32px))", maxHeight: "calc(100vh - 32px)", overflowY: "auto", padding: "28px",
        borderRadius: "12px", border: "1px solid var(--border, #e5e7eb)", background: "var(--color-background-primary, #ffffff)", boxShadow: "0 8px 32px rgba(0,0,0,0.16)" }}>
      <h2 id="memory-delete-title" style={{ fontSize: "17px", marginTop: 0 }}>{confirm.length}件のtopicを削除しますか？</h2>
      <div id="memory-delete-description" style={{ fontSize: "13px", lineHeight: 1.7 }}>
        <p>この操作ではProject Memoryだけを削除し、Loreは削除しません</p>
        <p>revision履歴も含めて完全に削除され、元に戻せません</p>
        <p>必要なら事前にDLでバックアップできます</p>
        {confirm.some(t => t.include_in_chat) && <p>次の送信からチャットに注入されなくなります</p>}
      </div>
      <ul style={{ fontSize: "12px", overflowWrap: "anywhere" }}>{confirm.map(t => <li key={t.id}>
        {t.topic_key} · rev.{t.revision} · {t.chars}字
        {t.promotion.status === "current" && <span> · 昇格済み</span>}
        {t.promotion.status === "stale" && <span> · 更新あり（過去revisionはLore昇格済み）</span>}
        {t.include_in_chat && <span> · チャット注入中</span>}
      </li>)}</ul>
      <label style={{ display: "block", fontSize: "13px", margin: "12px 0" }}>
        <input type="checkbox" checked={history} disabled={submitting} onChange={event => setAcknowledgement({ signature, history: event.currentTarget.checked, lore })} />
        revision履歴も含めて完全に削除され、元に戻せないことを理解しました
      </label>
      {needsLore && <>
        <label style={{ display: "block", fontSize: "13px", margin: "12px 0" }}>
          <input type="checkbox" checked={lore} disabled={submitting} onChange={event => setAcknowledgement({ signature, history, lore: event.currentTarget.checked })} />
          昇格済みLoreは残り、再生成後に再昇格すると重複する可能性があることを理解しました
        </label>
        <p style={{ fontSize: "12px" }}>旧Loreは {submitting ? <span>/memory</span> : <a href="/memory">/memory</a>} で確認・アーカイブできます。</p>
      </>}
      {error && <p role="alert" style={{ color: "#b91c1c", fontSize: "12px" }}>{error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <button ref={cancelRef} type="button" onClick={cancel} disabled={submitting}
          style={{ padding: "8px 16px", borderRadius: "7px", border: "1px solid var(--border, #e5e7eb)", background: "white" }}>キャンセル</button>
        <button type="button" disabled={!ready} onClick={() => { if (ready) onConfirm(); }}
          style={{ padding: "8px 16px", borderRadius: "7px", border: "none", background: ready ? "#b91c1c" : "#d1d5db", color: "white" }}>{submitting ? "削除中…" : "削除する"}</button>
      </div>
    </div>
  </>;
}
