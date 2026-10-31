"use client";

import { supportsWebSearch } from "@/lib/modelRegistry";

export default function WebSearchToggle({ preference, onChange, modelId, available = true, disabled = false }: {
  preference: boolean;
  onChange: (value: boolean) => void;
  modelId: string;
  available?: boolean;
  disabled?: boolean;
}) {
  const supported = supportsWebSearch("claude", modelId);
  const inactive = !available || !supported || disabled;
  const enabled = preference && available && supported;
  const title = !available ? "なりきりモードではWeb検索は使えません" : !supported ? "このモデルはWeb検索に対応していません" : "Web検索: 回答前にWebを検索します（トークン消費が増え、応答に10〜30秒ほどかかります）";
  return (
    <button type="button" onClick={() => onChange(!preference)} disabled={inactive} aria-pressed={enabled} title={title}
      style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 12px", borderRadius: "20px", border: "1px solid", borderColor: enabled ? "var(--accent)" : "var(--border)", background: enabled ? "rgba(196,98,45,0.12)" : "transparent", color: inactive ? "var(--ink-faint)" : enabled ? "var(--accent)" : "var(--ink-muted)", fontSize: "11px", cursor: inactive ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
      🌐 Web検索
    </button>
  );
}
