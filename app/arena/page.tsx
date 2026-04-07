"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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

interface PlayerConfig {
  provider: Provider;
  prompt: string;
}

interface ArenaConfig {
  ai1Provider: Provider;
  ai1Prompt: string;
  ai2Provider: Provider;
  ai2Prompt: string;
  ai3Enabled: boolean;
  ai3Provider: Provider;
  ai3Prompt: string;
  topic: string;
  turnCount: number;
}

interface QueueItem {
  turn: number;
  pIdx: number;
  intervention?: string;
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

// 削除後のmessages配列からAI発言ブロック数を数え直してtotalTurnsを再計算
function calcTotalTurns(msgs: Message[], playerCount: number): number {
  const aiAndHumanCount = msgs.filter(
    (m) => m.role === "assistant" ||
    (m.role === "user" && m.content.startsWith("[Human"))
  ).length;
  // 全員1周 = playerCount発言 = 1ターン
  return Math.floor(aiAndHumanCount / playerCount);
}

// ── メインページ ─────────────────────────────────────────────────

export default function ArenaPage() {
  const [phase, setPhase] = useState<"setup" | "arena">("setup");

  const [config, setConfig] = useState<ArenaConfig>({
    ai1Provider: "claude",
    ai1Prompt: "",
    ai2Provider: "gemini",
    ai2Prompt: "",
    ai3Enabled: false,
    ai3Provider: "openai",
    ai3Prompt: "",
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
  const [humanInputText, setHumanInputText] = useState("");

  // actionQueue方式のstate
  const [actionQueue, setActionQueue] = useState<QueueItem[]>([]);
  const [waitingForHuman, setWaitingForHuman] = useState<number | null>(null); // null=待機なし / 0,1,2=playerインデックス

  // 継続介入モード: null=OFF / 0,1,2=乗っ取るpIdx
  // - セットアップで "human" を選んだ枠は handleStart で初期値に変換
  // - フッターのトグル＋selectで変更可能（AI枠への途中乗っ取り用）
  const [isContinuousTakeover, setIsContinuousTakeover] = useState<number | null>(null);

  // シェア関連
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>(messages);
  const isFirstRun = messages.length === 0;

  // messagesの最新値をrefで追跡（useEffect内での参照用）
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingLabel]);

  // ── players配列（useMemoで安定化） ────────────────────────────
  const players = useMemo((): PlayerConfig[] => {
    const list: PlayerConfig[] = [
      { provider: config.ai1Provider, prompt: config.ai1Prompt },
      { provider: config.ai2Provider, prompt: config.ai2Prompt },
    ];
    if (config.ai3Enabled) {
      list.push({ provider: config.ai3Provider, prompt: config.ai3Prompt });
    }
    return list;
  }, [
    config.ai1Provider, config.ai1Prompt,
    config.ai2Provider, config.ai2Prompt,
    config.ai3Enabled, config.ai3Provider, config.ai3Prompt,
  ]);

  const playerLabels = useMemo(
    () => players.map((p) => PROVIDER_LABELS[p.provider]),
    [players]
  );

  const ai1Label = playerLabels[0] ?? "AI1";
  const ai2Label = playerLabels[1] ?? "AI2";
  const ai3Label = playerLabels[2];

  // ── 1ターン実行（API呼び出し） ────────────────────────────────
  const runOneTurn = useCallback(
    async (
      currentMessages: Message[],
      player: PlayerConfig,
      pIdx: number,
      isVeryFirst: boolean,
      topic: string,
      interventionContent?: string
    ): Promise<Message> => {
      const selfLabel = playerLabels[pIdx] ?? `AI${pIdx + 1}`;
      const opponentLabel = playerLabels.filter((_, i) => i !== pIdx).join(" / ") || "相手";
      const isAi1Position = pIdx % 2 === 0;

      setThinkingLabel(`${selfLabel} (AI${pIdx + 1})`);
      setThinkingIsAi1(isAi1Position);

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
          currentProvider: player.provider,
          currentPrompt: player.prompt,
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
    [threadId, playerLabels]
  );

  // ── actionQueue駆動のuseEffect ────────────────────────────────
  useEffect(() => {
    if (actionQueue.length === 0 || !isRunning || waitingForHuman !== null) return;

    let isCancelled = false;

    const processNext = async () => {
      const nextAction = actionQueue[0];
      const player = players[nextAction.pIdx];

      if (!player) {
        setActionQueue((prev) => prev.slice(1));
        return;
      }

      // 停止判定:
      //   ① ネイティブ human（セットアップで "human" に設定した枠）
      //   ② 継続介入モードがONで、かつこのpIdxが乗っ取り対象
      const isNativeHuman = player.provider === "human";
      const isTakeoverTarget = isContinuousTakeover !== null && nextAction.pIdx === isContinuousTakeover;

      if (isNativeHuman || isTakeoverTarget) {
        setWaitingForHuman(nextAction.pIdx);
        setIsRunning(false);
        setThinkingLabel(null);
        return;
      }

      // AIターン実行
      try {
        const currentMessages = messagesRef.current;
        const isVeryFirst = currentMessages.length === 0 && nextAction.turn === 0 && nextAction.pIdx === 0;
        const interventionContent = nextAction.intervention;

        const newMsg = await runOneTurn(
          currentMessages,
          player,
          nextAction.pIdx,
          isVeryFirst,
          config.topic,
          interventionContent
        );

        if (!isCancelled) {
          setMessages((prev) => {
            const updated = [...prev, newMsg];
            messagesRef.current = updated;
            return updated;
          });
          setThinkingLabel(null);
          setActionQueue((prev) => prev.slice(1));
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("arena run error:", err);
          alert(`エラーが発生しました: ${err instanceof Error ? err.message : "不明なエラー"}`);
          setIsRunning(false);
          setThinkingLabel(null);
          setActionQueue([]);
        }
      }
    };

    processNext();

    return () => {
      isCancelled = true;
    };
  }, [actionQueue, isRunning, waitingForHuman, isContinuousTakeover, players, runOneTurn, config.topic]);

  // キューが空になったら実行完了
  useEffect(() => {
    if (actionQueue.length === 0 && isRunning && waitingForHuman === null) {
      setIsRunning(false);
      setTotalTurns((prev) => prev + config.turnCount);
    }
  }, [actionQueue, isRunning, waitingForHuman, config.turnCount]);

  // ── Nターン実行開始 ───────────────────────────────────────────
  const handleRun = useCallback(() => {
    if (isRunning || waitingForHuman !== null) return;
    setIsRunning(true);

    const intervention = interventionText.trim() || undefined;
    setInterventionText("");
    setShowIntervention(false);

    const turns = config.turnCount;
    const newQueue: QueueItem[] = [];

    for (let t = 0; t < turns; t++) {
      for (let p = 0; p < players.length; p++) {
        const item: QueueItem = { turn: t, pIdx: p };
        if (t === 0 && p === 0 && intervention) {
          item.intervention = intervention;
        }
        newQueue.push(item);
      }
    }

    setActionQueue(newQueue);
  }, [isRunning, waitingForHuman, interventionText, config.turnCount, players]);

  // ── 人間ターン送信 ────────────────────────────────────────────
  const handleHumanSubmit = useCallback(async () => {
    if (!humanInputText.trim() || waitingForHuman === null) return;

    const pIdx = waitingForHuman;
    const label = playerLabels[pIdx] ?? `AI${pIdx + 1}`;
    const content = `[Human (${label})] ${humanInputText.trim()}`;

    try {
      const res = await fetch("/api/arena", {
        method: "POST",
        headers: getApiKeyHeaders(),
        body: JSON.stringify({
          mode: "saveHumanMessage",
          threadId,
          content,
        }),
      });
      if (!res.ok) console.warn("人間メッセージのDB保存に失敗しました");

      const newMsg: Message = {
        id: uuidv4(),
        thread_id: threadId,
        role: "user",
        content,
        provider: "user",
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => {
        const updated = [...prev, newMsg];
        messagesRef.current = updated;
        return updated;
      });
      setHumanInputText("");

      // キューの先頭（human項目）を消費して即再開
      // → 次のuseEffectが自動で走り、次のターンへ進む
      setWaitingForHuman(null);
      setActionQueue((prev) => prev.slice(1));
      setIsRunning(true);
    } catch (err) {
      console.error("human submit error:", err);
    }
  }, [humanInputText, waitingForHuman, playerLabels, threadId]);

  // ── タイムトラベル（指定メッセージ以降を全削除） ─────────────
const handleTimeTravel = useCallback(async (targetMsg: Message) => {
  if (isRunning || waitingForHuman !== null) return;
  if (!window.confirm(`「${targetMsg.content.slice(0, 30)}…」以降のメッセージを全て削除しますか？`)) return;

  try {
    // 既存エンドポイントを流用（RLSで弾かれた場合は /api/arena?mode=timeTravel に切り替え）
    const res = await fetch(`/api/threads/${threadId}/messages`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromCreatedAt: targetMsg.created_at }),
    });

    if (!res.ok) throw new Error("削除に失敗しました");

    // フロント側のmessagesを更新
    const newMessages = messages.filter(
      (m) => new Date(m.created_at) < new Date(targetMsg.created_at)
    );
    setMessages(newMessages);
    messagesRef.current = newMessages;

    // totalTurnsを絶対値方式で再計算（Geminiさん方式）
    setTotalTurns(calcTotalTurns(newMessages, players.length));

    // キューをリセット（削除後は改めて「続ける」ボタンで再開）
    setActionQueue([]);

  } catch (err) {
    // RLSエラーの場合のフォールバック: /api/arena 経由で削除
    console.warn("直接DELETE失敗、/api/arena 経由で再試行:", err);
    try {
      const res2 = await fetch("/api/arena", {
        method: "POST",
        headers: getApiKeyHeaders(),
        body: JSON.stringify({
          mode: "timeTravel",
          threadId,
          since: targetMsg.created_at,
        }),
      });
      if (!res2.ok) throw new Error("arena経由の削除も失敗しました");

      const newMessages = messages.filter(
        (m) => new Date(m.created_at) < new Date(targetMsg.created_at)
      );
      setMessages(newMessages);
      messagesRef.current = newMessages;
      setTotalTurns(calcTotalTurns(newMessages, players.length));
      setActionQueue([]);

    } catch (err2) {
      alert(`削除に失敗しました: ${err2 instanceof Error ? err2.message : "不明なエラー"}`);
    }
  }
}, [isRunning, waitingForHuman, messages, threadId, players.length]);

    // ── MDエクスポート ───────────────────────────────────────────
  const handleExportMd = useCallback(() => {
    const lines: string[] = [];
    const now = new Date().toISOString();
    lines.push("---");
    lines.push("title: " + JSON.stringify("【AI闘技場】" + config.topic.slice(0, 30)));
    lines.push("created: " + now);
    lines.push("topic: " + JSON.stringify(config.topic));
    lines.push("ai1: " + JSON.stringify(ai1Label + (config.ai1Prompt ? " / 人格：" + config.ai1Prompt : "")));
    lines.push("ai2: " + JSON.stringify(ai2Label + (config.ai2Prompt ? " / 人格：" + config.ai2Prompt : "")));
    if (config.ai3Enabled) {
      lines.push("ai3: " + JSON.stringify((ai3Label ?? "AI3") + (config.ai3Prompt ? " / 人格：" + config.ai3Prompt : "")));
    }
    lines.push("---");
    lines.push("");
    let totalIdx = 0;
    for (const msg of messages) {
      const isAiMsg = msg.role === "assistant";
      const isHumanTakeover = msg.role === "user" && msg.content.startsWith("[Human");
      const isIntervention = msg.role === "user" && !isHumanTakeover;
      if (isIntervention) {
        const text = msg.content.replace("【神からの介入】", "").trim();
        lines.push("> ⚡ 神の介入: " + text);
        lines.push("");
        continue;
      }
      if (isHumanTakeover) {
        const pIdx = totalIdx % players.length;
        const displayContent = msg.content.replace(/^\[Human[^\]]*\]\s*/, "");
        lines.push("> [!QUESTION] You");
        lines.push("> [Human (AI" + (pIdx + 1) + ")] " + displayContent.trim().split("\n").join("\n> "));
        lines.push("");
        totalIdx++;
        continue;
      }
      if (isAiMsg) {
        const pIdx = totalIdx % players.length;
        const labelMap = [ai1Label, ai2Label, ai3Label ?? "AI3"];
        const provLabel = labelMap[pIdx] ?? ai1Label;
        lines.push("> [!NOTE] " + provLabel);
        lines.push("> " + msg.content.trim().split("\n").join("\n> "));
        lines.push("");
        totalIdx++;
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "【AI闘技場】" + config.topic.slice(0, 20) + ".md";
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, config, ai1Label, ai2Label, ai3Label, players]);

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
    const vsText = config.ai3Enabled
      ? `${ai1Label} vs ${ai2Label} vs ${ai3Label}`
      : `${ai1Label} vs ${ai2Label}`;
    const text = `【AI闘技場】${vsText}\nお題：${config.topic}\n\n#KabeHub #AI闘技場`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  }, [shareToken, ai1Label, ai2Label, ai3Label, config.topic, config.ai3Enabled]);

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
              AIにお題を与えて、議論を観戦しよう
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

          {/* AI設定（AI1・AI2） */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {(["ai1", "ai2"] as const).map((key, idx) => {
              const providerKey = `${key}Provider` as "ai1Provider" | "ai2Provider";
              const promptKey = `${key}Prompt` as "ai1Prompt" | "ai2Prompt";
              const prov = config[providerKey];
              const color = prov === "human" ? PROVIDER_COLORS["human"] : PROVIDER_COLORS[prov];
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
                    <option value="human">👤 ユーザー（自分）</option>
                  </select>
                  {prov !== "human" && (
                    <textarea
                      value={config[promptKey]}
                      onChange={(e) => setConfig((c) => ({ ...c, [promptKey]: e.target.value }))}
                      placeholder={`人格・役割設定（省略可）\n例：あなたは強硬な反対派です。`}
                      rows={3}
                      style={{ padding: "8px 10px", border: `1px solid ${color.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", color: "var(--ink)", background: "white", outline: "none", resize: "vertical", lineHeight: 1.5 }}
                    />
                  )}
                  {prov === "human" && (
                    <div style={{ fontSize: "11px", color: color.text, fontFamily: "'DM Sans', sans-serif", padding: "4px 0" }}>
                      あなたが直接このポジションで発言します。
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* AI3トグル */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={config.ai3Enabled}
                onChange={(e) => setConfig((c) => ({ ...c, ai3Enabled: e.target.checked }))}
                style={{ width: "16px", height: "16px", cursor: "pointer" }}
              />
              <span style={{ fontSize: "13px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)" }}>
                3人目を追加する（三つ巴）
              </span>
            </label>

            {config.ai3Enabled && (() => {
              const prov = config.ai3Provider;
              const color = prov === "human" ? PROVIDER_COLORS["human"] : PROVIDER_COLORS[prov];
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px", background: color.bg, border: `1px solid ${color.border}`, borderRadius: "10px" }}>
                  <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: color.text, fontWeight: 600, letterSpacing: "0.05em" }}>
                    AI 3
                  </div>
                  <select
                    value={prov}
                    onChange={(e) => setConfig((c) => ({ ...c, ai3Provider: e.target.value as Provider }))}
                    style={{ padding: "6px 10px", border: `1px solid ${color.border}`, borderRadius: "6px", fontSize: "13px", fontFamily: "'JetBrains Mono', monospace", color: color.text, background: "white", cursor: "pointer", outline: "none" }}
                  >
                    <option value="claude">Claude</option>
                    <option value="gemini">Gemini</option>
                    <option value="openai">ChatGPT</option>
                    <option value="human">👤 ユーザー（自分）</option>
                  </select>
                  {prov !== "human" && (
                    <textarea
                      value={config.ai3Prompt}
                      onChange={(e) => setConfig((c) => ({ ...c, ai3Prompt: e.target.value }))}
                      placeholder={`人格・役割設定（省略可）\n例：あなたは中立的な調停者です。`}
                      rows={3}
                      style={{ padding: "8px 10px", border: `1px solid ${color.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", color: "var(--ink)", background: "white", outline: "none", resize: "vertical", lineHeight: 1.5 }}
                    />
                  )}
                  {prov === "human" && (
                    <div style={{ fontSize: "11px", color: color.text, fontFamily: "'DM Sans', sans-serif", padding: "4px 0" }}>
                      あなたが直接このポジションで発言します。
                    </div>
                  )}
                </div>
              );
            })()}
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
              ターン = 全員が{config.turnCount}回ずつ
            </span>
          </div>

          {/* 開始ボタン */}
          <button
            onClick={() => {
              if (!config.topic.trim()) { alert("お題を入力してください"); return; }
              // "human" プロバイダーを isContinuousTakeover の初期値に変換
              // （最初にhumanを見つけたpIdxを使う。複数humanでも1つだけ対応）
              const humanPIdx = [config.ai1Provider, config.ai2Provider, ...(config.ai3Enabled ? [config.ai3Provider] : [])].findIndex(p => p === "human");
              setIsContinuousTakeover(humanPIdx !== -1 ? humanPIdx : null);
              setPhase("arena");
            }}
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

  const ai1Color = PROVIDER_COLORS[config.ai1Provider] ?? PROVIDER_COLORS["claude"];
  const ai2Color = PROVIDER_COLORS[config.ai2Provider] ?? PROVIDER_COLORS["gemini"];

  // 継続介入モードのトグルで使う: AI枠（human以外）のpIdx一覧
  const aiOnlyPlayers = players
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.provider !== "human");

  // ネイティブhuman枠があるかどうか
  const nativeHumanPIdx = players.findIndex((p) => p.provider === "human");
  const hasNativeHuman = nativeHumanPIdx !== -1;

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

        {/* AI バッジ */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, justifyContent: "center", flexWrap: "wrap" }}>
          <span style={{ padding: "3px 10px", borderRadius: "5px", border: `1px solid ${ai1Color.border}`, background: ai1Color.bg, color: ai1Color.text, fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
            {ai1Label} (AI1)
          </span>
          <span style={{ fontSize: "13px", color: "var(--ink-faint)", fontWeight: 700 }}>⚔️</span>
          <span style={{ padding: "3px 10px", borderRadius: "5px", border: `1px solid ${ai2Color.border}`, background: ai2Color.bg, color: ai2Color.text, fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
            {ai2Label} (AI2)
          </span>
          {config.ai3Enabled && ai3Label && (() => {
            const ai3Color = PROVIDER_COLORS[config.ai3Provider] ?? PROVIDER_COLORS["openai"];
            return (
              <>
                <span style={{ fontSize: "13px", color: "var(--ink-faint)", fontWeight: 700 }}>⚔️</span>
                <span style={{ padding: "3px 10px", borderRadius: "5px", border: `1px solid ${ai3Color.border}`, background: ai3Color.bg, color: ai3Color.text, fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
                  {ai3Label} (AI3)
                </span>
              </>
            );
          })()}
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
          <div style={{ maxWidth: "760px", margin: "0 auto", display: "grid", gridTemplateColumns: config.ai3Enabled ? "1fr 1fr 1fr" : "1fr 1fr", gap: "12px" }}>
            {players.map((player, idx) => {
              const color = PROVIDER_COLORS[player.provider];
              const promptKeys = ["ai1Prompt", "ai2Prompt", "ai3Prompt"] as const;
              const promptKey = promptKeys[idx];
              return (
                <div key={idx}>
                  <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: color.text, marginBottom: "6px" }}>
                    AI{idx + 1} ({PROVIDER_LABELS[player.provider]}) の人格
                  </div>
                  {player.provider !== "human" ? (
                    <textarea
                      value={config[promptKey] ?? ""}
                      onChange={(e) => setConfig((c) => ({ ...c, [promptKey]: e.target.value }))}
                      placeholder="人格・役割設定（省略可）"
                      rows={3}
                      style={{ width: "100%", padding: "8px 10px", border: `1px solid ${color.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", color: "var(--ink)", background: "white", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                    />
                  ) : (
                    <div style={{ fontSize: "11px", color: color.text, fontFamily: "'DM Sans', sans-serif" }}>ユーザーが直接発言します</div>
                  )}
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
        {messages.length === 0 && !isRunning && waitingForHuman === null && (
          <div style={{ textAlign: "center", marginTop: "60px", color: "var(--ink-muted)", fontSize: "13px", fontFamily: "'JetBrains Mono', monospace" }}>
            ▶️ 実行ボタンを押して闘技場を開始してください
          </div>
        )}
        {(() => {
        let totalIdx = 0;
        return messages.map((msg) => {
          const isAiMsg = msg.role === "assistant";
          const isHumanTakeover = msg.role === "user" && msg.content.startsWith("[Human");
          const currentIdx = (isAiMsg || isHumanTakeover) ? totalIdx : -1;
          if (isAiMsg || isHumanTakeover) totalIdx++;
          return (
            // ★ div で包んでホバー時に ✂️ ボタンを表示
            <div
              key={msg.id}
              style={{ position: "relative" }}
              className="group"
            >
              <ArenaBubble
                message={msg}
                ai1Label={ai1Label}
                ai2Label={ai2Label}
                ai3Label={ai3Label}
                aiMessageIndex={currentIdx}
                playerCount={players.length}
              />
              {/* タイムトラベルボタン: 停止中のみ表示 */}
              {!isRunning && waitingForHuman === null && (
                <button
                  onClick={() => handleTimeTravel(msg)}
                  title="ここ以降を削除"
                  className="opacity-0 group-hover:opacity-100"
                  style={{
                    position: "absolute",
                    bottom: "4px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "2px 10px",
                    borderRadius: "5px",
                    border: "1px solid var(--border)",
                    background: "white",
                    color: "var(--ink-muted)",
                    fontSize: "11px",
                    fontFamily: "'JetBrains Mono', monospace",
                    cursor: "pointer",
                    transition: "opacity 0.15s",
                    whiteSpace: "nowrap",
                  }}
                 >
                  ✂️ ここ以降を削除
                </button>
                )}
              </div>
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

          {/* シェアパネル */}
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

          {/* 人間ターン入力ボックス */}
          {waitingForHuman !== null && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 16px", background: "#fdf4ff", border: "1px solid #e9d5ff", borderRadius: "8px" }}>
              <div style={{ fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", color: "#6b21a8", fontWeight: 600 }}>
                🔥 あなたのターンです！（AI{waitingForHuman + 1} / {playerLabels[waitingForHuman]}ポジション）
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <textarea
                  value={humanInputText}
                  onChange={(e) => setHumanInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleHumanSubmit(); } }}
                  placeholder="発言を入力してください（Enter送信 / Shift+Enter改行）"
                  rows={2}
                  autoFocus
                  style={{ flex: 1, padding: "8px 12px", border: "1px solid #e9d5ff", borderRadius: "7px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", color: "var(--ink)", background: "white", outline: "none", resize: "none" }}
                />
                <button
                  onClick={handleHumanSubmit}
                  disabled={!humanInputText.trim()}
                  style={{ padding: "8px 16px", borderRadius: "7px", border: "none", background: humanInputText.trim() ? "#7c3aed" : "var(--border)", color: "white", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: humanInputText.trim() ? "pointer" : "default", whiteSpace: "nowrap", alignSelf: "flex-end" }}
                >
                  送信
                </button>
              </div>
            </div>
          )}

          {/* 神の介入ボックス（トグル） */}
          {showIntervention && waitingForHuman === null && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 14px", background: "#fefce8", border: "1px solid #fde68a", borderRadius: "8px" }}>
              <textarea
                value={interventionText}
                onChange={(e) => setInterventionText(e.target.value)}
                placeholder="全AIへのメッセージ（次のターン開始時に渡されます）"
                rows={2}
                style={{ padding: "8px 12px", border: "1px solid #fde68a", borderRadius: "7px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", color: "var(--ink)", background: "white", outline: "none", resize: "none" }}
              />
            </div>
          )}

          {/* ボタン列 */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            {/* 介入ボタン（人間ターン待機中は非表示） */}
            {waitingForHuman === null && (
              <button
                onClick={() => setShowIntervention((v) => !v)}
                style={{ padding: "8px 14px", borderRadius: "7px", border: `1px solid ${showIntervention ? "#fde68a" : "var(--border)"}`, background: showIntervention ? "#fefce8" : "white", color: showIntervention ? "#78350f" : "var(--ink-muted)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap" }}
              >
                ⚡ 介入
              </button>
            )}

            {/* 継続介入モード（ネイティブhuman枠がある場合は常時ON表示のみ / AI枠への乗っ取りはトグルで制御） */}
            {waitingForHuman === null && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {/* ネイティブhuman枠の常時ON表示 */}
                {hasNativeHuman && (
                  <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "#6b21a8", padding: "4px 8px", background: "#fdf4ff", border: "1px solid #e9d5ff", borderRadius: "5px", whiteSpace: "nowrap" }}>
                    👤 AI{nativeHumanPIdx + 1}: 常時あなたが発言
                  </span>
                )}

                {/* AI枠への途中乗っ取りトグル（AI枠が1つ以上ある場合のみ表示） */}
                {aiOnlyPlayers.length > 0 && (
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: isContinuousTakeover !== null ? "#7c3aed" : "var(--ink-muted)", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      checked={isContinuousTakeover !== null}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // ONにした時はAI枠の最初のpIdxをデフォルトに
                          setIsContinuousTakeover(aiOnlyPlayers[0].idx);
                        } else {
                          setIsContinuousTakeover(null);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    継続介入
                  </label>
                )}

                {/* 乗っ取り対象のAIを選ぶselectはトグルON時のみ表示 */}
                {isContinuousTakeover !== null && aiOnlyPlayers.length > 1 && (
                  <select
                    value={isContinuousTakeover}
                    onChange={(e) => setIsContinuousTakeover(Number(e.target.value))}
                    style={{ padding: "3px 6px", border: "1px solid #e9d5ff", borderRadius: "5px", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "#6b21a8", background: "white", cursor: "pointer", outline: "none" }}
                  >
                    {aiOnlyPlayers.map((p) => (
                      <option key={p.idx} value={p.idx}>
                        AI{p.idx + 1}（{PROVIDER_LABELS[p.provider]}）の代わり
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* ターン数セレクター */}
            {waitingForHuman === null && (
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
            )}

            {/* 実行ボタン（人間ターン待機中は非表示） */}
            {waitingForHuman === null && (
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
            )}

            {/* MDエクスポートボタン */}
            {messages.length > 0 && waitingForHuman === null && (
              <button
                onClick={handleExportMd}
                title="MDファイルにエクスポート（人間の発言含む）"
                style={{ padding: "10px 14px", borderRadius: "7px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                📄 MD
              </button>
            )}

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
