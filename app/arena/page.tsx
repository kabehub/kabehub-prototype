"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Message } from "@/types";
import MarkdownRenderer from "@/components/MarkdownRenderer";

// ── 型定義 ──────────────────────────────────────────────────────

type Provider = "claude" | "gemini" | "openai";

interface ArenaConfig {
  ai1Provider: Provider;
  ai1Prompt: string;
  ai2Provider: Provider;
  ai2Prompt: string;
  topic: string;
  turnCount: number; // 1回の実行で何ターン回すか（AI1→AI2 で1ターン）
}

// ── 定数 ────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Claude",
  gemini: "Gemini",
  openai: "ChatGPT",
};

const PROVIDER_COLORS: Record<Provider, { bg: string; border: string; text: string }> = {
  claude: { bg: "#f0f4ff", border: "#a5b4fc", text: "#3730a3" },
  gemini: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
  openai: { bg: "#fff7ed", border: "#fdba74", text: "#9a3412" },
};

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

// ── メッセージバブル（アリーナ専用） ────────────────────────────

function ArenaBubble({
  message,
  ai1Provider,
  ai2Provider,
  ai1Label,
  ai2Label,
  aiMessageIndex,
}: {
  message: Message;
  ai1Provider: Provider;
  ai2Provider: Provider;
  ai1Label: string;
  ai2Label: string;
  aiMessageIndex: number; // AI発言のみのインデックス（0始まり）。偶数=AI1、奇数=AI2
}) {
  const isUser = message.role === "user";
  // 同じprovider同士（例: ChatGPT vs ChatGPT）でも正しく左右分けするため
  // providerではなくAI発言のインデックスの偶奇で判定する
  const isAi1 = !isUser && aiMessageIndex % 2 === 0;
  // AI1が右、AI2が左（神の介入は中央）
  const isIntervention = isUser;

  const provider = message.provider as Provider | "user";
  const color =
    provider && provider !== "user" ? PROVIDER_COLORS[provider as Provider] : null;

  const label = isUser
    ? "⚡ 神の介入"
    : isAi1
    ? `${ai1Label} (AI1)`
    : `${ai2Label} (AI2)`;

  if (isIntervention) {
    // 神の介入：中央表示
    return (
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
        <div
          style={{
            background: "#fefce8",
            border: "1px solid #fde68a",
            borderRadius: "8px",
            padding: "8px 16px",
            fontSize: "13px",
            color: "#78350f",
            fontFamily: "'DM Sans', sans-serif",
            maxWidth: "480px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#b7791f", marginBottom: "4px", fontFamily: "'JetBrains Mono', monospace" }}>
            ⚡ 神の介入
          </div>
          {message.content.replace("【神からの介入】", "")}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isAi1 ? "flex-end" : "flex-start",
        marginBottom: "20px",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: color?.text ?? "var(--ink-faint)",
          marginBottom: "5px",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {label}
      </div>
      <div
        style={{
          maxWidth: "520px",
          borderRadius: isAi1 ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
          padding: "14px 18px",
          background: color?.bg ?? "var(--bubble-ai)",
          border: `1px solid ${color?.border ?? "var(--border)"}`,
          fontSize: "14px",
          lineHeight: 1.6,
          color: "var(--ink)",
          fontFamily: "'DM Sans', sans-serif",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <MarkdownRenderer content={message.content} />
      </div>
    </div>
  );
}

// ── ThinkingBubble（アリーナ用） ─────────────────────────────────

function ArenaThinking({ label, isAi1 }: { label: string; isAi1: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isAi1 ? "flex-end" : "flex-start", marginBottom: "20px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: "5px", fontFamily: "'JetBrains Mono', monospace" }}>
        {label}
      </div>
      <div style={{ borderRadius: isAi1 ? "12px 12px 2px 12px" : "12px 12px 12px 2px", padding: "14px 18px", background: "var(--bubble-ai)", border: "1px solid var(--border)", display: "flex", gap: "5px", alignItems: "center" }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="thinking-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--ink-faint)", display: "block", animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  );
}

// ── メインページ ─────────────────────────────────────────────────

export default function ArenaPage() {
  // セットアップ画面 or 闘技場画面
  const [phase, setPhase] = useState<"setup" | "arena">("setup");

  // 設定
  const [config, setConfig] = useState<ArenaConfig>({
    ai1Provider: "claude",
    ai1Prompt: "",
    ai2Provider: "gemini",
    ai2Prompt: "",
    topic: "",
    turnCount: 2,
  });

  // 闘技場状態
  const [threadId] = useState(() => uuidv4());
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState<string | null>(null);
  const [thinkingIsAi1, setThinkingIsAi1] = useState(true);
  const [totalTurns, setTotalTurns] = useState(0); // これまで実行したターン数
  const [interventionText, setInterventionText] = useState("");
  const [showIntervention, setShowIntervention] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const isFirstRun = messages.length === 0;

  // 自動スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingLabel]);

  const ai1Label = PROVIDER_LABELS[config.ai1Provider];
  const ai2Label = PROVIDER_LABELS[config.ai2Provider];

  // ── 1ターン実行（AI1またはAI2のどちらかが発言） ──────────────
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

    // 介入テキストを取得してクリア（最初のターンのみ渡す）
    const intervention = interventionText.trim() || undefined;
    setInterventionText("");
    setShowIntervention(false);

    try {
      let currentMessages = [...messages];
      const turns = config.turnCount;

      for (let i = 0; i < turns; i++) {
        // AI1ターン
        const isVeryFirst = isFirstRun && i === 0;
        const ai1Msg = await runOneTurn(
          currentMessages,
          true,
          isVeryFirst,
          config.topic,
          i === 0 ? intervention : undefined // 介入は最初の1回だけ
        );
        currentMessages = [...currentMessages, ai1Msg];
        setMessages([...currentMessages]);
        setThinkingLabel(null);

        // AI2ターン
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
                ai1Provider={config.ai1Provider}
                ai2Provider={config.ai2Provider}
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
          </div>
        </div>
      </div>
    </div>
  );
}
