"use client";

import { useState } from "react";

interface PublishConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isDefaultTitle?: boolean;
  defaultTitle?: string;
}

export default function PublishConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  isDefaultTitle = false,
  defaultTitle = "",
}: PublishConfirmModalProps) {
  const [checked, setChecked] = useState([false, false, false]);

  if (!isOpen) return null;

  const allChecked = checked.every(Boolean);

  const toggle = (i: number) => {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  };

  const handleConfirm = () => {
    if (!allChecked) return;
    setChecked([false, false, false]); // リセット
    onConfirm();
  };

  const handleCancel = () => {
    setChecked([false, false, false]); // リセット
    onCancel();
  };

  const items = [
    "個人情報（氏名・住所・電話番号・メールアドレス等）が含まれていません",
    "第三者のプライバシーを侵害する内容ではありません",
    "誹謗中傷・差別的表現・違法なコンテンツは含まれていません",
  ];

  return (
    <>
      {/* オーバーレイ */}
      <div
        onClick={handleCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 1000,
        }}
      />

      {/* モーダル本体 */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1001,
          background: "var(--color-background-primary, #ffffff)",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: "12px",
          padding: "28px 28px 24px",
          width: "min(480px, calc(100vw - 32px))",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        }}
      >
        {/* ヘッダー */}
        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--ink-muted, #6b7280)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            公開する前に確認
          </div>
          <div
            style={{
              fontSize: "17px",
              fontFamily: "'Lora', serif",
              color: "var(--ink, #111827)",
              fontWeight: 600,
              lineHeight: 1.3,
            }}
          >
            この壁打ちを公開しますか？
          </div>
        </div>

        {/* デフォルトタイトル警告（条件付き） */}
        {isDefaultTitle && (
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: "8px",
              padding: "10px 14px",
              marginBottom: "18px",
              display: "flex",
              gap: "8px",
              alignItems: "flex-start",
            }}
          >
            <span style={{ fontSize: "14px", flexShrink: 0 }}>⚠️</span>
            <div
              style={{
                fontSize: "12px",
                color: "#92400e",
                fontFamily: "'DM Sans', sans-serif",
                lineHeight: 1.5,
              }}
            >
              タイトルが自動生成のままです（「{defaultTitle}」）。
              <br />
              「キャンセル」を押してタイトルを編集することをおすすめします。
            </div>
          </div>
        )}

        {/* チェックボックス3項目 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          {items.map((label, i) => (
            <label
              key={i}
              onClick={() => toggle(i)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                cursor: "pointer",
              }}
            >
              {/* カスタムチェックボックス */}
              <div
                style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "4px",
                  border: checked[i]
                    ? "2px solid #16a34a"
                    : "2px solid #d1d5db",
                  background: checked[i] ? "#16a34a" : "white",
                  flexShrink: 0,
                  marginTop: "1px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                {checked[i] && (
                  <svg
                    width="10"
                    height="8"
                    viewBox="0 0 10 8"
                    fill="none"
                  >
                    <path
                      d="M1 4L3.5 6.5L9 1"
                      stroke="white"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--ink, #111827)",
                  fontFamily: "'DM Sans', sans-serif",
                  lineHeight: 1.5,
                }}
              >
                {label}
              </span>
            </label>
          ))}
        </div>

        {/* 注意書き */}
        <div
          style={{
            fontSize: "11px",
            color: "var(--ink-faint, #9ca3af)",
            fontFamily: "'DM Sans', sans-serif",
            lineHeight: 1.6,
            marginBottom: "22px",
            padding: "10px 12px",
            background: "var(--color-background-secondary, #f9fafb)",
            borderRadius: "6px",
          }}
        >
          公開されたコンテンツは通報により管理者が内容を確認し、
          ガイドライン違反と判断した場合は予告なく非公開化・削除されることがあります。
        </div>

        {/* ボタン */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={handleCancel}
            style={{
              padding: "8px 18px",
              borderRadius: "7px",
              border: "1px solid var(--border, #e5e7eb)",
              background: "white",
              color: "var(--ink-muted, #6b7280)",
              fontSize: "13px",
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            disabled={!allChecked}
            style={{
              padding: "8px 18px",
              borderRadius: "7px",
              border: "none",
              background: allChecked ? "#16a34a" : "#d1d5db",
              color: allChecked ? "white" : "#9ca3af",
              fontSize: "13px",
              fontFamily: "'DM Sans', sans-serif",
              cursor: allChecked ? "pointer" : "not-allowed",
              transition: "background 0.15s",
              fontWeight: 500,
            }}
          >
            同意して公開する
          </button>
        </div>
      </div>
    </>
  );
}
