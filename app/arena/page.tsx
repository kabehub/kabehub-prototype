"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Message } from "@/types";
import {
  ArenaBubble,
  ArenaThinking,
  ArenaMeta,
  PROVIDER_LABELS,
  PROVIDER_COLORS,
  Provider,
} from "@/components/ArenaTimeline";

// ── 型定義 ──────────────────────────────────────────────────────

interface ArenaConfig {
  ai1Provider: Provider;
  ai1Prompt: string;
  ai2Provider: Provider;
  ai2Prompt: string;
  topic: string;
  turnCount: number;
}

// ── ユーティリティ ───────────────────────────────────────────────

function getApiKeyHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const anthropic = localStorage.getItem("kabehub_anthropic_key");
    const gemini = localStorage.getItem("kabehub_gemini_key");
    const openai = localStorage.getItem("kabehub_openai_key");
    if (anthropic) headers["x-anthropic-api-key"] = anthropic;
    if (gemini) headers["x-gemini-api-key"] = gemini;
    if (openai) headers["x-openai-api-key"] = openai;
  } catch {}
  return headers;
}

// ── メインページ ─────────────────────────────────────────────────

export default function ArenaPage() {
  const [phase, setPhase] = useState<"setup" | "arena">("setup");

  const [config, setConfig] = useState<ArenaConfig>({
    ai1Provider: "claude",
    ai1Prompt: "",
    ai2Provider: "gemini",
    ai2Prompt: "",
    topic: "",
    turnCount: 2,
  });

  const [threadId] = useState(() => uuidv4());
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState<string | null>(null);
  const [thinkingIsAi1, setThinkingIsAi1] = useState(true);
  const [totalTurns, setTotalTurns] = useState(0);
  const [interventionText, setInterventionText] = useState("");
  const [showIntervention, setShowIntervention] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  // ── シェア関連 state ──────────────────────────────────────────
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const isFirstRun = messages.length === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingLabel]);

  const ai1Label = PROVIDER_LABELS[config.ai1Provider];
  const ai2Label = PROVIDER_LABELS[config.ai2Provider];

  // ── 1ターン実行 ───────────────────────────────────────────────
  const runOneTurn = useCallback(
    async (
      currentMessages: Message[],
      isAi1Turn: boolean,
      isVeryFirst: boolean,
      topic: string,
      interventionContent?: string
    ): Promise<Message> => {
      const currentProvider = isAi1Turn ? config.ai1Provider : config.ai2Provider;
      const currentPrompt = isAi1Turn ? config.ai1Prompt : config.ai2Prompt;
      const selfLabel = isAi1Turn ? ai1Label : ai2Label;
      const opponentLabel = isAi1Turn ? ai2Label : ai1Label;

      setThinkingLabel(`${selfLabel} (AI${isAi1Turn ? "1" : "2"})`);
      setThinkingIsAi1(isAi1Turn);

      const res = await fetch("/api/arena", {
        method: "POST",
        headers: getApiKeyHeaders(),
        body: JSON.stringify({
          threadId,
          history: currentMessages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
            provider: m.provider,
          })),
          currentProvider,
          currentPrompt,
          selfLabel,
          opponentLabel,
          isFirst: isVeryFirst,
          topic,
          interventionContent,
        }),
      });

      if (!res.ok) throw new Error("arena API error");
      const { message } = await res.json();
      return message as Message;
    },
    [config, threadId, ai1Label, ai2Label]
  );

  // ── Nターン実行 ───────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);

    const intervention = interventionText.trim() || undefined;
    setInterventionText("");
    setShowIntervention(false);

    try {
      let currentMessages = [...messages];
      const turns = config.turnCount;

      for (let i = 0; i < turns; i++) {
        const isVeryFirst = isFirstRun && i === 0;
        const ai1Msg = await runOneTurn(
          currentMessages,
          true,
          isVeryFirst,
          config.topic,
          i === 0 ? intervention : undefined
        );
        currentMessages = [...currentMessages, ai1Msg];
        setMessages([...currentMessages]);
        setThinkingLabel(null);

        const ai2Msg = await runOneTurn(currentMessages, false, false, config.topic);
        currentMessages = [...currentMessages, ai2Msg];
        setMessages([...currentMessages]);
        setThinkingLabel(null);
      }

      setTotalTurns((prev) => prev + turns);
    } catch (err) {
      console.error("arena run error:", err);
      alert(`エラーが発生しました: ${err instanceof Error ? err.message : "不明なエラー"}`);
    } finally {
      setIsRunning(false);
      setThinkingLabel(null);
    }
  }, [isRunning, messages, config, interventionText, isFirstRun, runOneTurn]);

  // ── シェアURL生成 ─────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    if (isSharing || messages.length === 0) return;
    setIsSharing(true);
    try {
      const newToken = uuidv4().replace(/-/g, "").slice(0, 16);

      const meta: ArenaMeta = {
        type: "arena",
        ai1Provider: config.ai1Provider,
        ai2Provider: config.ai2Provider,
        ai1Prompt: config.ai1Prompt || undefined,
        ai2Prompt: config.ai2Prompt || undefined,
        topic: config.topic,
      };

      const res = await fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          share_token: newToken,
          is_public: true,
          metadata: meta,
        }),
      });

      if (!res.ok) throw new Error("シェアの設定に失敗しました");
      setShareToken(newToken);
    } catch (err) {
      alert(`シェアに失敗しました: ${err instanceof Error ? err.message : "不明なエラー"}`);
    } finally {
      setIsSharing(false);
    }
  }, [isSharing, messages, config, threadId]);

  // ── シェアURLコピー ────────────────────────────────────────────
  const handleCopyShareUrl = useCallback(() => {
    if (!shareToken) return;
    const url = `${window.location.origin}/arena/${shareToken}`;
    navigator.clipboard.writeText(url);
    alert("URLをコピーしました！");
  }, [shareToken]);

  // ── XシェアURL生成 ────────────────────────────────────────────
  const buildXShareUrl = useCallback(() => {
    if (!shareToken) return "#";
    const url = `${window.location.origin}/arena/${shareToken}`;
    const text = `【AI闘技場】${ai1Label} vs ${ai2Label}\nお題：${config.topic}\n\n#KabeHub #AI闘技場`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  }, [shareToken, ai1Label, ai2Label, config.topic]);

  // ── セットアップ画面 ──────────────────────────────────────────

  if (phase === "setup") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: "640px", display: "flex", flexDirection: "column", gap: "32px" }}>

          {/* ヘッダー */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Lora', serif", fontSize: "28px", fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em", marginBottom: "8px" }}>
              ⚔️ AI 闘技場
            </div>
            <div style={{ fontSize: "13px", color: "var(--ink-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
              2つのAIにお題を与えて、議論を観戦しよう
            </div>
          </div>

          {/* お題 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", letterSpacing: "0.05em" }}>
              お題 *
            </label>
            <textarea
              value={config.topic}
              onChange={(e) => setConfig((c) => ({ ...c, topic: e.target.value }))}
              placeholder="例：AIは人間の仕事を奪うか？　/ 東京vs大阪、住むならどっち？"
              rows={3}
              style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "14px", fontFamily: "'DM Sans', sans-serif", color: "var(--ink)", background: "white", outline: "none", resize: "vertical", lineHeight: 1.6 }}
            />
          </div>

          {/* AI設定 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {(["ai1", "ai2"] as const).map((key, idx) => {
              const providerKey = `${key}Provider` as "ai1Provider" | "ai2Provider";
              const promptKey = `${key}Prompt` as "ai1Prompt" | "ai2Prompt";
              const prov = config[providerKey];
              const color = PROVIDER_COLORS[prov];
              return (
                <div key={key} style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px", background: color.bg, border: `1px solid ${color.border}`, borderRadius: "10px" }}>
                  <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: color.text, fontWeight: 600, letterSpacing: "0.05em" }}>
                    AI {idx + 1}
                  </div>
                  <select
                    value={prov}
                    onChange={(e) => setConfig((c) => ({ ...c, [providerKey]: e.target.value as Provider }))}
                    style={{ padding: "6px 10px", border: `1px solid ${color.border}`, borderRadius: "6px", fontSize: "13px", fontFamily: "'JetBrains Mono', monospace", color: color.text, background: "white", cursor: "pointer", outline: "none" }}
                  >
                    <option value="claude">Claude</option>
                    <option value="gemini">Gemini</option>
                    <option value="openai">ChatGPT</option>
                  </select>
                  <textarea
                    value={config[promptKey]}
                    onChange={(e) => setConfig((c) => ({ ...c, [promptKey]: e.target.value }))}
                    placeholder={`人格・役割設定（省略可）\n例：あなたは強硬な反対派です。`}
                    rows={3}
                    style={{ padding: "8px 10px", border: `1px solid ${color.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", color: "var(--ink)", background: "white", outline: "none", resize: "vertical", lineHeight: 1.5 }}
                  />
                </div>
              );
            })}
          </div>

          {/* ターン数設定 */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <label style={{ fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", whiteSpace: "nowrap" }}>
              最初のターン数
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              {[1, 2, 3, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setConfig((c) => ({ ...c, turnCount: n }))}
                  style={{ padding: "5px 14px", borderRadius: "6px", border: `1px solid ${config.turnCount === n ? "var(--accent)" : "var(--border)"}`, background: config.turnCount === n ? "var(--accent)" : "white", color: config.turnCount === n ? "white" : "var(--ink-muted)", fontSize: "13px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", transition: "all 0.12s" }}
                >
                  {n}
                </button>
              ))}
            </div>
            <span style={{ fontSize: "11px", color: "var(--ink-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
              ターン = AI1+AI2 各{config.turnCount}回ずつ
            </span>
          </div>

          {/* 開始ボタン */}
          <button
            onClick={() => { if (!config.topic.trim()) { alert("お題を入力してください"); return; } setPhase("arena"); }}
            style={{ padding: "14px", borderRadius: "8px", border: "none", background: config.topic.trim() ? "var(--accent)" : "var(--border)", color: "white", fontSize: "15px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: config.topic.trim() ? "pointer" : "default", transition: "all 0.15s" }}
          >
            ⚔️ 闘技場へ入場
          </button>

          <a href="/" style={{ textAlign: "center", fontSize: "12px", color: "var(--ink-muted)", fontFamily: "'JetBrains Mono', monospace", textDecoration: "none" }}>← 戻る</a>
        </div>
      </div>
    );
  }

  // ── 闘技場画面 ───────────────────────────────────────────────

  const ai1Color = PROVIDER_COLORS[config.ai1Provider];
  const ai2Color = PROVIDER_COLORS[config.ai2Provider];

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", flexDirection: "column" }}>

      {/* ヘッダー */}
      <div style={{ position: "sticky", top: 0, background: "var(--paper)", borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", gap: "16px", zIndex: 10 }}>
        <button
          onClick={() => { if (messages.length === 0 || window.confirm("セットアップ画面に戻りますか？（会話は保存済みです）")) setPhase("setup"); }}
          style={{ padding: "4px 10px", borderRadius: "5px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}
        >
          ← 設定
        </button>

        {/* AI1 vs AI2 バッジ */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, justifyContent: "center" }}>
          <span style={{ padding: "3px 10px", borderRadius: "5px", border: `1px solid ${ai1Color.border}`, background: ai1Color.bg, color: ai1Color.text, fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
            {ai1Label} (AI1)
          </span>
          <span style={{ fontSize: "13px", color: "var(--ink-faint)", fontWeight: 700 }}>⚔️</span>
          <span style={{ padding: "3px 10px", borderRadius: "5px", border: `1px solid ${ai2Color.border}`, background: ai2Color.bg, color: ai2Color.text, fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
            {ai2Label} (AI2)
          </span>
          {totalTurns > 0 && (
            <span style={{ fontSize: "11px", color: "var(--ink-faint)", fontFamily: "'JetBrains Mono', monospace", marginLeft: "8px" }}>
              {totalTurns}ターン経過
            </span>
          )}
        </div>

        {/* 人格設定ボタン */}
        <button
          onClick={() => setShowPromptEditor((v) => !v)}
          style={{ padding: "4px 10px", borderRadius: "5px", border: "1px solid var(--border)", background: showPromptEditor ? "var(--sidebar-bg)" : "white", color: "var(--ink-muted)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}
        >
          🧬 人格設定
        </button>
      </div>

      {/* 人格設定ドロワー */}
      {showPromptEditor && (
        <div style={{ background: "var(--sidebar-bg)", borderBottom: "1px solid var(--border)", padding: "16px 24px" }}>
          <div style={{ maxWidth: "760px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {(["ai1", "ai2"] as const).map((key, idx) => {
              const providerKey = `${key}Provider` as "ai1Provider" | "ai2Provider";
              const promptKey = `${key}Prompt` as "ai1Prompt" | "ai2Prompt";
              const prov = config[providerKey];
              const color = PROVIDER_COLORS[prov];
              return (
                <div key={key}>
                  <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: color.text, marginBottom: "6px" }}>
                    AI{idx + 1} ({PROVIDER_LABELS[prov]}) の人格
                  </div>
                  <textarea
                    value={config[promptKey]}
                    onChange={(e) => setConfig((c) => ({ ...c, [promptKey]: e.target.value }))}
                    placeholder="人格・役割設定（省略可）"
                    rows={3}
                    style={{ width: "100%", padding: "8px 10px", border: `1px solid ${color.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", color: "var(--ink)", background: "white", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* お題バナー */}
      <div style={{ maxWidth: "760px", width: "100%", margin: "0 auto", padding: "20px 24px 0" }}>
        <div style={{ background: "#f5f3ff", border: "1px solid #e9d5ff", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", color: "#4c1d95", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
          <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "#7c3aed", display: "block", marginBottom: "4px", letterSpacing: "0.05em" }}>お題</span>
          {config.topic}
        </div>
      </div>

      {/* タイムライン */}
      <div style={{ flex: 1, maxWidth: "760px", width: "100%", margin: "0 auto", padding: "24px 24px 32px" }}>
        {messages.length === 0 && !isRunning && (
          <div style={{ textAlign: "center", marginTop: "60px", color: "var(--ink-muted)", fontSize: "13px", fontFamily: "'JetBrains Mono', monospace" }}>
            ▶️ 実行ボタンを押して闘技場を開始してください
          </div>
        )}
        {(() => {
          let aiIdx = 0;
          return messages.map((msg) => {
            const isAiMsg = msg.role === "assistant";
            const currentAiIdx = isAiMsg ? aiIdx : -1;
            if (isAiMsg) aiIdx++;
            return (
              <ArenaBubble
                key={msg.id}
                message={msg}
                ai1Label={ai1Label}
                ai2Label={ai2Label}
                aiMessageIndex={currentAiIdx}
              />
            );
          });
        })()}
        {thinkingLabel && (
          <ArenaThinking label={thinkingLabel} isAi1={thinkingIsAi1} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* 操作フッター */}
      <div style={{ position: "sticky", bottom: 0, background: "var(--paper)", borderTop: "1px solid var(--border)", padding: "16px 24px", zIndex: 10 }}>
        <div style={{ maxWidth: "760px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "10px" }}>

          {/* シェアパネル（token取得後に表示） */}
          {shareToken && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "7px" }}>
              <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "#166534", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {typeof window !== "undefined" ? `${window.location.origin}/arena/${shareToken}` : ""}
              </span>
              <button
                onClick={handleCopyShareUrl}
                style={{ padding: "4px 10px", borderRadius: "5px", border: "1px solid #86efac", background: "white", color: "#166534", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                📋 コピー
              </button>
              <a
                href={buildXShareUrl()}
                target="_blank"
                rel="noopener noreferrer"
                style={{ padding: "4px 10px", borderRadius: "5px", border: "1px solid #1d9bf0", background: "#1d9bf0", color: "white", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" }}
              >
                𝕏 シェア
              </a>
            </div>
          )}

          {/* 神の介入ボックス（トグル） */}
          {showIntervention && (
            <div style={{ display: "flex", gap: "8px" }}>
              <textarea
                value={interventionText}
                onChange={(e) => setInterventionText(e.target.value)}
                placeholder="両AIへのメッセージ（次のターン開始時に渡されます）"
                rows={2}
                style={{ flex: 1, padding: "8px 12px", border: "1px solid #fde68a", borderRadius: "7px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", color: "var(--ink)", background: "#fefce8", outline: "none", resize: "none" }}
              />
            </div>
          )}

          {/* ボタン列 */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {/* 介入ボタン */}
            <button
              onClick={() => setShowIntervention((v) => !v)}
              style={{ padding: "8px 14px", borderRadius: "7px", border: `1px solid ${showIntervention ? "#fde68a" : "var(--border)"}`, background: showIntervention ? "#fefce8" : "white", color: showIntervention ? "#78350f" : "var(--ink-muted)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap" }}
            >
              ⚡ 介入
            </button>

            {/* ターン数セレクター */}
            <select
              value={config.turnCount}
              onChange={(e) => setConfig((c) => ({ ...c, turnCount: Number(e.target.value) }))}
              disabled={isRunning}
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "7px", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", background: "white", cursor: "pointer", outline: "none" }}
            >
              {[1, 2, 3, 5].map((n) => (
                <option key={n} value={n}>{n}ターン</option>
              ))}
            </select>

            {/* 実行ボタン */}
            <button
              onClick={handleRun}
              disabled={isRunning}
              style={{ flex: 1, padding: "10px", borderRadius: "7px", border: "none", background: isRunning ? "var(--border)" : "var(--accent)", color: "white", fontSize: "14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: isRunning ? "default" : "pointer", transition: "all 0.15s" }}
            >
              {isRunning
                ? "⚔️ 戦闘中…"
                : isFirstRun
                ? `▶️ ${config.turnCount}ターン 開始`
                : `▶️ ${config.turnCount}ターン 続ける`}
            </button>

            {/* シェアボタン */}
            <button
              onClick={handleShare}
              disabled={isSharing || messages.length === 0}
              title={messages.length === 0 ? "対局を開始してからシェアできます" : "観戦URLを生成"}
              style={{ padding: "10px 14px", borderRadius: "7px", border: "1px solid var(--border)", background: shareToken ? "#f0fdf4" : "white", color: shareToken ? "#166534" : messages.length === 0 ? "var(--ink-faint)" : "var(--ink-muted)", fontSize: "13px", cursor: messages.length === 0 ? "default" : "pointer", transition: "all 0.12s", whiteSpace: "nowrap" }}
            >
              {isSharing ? "…" : shareToken ? "✅ 共有中" : "🔗 シェア"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
