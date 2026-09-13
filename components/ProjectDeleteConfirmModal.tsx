"use client";

interface ProjectDeleteConfirmModalProps {
  isOpen: boolean;
  projectName: string;
  canPromoteToLore: boolean;
  isDeleting: boolean;
  onDelete: (promoteToLore: boolean) => void;
  onCancel: () => void;
}

export default function ProjectDeleteConfirmModal({
  isOpen,
  projectName,
  canPromoteToLore,
  isDeleting,
  onDelete,
  onCancel,
}: ProjectDeleteConfirmModalProps) {
  if (!isOpen) return null;

  const handleCancel = () => {
    if (!isDeleting) onCancel();
  };

  return (
    <>
      <div
        onClick={handleCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 1000,
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-delete-title"
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
          width: "min(560px, calc(100vw - 32px))",
          boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
        }}
      >
        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "#b91c1c",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            Projectを削除
          </div>
          <div
            id="project-delete-title"
            style={{
              fontSize: "17px",
              fontFamily: "'Lora', serif",
              color: "var(--ink, #111827)",
              fontWeight: 600,
              lineHeight: 1.3,
            }}
          >
            「{projectName}」を削除しますか？
          </div>
        </div>

        <div
          style={{
            fontSize: "12px",
            color: "var(--ink-muted, #6b7280)",
            fontFamily: "'DM Sans', sans-serif",
            lineHeight: 1.7,
            marginBottom: "18px",
            padding: "12px 14px",
            background: "var(--color-background-secondary, #f9fafb)",
            borderRadius: "7px",
          }}
        >
          Project設定は削除されます。スレッド、既存Lore、Project Memoryとその変更履歴は残り、Projectとの紐付けだけが解除されます。
        </div>

        {!canPromoteToLore && (
          <div
            style={{
              fontSize: "11px",
              color: "#92400e",
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: "18px",
            }}
          >
            OpenAI APIキーが未設定のため、Project MemoryのLore昇格は選べません。
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "10px",
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={handleCancel}
            disabled={isDeleting}
            style={{
              padding: "8px 16px",
              borderRadius: "7px",
              border: "1px solid var(--border, #e5e7eb)",
              background: "white",
              color: "var(--ink-muted, #6b7280)",
              fontSize: "12px",
              fontFamily: "'DM Sans', sans-serif",
              cursor: isDeleting ? "not-allowed" : "pointer",
            }}
          >
            キャンセル
          </button>
          <button
            onClick={() => onDelete(false)}
            disabled={isDeleting}
            style={{
              padding: "8px 16px",
              borderRadius: "7px",
              border: "1px solid #dc2626",
              background: "white",
              color: "#b91c1c",
              fontSize: "12px",
              fontFamily: "'DM Sans', sans-serif",
              cursor: isDeleting ? "not-allowed" : "pointer",
              fontWeight: 500,
            }}
          >
            {isDeleting ? "削除中…" : "Loreに昇格せずProjectを削除"}
          </button>
          <button
            onClick={() => onDelete(true)}
            disabled={isDeleting || !canPromoteToLore}
            style={{
              padding: "8px 16px",
              borderRadius: "7px",
              border: "none",
              background:
                isDeleting || !canPromoteToLore ? "#d1d5db" : "#b91c1c",
              color:
                isDeleting || !canPromoteToLore ? "#9ca3af" : "white",
              fontSize: "12px",
              fontFamily: "'DM Sans', sans-serif",
              cursor:
                isDeleting || !canPromoteToLore
                  ? "not-allowed"
                  : "pointer",
              fontWeight: 500,
            }}
          >
            {isDeleting ? "削除中…" : "Loreに昇格してProjectを削除"}
          </button>
        </div>
      </div>
    </>
  );
}
