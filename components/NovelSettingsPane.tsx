"use client";

import { useState, useEffect, useCallback } from "react";

type NovelSettingsData = {
  characters: { name: string; role: string; faction: string; status: string; notes: string }[];
  factions: { name: string; description: string; members: string[] }[];
  glossary: { term: string; description: string }[];
};

type LoreChunk = { id: string; chunk_text: string; created_at: string };

function splitIntoChunks(text: string, chunkSize = 400, overlap = 80): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize - overlap;
  }
  return chunks;
}

interface NovelSettingsPaneProps {
  threadId: string | null;
  threadTitle?: string;
  folderName?: string | null;
  isOpen: boolean;
  onToggle: () => void;
  isExtracting: boolean;
  settingsData: NovelSettingsData | null;
  onExtract: () => void;
}

export default function NovelSettingsPane({
  threadId,
  threadTitle,
  folderName,
  isOpen,
  onToggle,
  isExtracting,
  settingsData,
  onExtract,
}: NovelSettingsPaneProps) {
  const [isWide, setIsWide] = useState(true);
  const [expandedCharIdx, setExpandedCharIdx] = useState<number | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<"db" | "lore">("db");
  const [loreText, setLoreText] = useState("");
  const [loreChunks, setLoreChunks] = useState<LoreChunk[]>([]);
  const [isEmbedding, setIsEmbedding] = useState(false);

  const downloadFile = (content: string, ext: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${threadTitle ?? "novel-settings"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMD = () => {
    if (!settingsData) return;
    const lines: string[] = [
      "# キャラクター設定DB",
      `生成日時: ${new Date().toLocaleString("ja-JP")}`,
      "",
    ];
    if (settingsData.characters.length > 0) {
      lines.push("## 👤 キャラクター", "");
      for (const c of settingsData.characters) {
        lines.push(
          `### ${c.name}`,
          `- **役割**: ${c.role}`,
          `- **勢力**: ${c.faction}`,
          `- **状態**: ${c.status}`,
          `- **備考**: ${c.notes}`,
          "",
        );
      }
    }
    if (settingsData.factions.length > 0) {
      lines.push("## ⚔️ 勢力", "");
      for (const f of settingsData.factions) {
        lines.push(
          `### ${f.name}`,
          f.description,
          `**メンバー**: ${f.members.join("、")}`,
          "",
        );
      }
    }
    if (settingsData.glossary.length > 0) {
      lines.push("## 📖 用語集", "");
      for (const g of settingsData.glossary) {
        lines.push(`### ${g.term}`, g.description, "");
      }
    }
    downloadFile(lines.join("\n"), "md");
  };

  const handleExportTXT = () => {
    if (!settingsData) return;
    const lines: string[] = [
      "キャラクター設定DB",
      `生成日時: ${new Date().toLocaleString("ja-JP")}`,
      "",
    ];
    if (settingsData.characters.length > 0) {
      lines.push("=== キャラクター ===", "");
      for (const c of settingsData.characters) {
        lines.push(
          c.name,
          `役割: ${c.role}`,
          `勢力: ${c.faction}`,
          `状態: ${c.status}`,
          `備考: ${c.notes}`,
          "",
        );
      }
    }
    if (settingsData.factions.length > 0) {
      lines.push("=== 勢力 ===", "");
      for (const f of settingsData.factions) {
        lines.push(f.name, f.description, `メンバー: ${f.members.join("、")}`, "");
      }
    }
    if (settingsData.glossary.length > 0) {
      lines.push("=== 用語集 ===", "");
      for (const g of settingsData.glossary) {
        lines.push(g.term, g.description, "");
      }
    }
    downloadFile(lines.join("\n"), "txt");
  };

  const fetchLoreChunks = useCallback(async () => {
    if (!folderName) return;
    try {
      const res = await fetch(`/api/lore/chunks?folder_name=${encodeURIComponent(folderName)}`);
      if (res.ok) {
        const data = await res.json();
        setLoreChunks(data.chunks ?? []);
      }
    } catch { /* 無視 */ }
  }, [folderName]);

  useEffect(() => {
    if (isOpen && activeTab === "lore") fetchLoreChunks();
  }, [isOpen, activeTab, fetchLoreChunks]);

  const handleEmbed = async (text: string) => {
    if (!folderName || !text.trim()) return;
    const openaiKey = localStorage.getItem("kabehub_openai_key") ?? "";
    if (!openaiKey) {
      alert("OpenAI APIキーが設定されていません。右上の「🔑 APIキー」から設定してください。");
      return;
    }
    setIsEmbedding(true);
    try {
      const chunks = splitIntoChunks(text).map(t => ({ text: t }));
      const res = await fetch("/api/lore/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-openai-api-key": openaiKey },
        body: JSON.stringify({ folderName, chunks }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`登録エラー: ${err.error ?? "不明なエラー"}`);
      } else {
        await fetchLoreChunks();
      }
    } catch {
      alert("登録中にエラーが発生しました。");
    } finally {
      setIsEmbedding(false);
    }
  };

  const handleGenerateFromDB = async () => {
    if (!settingsData) {
      alert("先にキャラクターDBを抽出してください。");
      return;
    }
    const parts: string[] = [];
    for (const c of settingsData.characters) {
      parts.push(`[キャラクター: ${c.name}]\n役割: ${c.role}\n勢力: ${c.faction}\n状態: ${c.status}\n備考: ${c.notes}`);
    }
    for (const f of settingsData.factions) {
      parts.push(`[勢力: ${f.name}]\n${f.description}\nメンバー: ${f.members.join("、")}`);
    }
    for (const g of settingsData.glossary) {
      parts.push(`[用語: ${g.term}]\n${g.description}`);
    }
    if (parts.length === 0) {
      alert("DBにデータがありません。");
      return;
    }
    await handleEmbed(parts.join("\n\n"));
  };

  const handleDeleteChunk = async (id: string) => {
    try {
      const res = await fetch(`/api/lore/chunks/${id}`, { method: "DELETE" });
      if (res.ok) setLoreChunks(prev => prev.filter(c => c.id !== id));
    } catch { /* 無視 */ }
  };

  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= 1280);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const paneWidth = isOpen ? 220 : 0;

  const paneStyle: React.CSSProperties = isWide
    ? {
        width: paneWidth,
        minWidth: paneWidth,
        overflow: "hidden",
        transition: "width 0.2s ease, min-width 0.2s ease",
        borderLeft: isOpen ? "1px solid var(--border)" : "none",
        background: "white",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        flexShrink: 0,
      }
    : {
        position: "fixed",
        right: 0,
        top: 0,
        width: paneWidth,
        height: "100vh",
        overflow: "hidden",
        transition: "width 0.2s ease",
        borderLeft: isOpen ? "1px solid var(--border)" : "none",
        background: "white",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
      };

  const toggleBtnStyle: React.CSSProperties = {
    position: "fixed",
    right: isOpen ? 220 : 0,
    top: "calc(50% + 56px)",
    transform: "translateY(-50%)",
    width: 24,
    height: 48,
    background: "white",
    border: "1px solid var(--border)",
    borderRight: "none",
    borderRadius: "6px 0 0 6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    color: "var(--ink-muted)",
    transition: "right 0.2s ease",
    zIndex: 101,
    boxShadow: "-2px 0 6px rgba(0,0,0,0.06)",
  };

  return (
    <>
      <button style={toggleBtnStyle} onClick={onToggle} title={isOpen ? "Novel DBを閉じる" : "Novel DBを開く"}>
        {isOpen ? "▶" : "🎭"}
      </button>
      <div style={paneStyle}>
        {isOpen && (
          <div className="flex flex-col h-full">
            {/* ヘッダー */}
            <div
              className="flex items-center justify-between px-3 py-2 shrink-0"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <span
                className="text-[10px] font-mono uppercase tracking-widest"
                style={{ color: "var(--ink-faint)" }}
              >
                Novel DB
              </span>
              <div className="flex items-center gap-1">
                {activeTab === "db" && (
                  <>
                    <button
                      onClick={onExtract}
                      disabled={isExtracting || !threadId}
                      className="text-[9px] px-2 py-0.5 rounded border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
                    >
                      {isExtracting ? (
                        <span className="animate-pulse">抽出中…</span>
                      ) : (
                        "🔄 更新"
                      )}
                    </button>
                    {settingsData && (
                      <div className="relative">
                        <button
                          onClick={() => setShowExportMenu(v => !v)}
                          className="text-[9px] px-2 py-0.5 rounded border transition-colors"
                          style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
                          title="エクスポート"
                        >
                          ↓
                        </button>
                        {showExportMenu && (
                          <>
                            <div
                              onClick={() => setShowExportMenu(false)}
                              style={{ position: "fixed", inset: 0, zIndex: 49 }}
                            />
                            <div
                              style={{
                                position: "absolute",
                                top: "calc(100% + 4px)",
                                right: 0,
                                background: "white",
                                border: "1px solid var(--border)",
                                borderRadius: "8px",
                                padding: "4px",
                                boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                                zIndex: 50,
                              }}
                            >
                              <button
                                onClick={() => { handleExportMD(); setShowExportMenu(false); }}
                                className="block w-full text-left text-[10px] px-3 py-1.5 rounded hover:bg-gray-50"
                                style={{ color: "var(--ink-muted)" }}
                              >
                                MD
                              </button>
                              <button
                                onClick={() => { handleExportTXT(); setShowExportMenu(false); }}
                                className="block w-full text-left text-[10px] px-3 py-1.5 rounded hover:bg-gray-50"
                                style={{ color: "var(--ink-muted)" }}
                              >
                                TXT
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* タブ切り替え */}
            <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
              {(["db", "lore"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="flex-1 text-[10px] py-1.5 transition-colors"
                  style={{
                    color: activeTab === tab ? "var(--accent)" : "var(--ink-faint)",
                    borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
                    background: "none",
                    fontWeight: activeTab === tab ? 600 : 400,
                  }}
                >
                  {tab === "db" ? "DB" : "📚 Lore"}
                </button>
              ))}
            </div>

            {/* ボディ */}
            <div className="flex-1 overflow-y-auto">
              {/* Loreタブ */}
              {activeTab === "lore" && (
                <div className="flex flex-col gap-2 p-3">
                  <div className="text-[10px]" style={{ color: "var(--ink-faint)" }}>
                    {loreChunks.length} chunk{loreChunks.length !== 1 ? "s" : ""} registered
                  </div>

                  <textarea
                    value={loreText}
                    onChange={e => setLoreText(e.target.value)}
                    placeholder="設定資料をここに貼り付け…"
                    rows={6}
                    className="w-full text-[11px] rounded border resize-y p-2 leading-relaxed"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--ink)",
                      background: "#fafaf9",
                      outline: "none",
                    }}
                  />

                  <button
                    onClick={() => handleEmbed(loreText)}
                    disabled={isEmbedding || !loreText.trim() || !folderName}
                    className="w-full text-[11px] py-1.5 rounded border font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "none" }}
                  >
                    {isEmbedding ? "同期中..." : "📚 Lore Bookに登録"}
                  </button>

                  <button
                    onClick={handleGenerateFromDB}
                    disabled={isEmbedding || !settingsData || !folderName}
                    className="w-full text-[11px] py-1.5 rounded border font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    style={{ borderColor: "var(--border)", color: "var(--ink-muted)", background: "none" }}
                  >
                    {isEmbedding ? "同期中..." : "🎭 キャラDBから生成"}
                  </button>

                  {loreChunks.length > 0 && (
                    <div className="mt-1">
                      <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "var(--ink-faint)" }}>
                        登録済みチャンク
                      </div>
                      <div className="flex flex-col gap-1">
                        {loreChunks.map(chunk => (
                          <div
                            key={chunk.id}
                            className="flex items-center gap-1 rounded px-2 py-1"
                            style={{ background: "#f5f5f3", border: "1px solid var(--border)" }}
                          >
                            <span className="flex-1 text-[10px] truncate" style={{ color: "var(--ink-muted)" }} title={chunk.chunk_text}>
                              {chunk.chunk_text.slice(0, 40)}{chunk.chunk_text.length > 40 ? "…" : ""}
                            </span>
                            <button
                              onClick={() => handleDeleteChunk(chunk.id)}
                              className="shrink-0 text-[9px] px-1 rounded hover:bg-red-50"
                              style={{ color: "var(--ink-faint)" }}
                              title="削除"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* DBタブ（既存コンテンツ） */}
              {activeTab === "db" && <>
              {/* ローディング */}
              {isExtracting && (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
                  <span className="text-2xl animate-spin inline-block">⚙️</span>
                  <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                    会話を解析中…
                  </span>
                </div>
              )}

              {/* 空状態 */}
              {!isExtracting && !settingsData && (
                <div className="flex flex-col items-center justify-center h-full gap-4 p-4 text-center">
                  <p
                    className="text-[11px] whitespace-pre-line leading-relaxed"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {"スレッドの会話から\nキャラ・勢力・用語を\n自動抽出します"}
                  </p>
                  <button
                    onClick={onExtract}
                    disabled={!threadId}
                    className="px-3 py-2 rounded-md text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "var(--accent)", color: "white" }}
                  >
                    🎭 設定を抽出
                  </button>
                </div>
              )}

              {/* データ表示 */}
              {!isExtracting && settingsData && (
                <div className="py-2">
                  {/* Characters */}
                  {settingsData.characters.length > 0 && (
                    <section>
                      <div
                        className="px-3 py-1 text-[9px] font-mono uppercase tracking-widest"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        👤 Characters
                      </div>
                      {settingsData.characters.map((char, i) => (
                        <div key={i}>
                          <button
                            className="block w-full text-left transition-colors"
                            style={{
                              padding: "5px 10px",
                              background: "none",
                              border: "none",
                              borderLeft: "2px solid var(--border)",
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f7f7f5"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                            onClick={() => setExpandedCharIdx(expandedCharIdx === i ? null : i)}
                          >
                            <span
                              className={`text-[11px] font-medium block leading-snug ${char.status === "死亡" ? "opacity-50 line-through" : ""}`}
                              style={{ color: "var(--ink)" }}
                            >
                              {char.name}
                            </span>
                            <span className="text-[9px] block" style={{ color: "var(--ink-faint)" }}>
                              {char.role}{char.faction ? ` · ${char.faction}` : ""}
                            </span>
                          </button>
                          {expandedCharIdx === i && char.notes && (
                            <div
                              className="text-[10px] leading-relaxed"
                              style={{
                                padding: "5px 10px",
                                color: "var(--ink-muted)",
                                background: "#f9f9f7",
                                borderLeft: "2px solid var(--border)",
                              }}
                            >
                              {char.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </section>
                  )}

                  {/* Factions */}
                  {settingsData.factions.length > 0 && (
                    <section className="mt-2">
                      <div
                        className="px-3 py-1 text-[9px] font-mono uppercase tracking-widest"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        ⚔️ Factions
                      </div>
                      {settingsData.factions.map((faction, i) => (
                        <button
                          key={i}
                          className="block w-full text-left"
                          style={{
                            padding: "5px 10px",
                            background: "none",
                            border: "none",
                            borderLeft: "2px solid var(--border)",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f7f7f5"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                        >
                          <span
                            className="text-[11px] font-medium block leading-snug"
                            style={{ color: "var(--ink)" }}
                          >
                            {faction.name}
                          </span>
                          <span className="text-[9px] block" style={{ color: "var(--ink-faint)" }}>
                            {faction.members.join(" · ")}
                          </span>
                        </button>
                      ))}
                    </section>
                  )}

                  {/* Glossary */}
                  {settingsData.glossary.length > 0 && (
                    <section className="mt-2">
                      <div
                        className="px-3 py-1 text-[9px] font-mono uppercase tracking-widest"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        📖 Glossary
                      </div>
                      {settingsData.glossary.map((item, i) => (
                        <button
                          key={i}
                          className="block w-full text-left"
                          style={{
                            padding: "5px 10px",
                            background: "none",
                            border: "none",
                            borderLeft: "2px solid var(--border)",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f7f7f5"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                        >
                          <span
                            className="text-[11px] font-medium block leading-snug"
                            style={{ color: "var(--ink)" }}
                          >
                            {item.term}
                          </span>
                          <span className="text-[9px] block" style={{ color: "var(--ink-faint)" }}>
                            {item.description}
                          </span>
                        </button>
                      ))}
                    </section>
                  )}
                </div>
              )}
              </>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
