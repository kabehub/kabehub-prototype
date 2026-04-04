"use client";

import { useState } from "react";

export interface ExportOptions {
  omitCsv: boolean;
}

interface ExportModalProps {
  format: "txt" | "md" | "csv" | null;
  onClose: () => void;
  onExport: (format: "txt" | "md" | "csv", options: ExportOptions) => void;
}

const FORMAT_LABEL: Record<"txt" | "md" | "csv", string> = {
  txt: "TXT",
  md: "Markdown",
  csv: "CSV",
};

const FORMAT_NOTE: Record<"txt" | "md" | "csv", string> = {
  txt: "プレーンテキスト形式でダウンロードします。",
  md: "Obsidian対応のMarkdown形式でダウンロードします。",
  csv: "Excel対応のCSV形式でダウンロードします。",
};

export default function ExportModal({ format, onClose, onExport }: ExportModalProps) {
  // CSVエクスポート時は省略オプションを表示しない
  const showOmitOption = format !== "csv";
  const [omitCsv, setOmitCsv] = useState<boolean>(true);

  if (!format) return null;

  const handleDownload = () => {
    onExport(format, { omitCsv: showOmitOption ? omitCsv : false });
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "24px",
          width: "380px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {/* タイトル */}
        <div>
          <div
            style={{
              fontFamily: "'Lora', serif",
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--ink)",
              marginBottom: "4px",
            }}
          >
            📤 {FORMAT_LABEL[format]}でエクスポート
          </div>
          <div style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
            {FORMAT_NOTE[format]}
          </div>
        </div>

        {/* オプション */}
        {showOmitOption && (
          <div
            style={{
              background: "var(--sidebar-bg)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--ink-muted)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "10px",
              }}
            >
              オプション
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={omitCsv}
                onChange={(e) => setOmitCsv(e.target.checked)}
                style={{ marginTop: "2px", accentColor: "var(--accent)", cursor: "pointer" }}
              />
              <div>
                <div style={{ fontSize: "13px", color: "var(--ink)", fontWeight: 500 }}>
                  CSVデータを省略する
                </div>
                <div style={{ fontSize: "11px", color: "var(--ink-muted)", marginTop: "2px", lineHeight: 1.5 }}>
                  コードブロック内のCSVを「（添付ファイル: N行）」に置き換えます。ログが読みやすくなります。
                </div>
              </div>
            </label>
          </div>
        )}

        {/* ボタン */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: "7px",
              border: "1px solid var(--border)",
              background: "white",
              color: "var(--ink-muted)",
              fontSize: "13px",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleDownload}
            style={{
              padding: "8px 20px",
              borderRadius: "7px",
              border: "none",
              background: "var(--accent)",
              color: "white",
              fontSize: "13px",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
            }}
          >
            ダウンロード
          </button>
        </div>
      </div>
    </div>
  );
}
