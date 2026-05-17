"use client";

import { useState, useEffect } from "react";

type NovelSettingsData = {
  characters: { name: string; role: string; faction: string; status: string; notes: string }[];
  factions: { name: string; description: string; members: string[] }[];
  glossary: { term: string; description: string }[];
};

interface NovelSettingsPaneProps {
  threadId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  isExtracting: boolean;
  settingsData: NovelSettingsData | null;
  onExtract: () => void;
}

export default function NovelSettingsPane({
  threadId,
  isOpen,
  onToggle,
  isExtracting,
  settingsData,
  onExtract,
}: NovelSettingsPaneProps) {
  const [isWide, setIsWide] = useState(true);
  const [expandedCharIdx, setExpandedCharIdx] = useState<number | null>(null);

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
            </div>

            {/* ボディ */}
            <div className="flex-1 overflow-y-auto">
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
            </div>
          </div>
        )}
      </div>
    </>
  );
}
