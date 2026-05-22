"use client";

import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import MarkdownRenderer from "@/components/MarkdownRenderer";

interface NovelFile {
  name: string;
  content: string;
}

const CHECK_ITEMS = [
  "伏線：張られたが回収されていない伏線",
  "矛盾：設定・時系列・キャラの言動の矛盾点",
  "口調ブレ：キャラクターごとの話し方の一貫性",
  "固有名詞：人名・地名・固有名詞の表記揺れ",
];

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function formatCost(usd: number): string {
  if (usd < 0.001) return "< $0.001";
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

async function readFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (utf8.includes("�")) {
    return new TextDecoder("shift-jis").decode(buffer);
  }
  return utf8;
}

export default function NovelCheckPage() {
  const [files, setFiles] = useState<NovelFile[]>([]);
  const [checkItems, setCheckItems] = useState<string[]>([...CHECK_ITEMS]);
  const [selectedModel, setSelectedModel] = useState<"gemini-2.5-flash" | "gemini-2.5-pro">("gemini-2.5-flash");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState("");
  const [metaInfo, setMetaInfo] = useState<{ totalChars: number; estimatedTokens: number } | null>(null);
  const [saveTitle, setSaveTitle] = useState(`整合性チェック ${getTodayStr()}`);
  const [isSaving, setIsSaving] = useState(false);
  const [geminiKey, setGeminiKey] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setGeminiKey(localStorage.getItem("kabehub_gemini_key"));
  }, []);

  const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars * 1.2);
  const flashCost = (estimatedTokens / 1_000_000) * 0.075;
  const proCost = (estimatedTokens / 1_000_000) * 1.25;

  const processFiles = useCallback(async (fileList: FileList) => {
    const added: NovelFile[] = [];
    for (const file of Array.from(fileList)) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "txt" && ext !== "md") continue;
      if (file.size > 10 * 1024 * 1024) {
        alert(`「${file.name}」は10MBを超えています。スキップします。`);
        continue;
      }
      try {
        const content = await readFileAsText(file);
        added.push({ name: file.name, content });
      } catch {
        alert(`「${file.name}」の読み込みに失敗しました。`);
      }
    }
    if (added.length > 0) setFiles((prev) => [...prev, ...added]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const toggleCheckItem = (item: string) => {
    setCheckItems((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const handleStart = useCallback(async () => {
    if (!geminiKey || files.length === 0 || checkItems.length === 0 || isLoading) return;
    setIsLoading(true);
    setResult("");
    setMetaInfo(null);

    try {
      const res = await fetch("/api/novel-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gemini-api-key": geminiKey },
        body: JSON.stringify({ texts: files, modelId: selectedModel, checkItems }),
      });

      if (!res.ok) {
        const err = await res.json();
        setResult(`エラー: ${err.error ?? "不明なエラー"}`);
        setIsLoading(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "meta") {
              setMetaInfo({ totalChars: parsed.totalChars, estimatedTokens: parsed.estimatedTokens });
            } else if (parsed.type === "chunk") {
              setResult((prev) => prev + parsed.text);
            } else if (parsed.type === "done") {
              setIsLoading(false);
            }
          } catch {
            // 無視
          }
        }
      }
    } catch (err) {
      setResult(`エラー: ${err instanceof Error ? err.message : "不明なエラー"}`);
      setIsLoading(false);
    }
  }, [geminiKey, files, checkItems, isLoading, selectedModel]);

  const handleSave = useCallback(async () => {
    if (!result || isSaving) return;
    setIsSaving(true);
    try {
      const threadId = crypto.randomUUID();
      const title = saveTitle.trim() || "整合性チェック";

      // スレッド作成（upsert）
      await fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      const sharedHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...(geminiKey ? { "x-gemini-api-key": geminiKey } : {}),
      };

      // チェック実行メタデータをメモとして保存
      const checkNames = checkItems.map((item) => item.split("：")[0]).join("、");
      const metaContent = `【整合性チェック実行】\n対象ファイル: ${files[0]?.name ?? ""}${files.length > 1 ? ` ほか計${files.length}件` : ""}\n総文字数: 約${totalChars.toLocaleString()}文字\nチェック項目: ${checkNames}`;

      await fetch("/api/chat", {
        method: "POST",
        headers: sharedHeaders,
        body: JSON.stringify({ threadId, messages: [], userContent: metaContent, provider: "memo", isMemo: true, isTemporary: false }),
      });

      // AI結果をメモとして保存
      await fetch("/api/chat", {
        method: "POST",
        headers: sharedHeaders,
        body: JSON.stringify({ threadId, messages: [], userContent: result, provider: "memo", isMemo: true, isTemporary: false }),
      });

      window.location.href = `/?thread=${threadId}`;
    } catch (err) {
      alert(`保存に失敗しました: ${err instanceof Error ? err.message : "不明なエラー"}`);
      setIsSaving(false);
    }
  }, [result, isSaving, saveTitle, files, checkItems, totalChars, geminiKey]);

  const canStart = !!geminiKey && files.length > 0 && checkItems.length > 0 && !isLoading;

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 24px", fontFamily: "'DM Sans', sans-serif" }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "28px" }}>
        <a
          href="/"
          style={linkStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--ink-muted)"; }}
        >
          ← 壁打ちへ
        </a>
        <span style={{ color: "var(--border)" }}>|</span>
        <h1 style={{ margin: 0, fontSize: "20px", fontFamily: "'Lora', serif", fontWeight: 600, color: "var(--ink)" }}>
          📖 整合性チェック
        </h1>
      </div>

      {/* APIキー未設定警告 */}
      {!geminiKey && (
        <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#fef3c7", border: "1px solid #f59e0b", color: "#92400e", fontSize: "13px", marginBottom: "20px" }}>
          ⚙️ <a href="/settings" style={{ color: "#92400e", fontWeight: 600 }}>設定</a>からGemini APIキーを設定してください
        </div>
      )}

      {/* ファイルアップロードエリア */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "10px",
          padding: "32px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: isDragging ? "#f0f4ff" : "white",
          transition: "all 0.15s",
          marginBottom: "16px",
        }}
      >
        <div style={{ fontSize: "32px", marginBottom: "8px" }}>📄</div>
        <div style={{ fontSize: "14px", color: "var(--ink-muted)", marginBottom: "4px" }}>
          TXT・MDファイルをドロップ、またはクリックして選択
        </div>
        <div style={{ fontSize: "11px", color: "var(--ink-faint)" }}>複数選択可 · 1ファイル最大10MB</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* ファイルチップ */}
      {files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
          {files.map((f, i) => (
            <div
              key={i}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "16px", border: "1px solid var(--border)", background: "var(--sidebar-bg)", fontSize: "12px", color: "var(--ink-muted)" }}
            >
              <span>📄 {f.name}</span>
              <span style={{ fontSize: "11px", color: "var(--ink-faint)" }}>({(f.content.length / 1000).toFixed(1)}K文字)</span>
              <button
                onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((_, j) => j !== i)); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-faint)", fontSize: "13px", padding: "0 2px", lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* トークン概算 */}
      {files.length > 0 && (
        <div style={{ padding: "12px 14px", borderRadius: "8px", background: "var(--sidebar-bg)", border: "1px solid var(--border)", marginBottom: "20px" }}>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", fontSize: "12px", color: "var(--ink-muted)", marginBottom: "6px" }}>
            <span>総文字数: <strong style={{ color: "var(--ink)" }}>{totalChars.toLocaleString()}</strong>文字</span>
            <span>推定トークン数: <strong style={{ color: "var(--ink)" }}>{estimatedTokens.toLocaleString()}</strong></span>
            <span>flash概算: <strong style={{ color: "var(--ink)" }}>{formatCost(flashCost)}</strong></span>
            <span>pro概算: <strong style={{ color: "var(--ink)" }}>{formatCost(proCost)}</strong></span>
          </div>
          <div style={{ fontSize: "10px", color: "var(--ink-faint)" }}>
            ※日本語のトークン数は目安です。実際の請求額と若干異なる場合があります
          </div>
        </div>
      )}

      {/* チェック項目 */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-muted)", marginBottom: "8px", fontFamily: "'JetBrains Mono', monospace" }}>
          チェック項目
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {CHECK_ITEMS.map((item) => (
            <label key={item} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", color: "var(--ink)" }}>
              <input
                type="checkbox"
                checked={checkItems.includes(item)}
                onChange={() => toggleCheckItem(item)}
                style={{ accentColor: "var(--accent)", width: "14px", height: "14px", flexShrink: 0 }}
              />
              {item}
            </label>
          ))}
        </div>
      </div>

      {/* モデル選択 */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-muted)", marginBottom: "8px", fontFamily: "'JetBrains Mono', monospace" }}>
          モデル
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {(["gemini-2.5-flash", "gemini-2.5-pro"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setSelectedModel(m)}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: `1px solid ${selectedModel === m ? "var(--accent)" : "var(--border)"}`,
                background: selectedModel === m ? "var(--accent)" : "white",
                color: selectedModel === m ? "white" : "var(--ink-muted)",
                fontSize: "12px",
                cursor: "pointer",
                transition: "all 0.12s",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* チェック開始ボタン */}
      <button
        onClick={handleStart}
        disabled={!canStart}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: "8px",
          border: "none",
          background: canStart ? "var(--accent)" : "var(--border)",
          color: canStart ? "white" : "var(--ink-faint)",
          fontSize: "14px",
          fontWeight: 600,
          cursor: canStart ? "pointer" : "not-allowed",
          transition: "all 0.15s",
          marginBottom: "28px",
        }}
      >
        {isLoading ? "チェック中…" : "🔍 整合性チェック開始"}
      </button>

      {/* 結果表示 */}
      {(result || isLoading) && (
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-muted)", marginBottom: "10px", fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: "8px" }}>
            チェック結果
            {metaInfo && (
              <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--ink-faint)" }}>
                ({metaInfo.totalChars.toLocaleString()}文字 / 約{metaInfo.estimatedTokens.toLocaleString()}tok)
              </span>
            )}
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "16px 20px", background: "white", minHeight: "120px" }}>
            {result ? (
              <MarkdownRenderer content={result} />
            ) : (
              <div style={{ color: "var(--ink-faint)", fontSize: "13px" }}>生成中…</div>
            )}
          </div>
        </div>
      )}

      {/* KabeHubに保存 */}
      {result && !isLoading && (
        <div style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "16px 20px", background: "var(--sidebar-bg)" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)", marginBottom: "12px" }}>
            📌 KabeHubに保存
          </div>
          <input
            type="text"
            value={saveTitle}
            onChange={(e) => setSaveTitle(e.target.value)}
            placeholder="スレッドタイトル"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              fontSize: "13px",
              fontFamily: "'DM Sans', sans-serif",
              color: "var(--ink)",
              outline: "none",
              boxSizing: "border-box",
              marginBottom: "10px",
            }}
            onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "var(--accent-muted)"; }}
            onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "var(--border)"; }}
          />
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: "8px 20px",
              borderRadius: "6px",
              border: "none",
              background: isSaving ? "var(--border)" : "var(--accent)",
              color: isSaving ? "var(--ink-faint)" : "white",
              fontSize: "13px",
              fontWeight: 500,
              cursor: isSaving ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            {isSaving ? "保存中…" : "スレッドとして保存"}
          </button>
        </div>
      )}
    </div>
  );
}

const linkStyle: CSSProperties = {
  color: "var(--ink-muted)",
  textDecoration: "none" as const,
  fontSize: "13px",
  transition: "color 0.12s",
};
