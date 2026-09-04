"use client";

import { buildApiKeyHeaders, type Message } from "@kabehub/shared";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ArenaBubble,
  ArenaThinking,
  PROVIDER_CLASS_NAMES,
  PROVIDER_LABELS,
  type Provider,
} from "../../components/ArenaTimeline";
import { mobileAccessTokenProvider } from "../../lib/accessTokenProvider";
import { createMobileApiClient } from "../../lib/api-client";
import { mobileApiKeyStore } from "../../lib/apiKeyStore";
import { supabase } from "../../lib/supabase/client";

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

type ArenaTurnResult = {
  message: Message;
  saved: boolean;
};

type AuthState = "loading" | "signedOut" | "signedIn";

const apiClient = createMobileApiClient(mobileAccessTokenProvider);
const JSON_HEADERS = { "Content-Type": "application/json" };

async function getApiKeyHeaders(): Promise<Record<string, string>> {
  return {
    ...JSON_HEADERS,
    ...(await buildApiKeyHeaders(mobileApiKeyStore, [
      "claude",
      "gemini",
      "openai",
    ])),
  };
}

function calcTotalTurns(messages: Message[], playerCount: number): number {
  const aiAndHumanCount = messages.filter(
    (message) =>
      message.role === "assistant" ||
      (message.role === "user" && message.content.startsWith("[Human"))
  ).length;
  return Math.floor(aiAndHumanCount / playerCount);
}

function providerClassName(provider: Provider): string {
  return PROVIDER_CLASS_NAMES[provider];
}

export default function ArenaPage() {
  const [authState, setAuthState] = useState<AuthState>("loading");
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
  const [threadId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState<string | null>(null);
  const [thinkingIsAi1, setThinkingIsAi1] = useState(true);
  const [totalTurns, setTotalTurns] = useState(0);
  const [interventionText, setInterventionText] = useState("");
  const [showIntervention, setShowIntervention] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [humanInputText, setHumanInputText] = useState("");
  const [unsavedResult, setUnsavedResult] = useState<Message | null>(null);
  const [actionQueue, setActionQueue] = useState<QueueItem[]>([]);
  const [waitingForHuman, setWaitingForHuman] = useState<number | null>(null);
  const [isContinuousTakeover, setIsContinuousTakeover] = useState<number | null>(
    null
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>(messages);
  const isFirstRun = messages.length === 0;

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setAuthState(!error && data.session ? "signedIn" : "signedOut");
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "INITIAL_SESSION") return;
        setAuthState(session ? "signedIn" : "signedOut");
        if (!session) {
          setActionQueue([]);
          setIsRunning(false);
          setThinkingLabel(null);
          setWaitingForHuman(null);
        }
      }
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingLabel, unsavedResult]);

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
    config.ai1Provider,
    config.ai1Prompt,
    config.ai2Provider,
    config.ai2Prompt,
    config.ai3Enabled,
    config.ai3Provider,
    config.ai3Prompt,
  ]);

  const playerLabels = useMemo(
    () => players.map((player) => PROVIDER_LABELS[player.provider]),
    [players]
  );
  const ai1Label = playerLabels[0] ?? "AI1";
  const ai2Label = playerLabels[1] ?? "AI2";
  const ai3Label = playerLabels[2];

  const runOneTurn = useCallback(
    async (
      currentMessages: Message[],
      player: PlayerConfig,
      playerIndex: number,
      isVeryFirst: boolean,
      topic: string,
      interventionContent?: string
    ): Promise<ArenaTurnResult> => {
      if (authState !== "signedIn") {
        throw new Error("ログインが必要です");
      }

      const selfLabel = playerLabels[playerIndex] ?? `AI${playerIndex + 1}`;
      const opponentLabel =
        playerLabels.filter((_, index) => index !== playerIndex).join(" / ") ||
        "相手";

      setThinkingLabel(`${selfLabel} (AI${playerIndex + 1})`);
      setThinkingIsAi1(playerIndex % 2 === 0);

      const response = await apiClient.request("/api/arena", {
        method: "POST",
        headers: await getApiKeyHeaders(),
        body: JSON.stringify({
          threadId,
          history: currentMessages.slice(-10).map((message) => ({
            role: message.role,
            content: message.content,
            provider: message.provider,
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

      const data = (await response.json()) as Partial<ArenaTurnResult>;
      if (!response.ok) throw new Error("arena API error");
      if (!data.message || typeof data.saved !== "boolean") {
        throw new Error("arena API response error");
      }
      return { message: data.message, saved: data.saved };
    },
    [authState, playerLabels, threadId]
  );

  useEffect(() => {
    if (
      authState !== "signedIn" ||
      actionQueue.length === 0 ||
      !isRunning ||
      waitingForHuman !== null
    ) {
      return;
    }

    let isCancelled = false;

    const processNext = async () => {
      const nextAction = actionQueue[0];
      const player = players[nextAction.pIdx];

      if (!player) {
        setActionQueue((previous) => previous.slice(1));
        return;
      }

      const isNativeHuman = player.provider === "human";
      const isTakeoverTarget =
        isContinuousTakeover !== null &&
        nextAction.pIdx === isContinuousTakeover;

      if (isNativeHuman || isTakeoverTarget) {
        setWaitingForHuman(nextAction.pIdx);
        setIsRunning(false);
        setThinkingLabel(null);
        return;
      }

      try {
        const currentMessages = messagesRef.current;
        const isVeryFirst =
          currentMessages.length === 0 &&
          nextAction.turn === 0 &&
          nextAction.pIdx === 0;
        const result = await runOneTurn(
          currentMessages,
          player,
          nextAction.pIdx,
          isVeryFirst,
          config.topic,
          nextAction.intervention
        );

        if (isCancelled) return;

        setThinkingLabel(null);
        if (!result.saved) {
          setUnsavedResult(result.message);
          setActionQueue([]);
          setIsRunning(false);
          return;
        }

        setMessages((previous) => {
          const updated = [...previous, result.message];
          messagesRef.current = updated;
          return updated;
        });
        setActionQueue((previous) => previous.slice(1));
      } catch (error) {
        if (!isCancelled) {
          alert(
            `エラーが発生しました: ${
              error instanceof Error ? error.message : "不明なエラー"
            }`
          );
          setIsRunning(false);
          setThinkingLabel(null);
          setActionQueue([]);
        }
      }
    };

    void processNext();
    return () => {
      isCancelled = true;
    };
  }, [
    actionQueue,
    authState,
    config.topic,
    isContinuousTakeover,
    isRunning,
    players,
    runOneTurn,
    waitingForHuman,
  ]);

  useEffect(() => {
    if (actionQueue.length === 0 && isRunning && waitingForHuman === null) {
      setIsRunning(false);
      setTotalTurns((previous) => previous + config.turnCount);
    }
  }, [actionQueue, config.turnCount, isRunning, waitingForHuman]);

  const handleRun = useCallback(() => {
    if (
      authState !== "signedIn" ||
      isRunning ||
      waitingForHuman !== null
    ) {
      return;
    }

    setUnsavedResult(null);
    setIsRunning(true);

    const intervention = interventionText.trim() || undefined;
    setInterventionText("");
    setShowIntervention(false);

    const newQueue: QueueItem[] = [];
    for (let turn = 0; turn < config.turnCount; turn += 1) {
      for (let playerIndex = 0; playerIndex < players.length; playerIndex += 1) {
        const item: QueueItem = { turn, pIdx: playerIndex };
        if (turn === 0 && playerIndex === 0 && intervention) {
          item.intervention = intervention;
        }
        newQueue.push(item);
      }
    }
    setActionQueue(newQueue);
  }, [
    authState,
    config.turnCount,
    interventionText,
    isRunning,
    players.length,
    waitingForHuman,
  ]);

  const handleHumanSubmit = useCallback(async () => {
    if (
      authState !== "signedIn" ||
      !humanInputText.trim() ||
      waitingForHuman === null
    ) {
      return;
    }

    const playerIndex = waitingForHuman;
    const label = playerLabels[playerIndex] ?? `AI${playerIndex + 1}`;
    const content = `[Human (${label})] ${humanInputText.trim()}`;

    try {
      const response = await apiClient.request("/api/arena", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          mode: "saveHumanMessage",
          threadId,
          content,
          topic: config.topic,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        message?: Message;
      };
      if (!response.ok || data.ok === false || !data.message) {
        throw new Error("人間メッセージのDB保存に失敗しました");
      }

      setMessages((previous) => {
        const updated = [...previous, data.message as Message];
        messagesRef.current = updated;
        return updated;
      });
      setHumanInputText("");
      setWaitingForHuman(null);
      setActionQueue((previous) => previous.slice(1));
      setIsRunning(true);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "人間メッセージのDB保存に失敗しました"
      );
    }
  }, [
    authState,
    config.topic,
    humanInputText,
    playerLabels,
    threadId,
    waitingForHuman,
  ]);

  const handleTimeTravel = useCallback(
    async (targetMessage: Message) => {
      if (
        authState !== "signedIn" ||
        isRunning ||
        waitingForHuman !== null
      ) {
        return;
      }
      if (
        !window.confirm(
          `「${targetMessage.content.slice(
            0,
            30
          )}…」以降のメッセージを全て削除しますか？`
        )
      ) {
        return;
      }

      const applyDeletion = () => {
        const updated = messages.filter(
          (message) =>
            new Date(message.created_at) < new Date(targetMessage.created_at)
        );
        setMessages(updated);
        messagesRef.current = updated;
        setTotalTurns(calcTotalTurns(updated, players.length));
        setActionQueue([]);
      };

      try {
        const response = await apiClient.request(
          `/api/threads/${threadId}/messages`,
          {
            method: "DELETE",
            headers: JSON_HEADERS,
            body: JSON.stringify({
              fromCreatedAt: targetMessage.created_at,
            }),
          }
        );
        if (!response.ok) throw new Error("削除に失敗しました");
        applyDeletion();
      } catch {
        try {
          const fallbackResponse = await apiClient.request("/api/arena", {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({
              mode: "timeTravel",
              threadId,
              since: targetMessage.created_at,
            }),
          });
          if (!fallbackResponse.ok) {
            throw new Error("arena経由の削除も失敗しました");
          }
          applyDeletion();
        } catch (error) {
          alert(
            `削除に失敗しました: ${
              error instanceof Error ? error.message : "不明なエラー"
            }`
          );
        }
      }
    },
    [
      authState,
      isRunning,
      messages,
      players.length,
      threadId,
      waitingForHuman,
    ]
  );

  const handleExportMd = useCallback(() => {
    const lines: string[] = [];
    lines.push("---");
    lines.push(
      "title: " + JSON.stringify("【AI闘技場】" + config.topic.slice(0, 30))
    );
    lines.push("created: " + new Date().toISOString());
    lines.push("topic: " + JSON.stringify(config.topic));
    lines.push(
      "ai1: " +
        JSON.stringify(
          ai1Label +
            (config.ai1Prompt ? " / 人格：" + config.ai1Prompt : "")
        )
    );
    lines.push(
      "ai2: " +
        JSON.stringify(
          ai2Label +
            (config.ai2Prompt ? " / 人格：" + config.ai2Prompt : "")
        )
    );
    if (config.ai3Enabled) {
      lines.push(
        "ai3: " +
          JSON.stringify(
            (ai3Label ?? "AI3") +
              (config.ai3Prompt ? " / 人格：" + config.ai3Prompt : "")
          )
      );
    }
    lines.push("---", "");

    let totalIndex = 0;
    for (const message of messages) {
      const isAiMessage = message.role === "assistant";
      const isHumanTakeover =
        message.role === "user" && message.content.startsWith("[Human");
      const isIntervention = message.role === "user" && !isHumanTakeover;

      if (isIntervention) {
        lines.push(
          "> ⚡ 神の介入: " +
            message.content.replace("【神からの介入】", "").trim(),
          ""
        );
        continue;
      }
      if (isHumanTakeover) {
        const playerIndex = totalIndex % players.length;
        const displayContent = message.content.replace(
          /^\[Human[^\]]*\]\s*/,
          ""
        );
        lines.push(
          "> [!QUESTION] You",
          "> [Human (AI" +
            (playerIndex + 1) +
            ")] " +
            displayContent.trim().split("\n").join("\n> "),
          ""
        );
        totalIndex += 1;
        continue;
      }
      if (isAiMessage) {
        const playerIndex = totalIndex % players.length;
        const labels = [ai1Label, ai2Label, ai3Label ?? "AI3"];
        const providerLabel = labels[playerIndex] ?? ai1Label;
        lines.push(
          "> [!NOTE] " + providerLabel,
          "> " + message.content.trim().split("\n").join("\n> "),
          ""
        );
        totalIndex += 1;
      }
    }

    const blob = new Blob([lines.join("\n")], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "【AI闘技場】" + config.topic.slice(0, 20) + ".md";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [ai1Label, ai2Label, ai3Label, config, messages, players.length]);

  const handleCopyUnsavedResult = useCallback(async () => {
    if (!unsavedResult) return;
    try {
      await navigator.clipboard.writeText(unsavedResult.content);
      alert("未保存の結果をコピーしました！");
    } catch {
      alert("コピーに失敗しました");
    }
  }, [unsavedResult]);

  if (authState !== "signedIn") {
    return (
      <main className="arena-page">
        <div className="arena-auth-gate">
          <p>ログインが必要です</p>
          <Link href="/">ホームへ戻る</Link>
        </div>
      </main>
    );
  }

  if (phase === "setup") {
    const setupPlayers = [
      {
        key: "ai1" as const,
        providerKey: "ai1Provider" as const,
        promptKey: "ai1Prompt" as const,
      },
      {
        key: "ai2" as const,
        providerKey: "ai2Provider" as const,
        promptKey: "ai2Prompt" as const,
      },
    ];

    return (
      <main className="arena-page arena-setup-page">
        <div className="arena-setup-shell">
          <header className="arena-setup-header">
            <h1>⚔️ AI 闘技場</h1>
            <p>AIにお題を与えて、議論を観戦しよう</p>
          </header>

          <section className="arena-field-group">
            <label className="arena-field-label" htmlFor="arena-topic">
              お題 *
            </label>
            <textarea
              id="arena-topic"
              className="arena-input arena-topic-input"
              value={config.topic}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  topic: event.target.value,
                }))
              }
              placeholder="例：AIは人間の仕事を奪うか？ / 東京vs大阪、住むならどっち？"
              rows={3}
            />
          </section>

          <section className="arena-player-grid">
            {setupPlayers.map((entry, index) => {
              const provider = config[entry.providerKey];
              return (
                <div
                  key={entry.key}
                  className={`arena-provider-card ${providerClassName(provider)}`}
                >
                  <div className="arena-provider-card-label">AI {index + 1}</div>
                  <select
                    className="arena-provider-select"
                    aria-label={`AI ${index + 1}の担当`}
                    value={provider}
                    onChange={(event) =>
                      setConfig((current) => ({
                        ...current,
                        [entry.providerKey]: event.target.value as Provider,
                      }))
                    }
                  >
                    <option value="claude">Claude</option>
                    <option value="gemini">Gemini</option>
                    <option value="openai">ChatGPT</option>
                    <option value="human">👤 ユーザー（自分）</option>
                  </select>
                  {provider !== "human" ? (
                    <textarea
                      className="arena-provider-prompt"
                      value={config[entry.promptKey]}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          [entry.promptKey]: event.target.value,
                        }))
                      }
                      placeholder={
                        "人格・役割設定（省略可）\n例：あなたは強硬な反対派です。"
                      }
                      rows={3}
                    />
                  ) : (
                    <p className="arena-human-help">
                      あなたが直接このポジションで発言します。
                    </p>
                  )}
                </div>
              );
            })}
          </section>

          <section className="arena-third-player-section">
            <label className="arena-checkbox-label">
              <input
                type="checkbox"
                checked={config.ai3Enabled}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    ai3Enabled: event.target.checked,
                  }))
                }
              />
              <span>3人目を追加する（三つ巴）</span>
            </label>

            {config.ai3Enabled && (
              <div
                className={`arena-provider-card ${providerClassName(
                  config.ai3Provider
                )}`}
              >
                <div className="arena-provider-card-label">AI 3</div>
                <select
                  className="arena-provider-select"
                  aria-label="AI 3の担当"
                  value={config.ai3Provider}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      ai3Provider: event.target.value as Provider,
                    }))
                  }
                >
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                  <option value="openai">ChatGPT</option>
                  <option value="human">👤 ユーザー（自分）</option>
                </select>
                {config.ai3Provider !== "human" ? (
                  <textarea
                    className="arena-provider-prompt"
                    value={config.ai3Prompt}
                    onChange={(event) =>
                      setConfig((current) => ({
                        ...current,
                        ai3Prompt: event.target.value,
                      }))
                    }
                    placeholder={
                      "人格・役割設定（省略可）\n例：あなたは中立的な調停者です。"
                    }
                    rows={3}
                  />
                ) : (
                  <p className="arena-human-help">
                    あなたが直接このポジションで発言します。
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="arena-turn-setting">
            <span className="arena-field-label">最初のターン数</span>
            <div className="arena-turn-buttons">
              {[1, 2, 3, 5].map((turnCount) => (
                <button
                  key={turnCount}
                  type="button"
                  className={`arena-turn-button ${
                    config.turnCount === turnCount ? "arena-turn-button-active" : ""
                  }`}
                  onClick={() =>
                    setConfig((current) => ({ ...current, turnCount }))
                  }
                >
                  {turnCount}
                </button>
              ))}
            </div>
            <span className="arena-turn-help">
              ターン = 全員が{config.turnCount}回ずつ
            </span>
          </section>

          <button
            type="button"
            className="arena-enter-button"
            disabled={!config.topic.trim()}
            onClick={() => {
              if (!config.topic.trim()) return;
              const humanPlayerIndex = [
                config.ai1Provider,
                config.ai2Provider,
                ...(config.ai3Enabled ? [config.ai3Provider] : []),
              ].findIndex((provider) => provider === "human");
              setIsContinuousTakeover(
                humanPlayerIndex === -1 ? null : humanPlayerIndex
              );
              setPhase("arena");
            }}
          >
            ⚔️ 闘技場へ入場
          </button>

          <Link className="arena-back-link" href="/">
            ← 戻る
          </Link>
        </div>
      </main>
    );
  }

  const aiOnlyPlayers = players
    .map((player, index) => ({ ...player, index }))
    .filter((player) => player.provider !== "human");
  const nativeHumanPlayerIndex = players.findIndex(
    (player) => player.provider === "human"
  );
  const hasNativeHuman = nativeHumanPlayerIndex !== -1;
  const hasAiTakeover = aiOnlyPlayers.some(
    (player) => player.index === isContinuousTakeover
  );
  const promptKeys = ["ai1Prompt", "ai2Prompt", "ai3Prompt"] as const;

  return (
    <main className="arena-page arena-stage-page">
      <header className="arena-stage-header">
        <button
          type="button"
          className="arena-compact-button"
          onClick={() => {
            if (
              messages.length === 0 ||
              window.confirm(
                "セットアップ画面に戻りますか？（会話は保存済みです）"
              )
            ) {
              setPhase("setup");
            }
          }}
        >
          ← 設定
        </button>

        <div className="arena-matchup">
          {players.map((player, index) => (
            <span className="arena-matchup-entry" key={index}>
              {index > 0 && <span className="arena-crossed-swords">⚔️</span>}
              <span
                className={`arena-provider-badge ${providerClassName(
                  player.provider
                )}`}
              >
                {playerLabels[index]} (AI{index + 1})
              </span>
            </span>
          ))}
          {totalTurns > 0 && (
            <span className="arena-turn-total">{totalTurns}ターン経過</span>
          )}
        </div>

        <button
          type="button"
          className={`arena-compact-button ${
            showPromptEditor ? "arena-compact-button-active" : ""
          }`}
          onClick={() => setShowPromptEditor((visible) => !visible)}
        >
          🧬 人格設定
        </button>
      </header>

      {showPromptEditor && (
        <section className="arena-prompt-drawer">
          <div
            className={`arena-prompt-grid ${
              config.ai3Enabled ? "arena-prompt-grid-three" : ""
            }`}
          >
            {players.map((player, index) => {
              const promptKey = promptKeys[index];
              return (
                <div
                  className={`arena-prompt-editor ${providerClassName(
                    player.provider
                  )}`}
                  key={index}
                >
                  <div className="arena-prompt-editor-label">
                    AI{index + 1} ({PROVIDER_LABELS[player.provider]}) の人格
                  </div>
                  {player.provider !== "human" ? (
                    <textarea
                      className="arena-prompt-editor-input"
                      value={config[promptKey] ?? ""}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          [promptKey]: event.target.value,
                        }))
                      }
                      placeholder="人格・役割設定（省略可）"
                      rows={3}
                    />
                  ) : (
                    <p className="arena-human-help">
                      ユーザーが直接発言します
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="arena-topic-banner-wrap">
        <div className="arena-topic-banner">
          <span>お題</span>
          {config.topic}
        </div>
      </section>

      <section className="arena-timeline">
        {messages.length === 0 &&
          !isRunning &&
          waitingForHuman === null && (
            <p className="arena-empty-message">
              ▶️ 実行ボタンを押して闘技場を開始してください
            </p>
          )}

        {(() => {
          let totalIndex = 0;
          return messages.map((message) => {
            const isAiMessage = message.role === "assistant";
            const isHumanTakeover =
              message.role === "user" &&
              message.content.startsWith("[Human");
            const currentIndex =
              isAiMessage || isHumanTakeover ? totalIndex : -1;
            if (isAiMessage || isHumanTakeover) totalIndex += 1;

            return (
              <div className="arena-message-item" key={message.id}>
                <ArenaBubble
                  message={message}
                  ai1Label={ai1Label}
                  ai2Label={ai2Label}
                  ai3Label={ai3Label}
                  aiMessageIndex={currentIndex}
                  playerCount={players.length}
                />
                {!isRunning && waitingForHuman === null && (
                  <button
                    type="button"
                    className="arena-time-travel-button"
                    aria-label="このメッセージ以降を削除"
                    title="ここ以降を削除"
                    onClick={() => handleTimeTravel(message)}
                  >
                    ✂
                  </button>
                )}
              </div>
            );
          });
        })()}

        {unsavedResult && (
          <div className="arena-unsaved-result" role="alert">
            <div className="arena-unsaved-title">
              ⚠️ このAI応答は生成されましたが、DBに保存できませんでした
            </div>
            <div className="arena-unsaved-content">{unsavedResult.content}</div>
            <button
              type="button"
              className="arena-unsaved-copy-button"
              onClick={handleCopyUnsavedResult}
            >
              📋 内容をコピー
            </button>
          </div>
        )}
        {thinkingLabel && (
          <ArenaThinking label={thinkingLabel} isAi1={thinkingIsAi1} />
        )}
        <div ref={bottomRef} />
      </section>

      <footer className="arena-controls-footer">
        <div className="arena-controls-inner">
          {waitingForHuman !== null && (
            <section className="arena-human-turn-panel">
              <div className="arena-human-turn-label">
                🔥 あなたのターンです！（AI{waitingForHuman + 1} / {" "}
                {playerLabels[waitingForHuman]}ポジション）
              </div>
              <div className="arena-human-input-row">
                <textarea
                  className="arena-human-input"
                  value={humanInputText}
                  onChange={(event) => setHumanInputText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleHumanSubmit();
                    }
                  }}
                  placeholder="発言を入力してください（Enter送信 / Shift+Enter改行）"
                  rows={2}
                  autoFocus
                />
                <button
                  type="button"
                  className="arena-send-button"
                  onClick={() => void handleHumanSubmit()}
                  disabled={!humanInputText.trim()}
                >
                  送信
                </button>
              </div>
            </section>
          )}

          {showIntervention && waitingForHuman === null && (
            <section className="arena-intervention-panel">
              <textarea
                className="arena-intervention-input"
                value={interventionText}
                onChange={(event) => setInterventionText(event.target.value)}
                placeholder="全AIへのメッセージ（次のターン開始時に渡されます）"
                rows={2}
              />
            </section>
          )}

          <div className="arena-control-row">
            {waitingForHuman === null && (
              <button
                type="button"
                className={`arena-secondary-button ${
                  showIntervention ? "arena-secondary-button-active" : ""
                }`}
                onClick={() => setShowIntervention((visible) => !visible)}
              >
                ⚡ 介入
              </button>
            )}

            {waitingForHuman === null && (
              <div className="arena-takeover-controls">
                {hasNativeHuman && (
                  <span className="arena-native-human-badge">
                    👤 AI{nativeHumanPlayerIndex + 1}: 常時あなたが発言
                  </span>
                )}
                {aiOnlyPlayers.length > 0 && (
                  <label
                    className={`arena-takeover-label ${
                      hasAiTakeover ? "arena-takeover-label-active" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={hasAiTakeover}
                      onChange={(event) => {
                        setIsContinuousTakeover(
                          event.target.checked ? aiOnlyPlayers[0].index : null
                        );
                      }}
                    />
                    継続介入
                  </label>
                )}
                {hasAiTakeover && aiOnlyPlayers.length > 1 && (
                  <select
                    className="arena-takeover-select"
                    aria-label="継続介入するAI"
                    value={isContinuousTakeover ?? aiOnlyPlayers[0].index}
                    onChange={(event) =>
                      setIsContinuousTakeover(Number(event.target.value))
                    }
                  >
                    {aiOnlyPlayers.map((player) => (
                      <option key={player.index} value={player.index}>
                        AI{player.index + 1}（{PROVIDER_LABELS[player.provider]}）
                        の代わり
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {waitingForHuman === null && (
              <select
                className="arena-turn-select"
                aria-label="実行するターン数"
                value={config.turnCount}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    turnCount: Number(event.target.value),
                  }))
                }
                disabled={isRunning}
              >
                {[1, 2, 3, 5].map((turnCount) => (
                  <option key={turnCount} value={turnCount}>
                    {turnCount}ターン
                  </option>
                ))}
              </select>
            )}

            {waitingForHuman === null && (
              <button
                type="button"
                className="arena-run-button"
                onClick={handleRun}
                disabled={isRunning}
              >
                {isRunning
                  ? "⚔️ 戦闘中…"
                  : isFirstRun
                    ? `▶️ ${config.turnCount}ターン 開始`
                    : `▶️ ${config.turnCount}ターン 続ける`}
              </button>
            )}

            {messages.length > 0 && waitingForHuman === null && (
              <button
                type="button"
                className="arena-export-button"
                onClick={handleExportMd}
                title="MDファイルにエクスポート（人間の発言含む）"
              >
                📄 MD
              </button>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}
