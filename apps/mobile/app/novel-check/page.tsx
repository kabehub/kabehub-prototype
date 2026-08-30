"use client";

import {
  buildApiKeyHeaders,
  formatUSD,
  getNovelCheckModels,
  NOVEL_CHECK_CONFIG,
} from "@kabehub/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import MarkdownRenderer from "../../components/MarkdownRenderer";
import { mobileAccessTokenProvider } from "../../lib/accessTokenProvider";
import { createMobileApiClient } from "../../lib/api-client";
import { mobileApiKeyStore } from "../../lib/apiKeyStore";
import { supabase } from "../../lib/supabase/client";

interface NovelFile {
  name: string;
  content: string;
}

type AuthState = "loading" | "signedOut" | "signedIn";
type GeminiKeyState =
  | { status: "loading" }
  | { status: "loaded"; key: string | null }
  | { status: "error" };

const CHECK_ITEMS = [
  "伏線：張られたが回収されていない伏線",
  "矛盾：設定・時系列・キャラの言動の矛盾点",
  "口調ブレ：キャラクターごとの話し方の一貫性",
  "固有名詞：人名・地名・固有名詞の表記揺れ",
];

const NOVEL_CHECK_MODELS = getNovelCheckModels();
type NovelCheckModelId = (typeof NOVEL_CHECK_MODELS)[number]["id"];

const apiClient = createMobileApiClient(mobileAccessTokenProvider);

function getTodayStr(): string {
  const date = new Date();
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

async function readFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (utf8.includes("�")) {
    return new TextDecoder("shift-jis").decode(buffer);
  }
  return utf8;
}

async function assertResponseOk(
  response: Response,
  operation: string
): Promise<void> {
  if (response.ok) return;

  let detail = "";
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") detail = `: ${body.error}`;
  } catch {
    // JSON以外のエラーレスポンスではステータスだけを表示する。
  }
  throw new Error(`${operation}に失敗しました (${response.status})${detail}`);
}

export default function NovelCheckPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [geminiKeyState, setGeminiKeyState] = useState<GeminiKeyState>({
    status: "loading",
  });
  const [files, setFiles] = useState<NovelFile[]>([]);
  const [checkItems, setCheckItems] = useState<string[]>([...CHECK_ITEMS]);
  const [selectedModel, setSelectedModel] =
    useState<NovelCheckModelId>(NOVEL_CHECK_CONFIG.defaultModelId);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState("");
  const [metaInfo, setMetaInfo] = useState<{
    totalChars: number;
    estimatedTokens: number;
  } | null>(null);
  const [saveTitle, setSaveTitle] = useState(
    `整合性チェック ${getTodayStr()}`
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setAuthState(!error && data.session ? "signedIn" : "signedOut");
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "INITIAL_SESSION") return;
        if (!session) {
          setGeminiKeyState({ status: "loading" });
          setAuthState("signedOut");
          return;
        }
        setAuthState("signedIn");
      }
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authState !== "signedIn") return;

    let active = true;
    setGeminiKeyState({ status: "loading" });

    async function loadGeminiKey() {
      try {
        const key = await mobileApiKeyStore.getKey("gemini");
        if (active) setGeminiKeyState({ status: "loaded", key });
      } catch {
        if (active) setGeminiKeyState({ status: "error" });
      }
    }

    void loadGeminiKey();
    return () => {
      active = false;
    };
  }, [authState]);

  const geminiKey =
    geminiKeyState.status === "loaded" ? geminiKeyState.key : null;
  const totalChars = files.reduce((sum, file) => sum + file.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars * 1.2);
  const estimatedModelCosts = NOVEL_CHECK_MODELS.map((model) => ({
    id: model.id,
    label:
      model.label.split(" ").pop()?.toLowerCase() ?? model.label.toLowerCase(),
    cost: (estimatedTokens / 1_000_000) * model.estimatedInputPerMTok,
  }));

  const processFiles = useCallback(async (fileList: FileList) => {
    const added: NovelFile[] = [];
    for (const file of Array.from(fileList)) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension !== "txt" && extension !== "md") continue;
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
    if (added.length > 0) setFiles((current) => [...current, ...added]);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      void processFiles(event.dataTransfer.files);
    },
    [processFiles]
  );

  const toggleCheckItem = (item: string) => {
    setCheckItems((current) =>
      current.includes(item)
        ? current.filter((currentItem) => currentItem !== item)
        : [...current, item]
    );
  };

  const handleStart = useCallback(async () => {
    if (!geminiKey || files.length === 0 || checkItems.length === 0 || isLoading) {
      return;
    }
    setIsLoading(true);
    setResult("");
    setMetaInfo(null);

    try {
      const apiKeyHeaders = await buildApiKeyHeaders(mobileApiKeyStore, [
        "gemini",
      ]);
      const response = await apiClient.request("/api/novel-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeaders },
        body: JSON.stringify({ texts: files, modelId: selectedModel, checkItems }),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { error?: string };
        setResult(`エラー: ${errorBody.error ?? "不明なエラー"}`);
        return;
      }
      if (!response.body) {
        throw new Error("ストリーミング応答を取得できませんでした");
      }

      const reader = response.body.getReader();
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
            const parsed = JSON.parse(line) as {
              type?: string;
              totalChars?: number;
              estimatedTokens?: number;
              text?: string;
            };
            if (
              parsed.type === "meta" &&
              typeof parsed.totalChars === "number" &&
              typeof parsed.estimatedTokens === "number"
            ) {
              setMetaInfo({
                totalChars: parsed.totalChars,
                estimatedTokens: parsed.estimatedTokens,
              });
            } else if (
              parsed.type === "chunk" &&
              typeof parsed.text === "string"
            ) {
              setResult((current) => current + parsed.text);
            }
          } catch {
            // 不正なNDJSON行だけを破棄し、後続チャンクの処理を継続する。
          }
        }
      }
    } catch (err) {
      setResult(
        `エラー: ${err instanceof Error ? err.message : "不明なエラー"}`
      );
    } finally {
      setIsLoading(false);
    }
  }, [geminiKey, files, checkItems, isLoading, selectedModel]);

  const handleSave = useCallback(async () => {
    if (!result || isSaving) return;
    setIsSaving(true);

    try {
      const threadId = crypto.randomUUID();
      const title = saveTitle.trim() || "整合性チェック";
      const threadResponse = await apiClient.request(
        `/api/threads/${threadId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        }
      );
      await assertResponseOk(threadResponse, "スレッドの作成");

      const checkNames = checkItems
        .map((item) => item.split("：")[0])
        .join("、");
      const metaContent = `【整合性チェック実行】\n対象ファイル: ${files[0]?.name ?? ""}${files.length > 1 ? ` ほか計${files.length}件` : ""}\n総文字数: 約${totalChars.toLocaleString()}文字\nチェック項目: ${checkNames}`;
      const metaResponse = await apiClient.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          messages: [],
          userContent: metaContent,
          provider: "gemini",
          isMemo: true,
          isTemporary: false,
        }),
      });
      await assertResponseOk(metaResponse, "実行情報の保存");

      const resultResponse = await apiClient.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          messages: [],
          userContent: result,
          provider: "gemini",
          isMemo: true,
          isTemporary: false,
        }),
      });
      await assertResponseOk(resultResponse, "チェック結果の保存");

      // スレッド閲覧画面は未移植のため、threadクエリを付けずホームへ戻す。
      router.push("/");
    } catch (err) {
      alert(
        `保存に失敗しました: ${err instanceof Error ? err.message : "不明なエラー"}`
      );
      setIsSaving(false);
    }
  }, [result, isSaving, saveTitle, files, checkItems, totalChars, router]);

  if (authState !== "signedIn") {
    return (
      <main className="novel-check-page">
        <div className="novel-check-auth-gate">
          <p>ログインが必要です</p>
          <Link href="/">ホームへ戻る</Link>
        </div>
      </main>
    );
  }

  const canStart =
    Boolean(geminiKey) &&
    files.length > 0 &&
    checkItems.length > 0 &&
    !isLoading;

  return (
    <main className="novel-check-page">
      <header className="novel-check-header">
        <Link href="/" className="novel-check-back-link">
          ← 壁打ちへ
        </Link>
        <span className="novel-check-header-separator">|</span>
        <h1>📖 整合性チェック</h1>
      </header>

      {geminiKeyState.status === "error" && (
        <div className="novel-check-warning" role="alert">
          キー読み込みに失敗しました。設定画面で再設定してください
        </div>
      )}
      {geminiKeyState.status === "loaded" && !geminiKeyState.key && (
        <div className="novel-check-warning">
          ⚙️ <Link href="/settings">設定</Link>
          からGemini APIキーを設定してください
        </div>
      )}

      <div
        className={[
          "novel-check-dropzone",
          isDragging && "novel-check-dropzone-active",
        ]
          .filter(Boolean)
          .join(" ")}
        onDrop={handleDrop}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <div className="novel-check-dropzone-icon">📄</div>
        <div className="novel-check-dropzone-label">
          TXT・MDファイルをドロップ、またはタップして選択
        </div>
        <div className="novel-check-dropzone-help">
          複数選択可 · 1ファイル最大10MB
        </div>
        <input
          ref={fileInputRef}
          className="novel-check-file-input"
          type="file"
          accept=".txt,.md"
          multiple
          onChange={(event) => {
            if (event.target.files) void processFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="novel-check-file-list">
          {files.map((file, index) => (
            <div
              className="novel-check-file-chip"
              key={`${file.name}-${index}`}
            >
              <span>📄 {file.name}</span>
              <span className="novel-check-file-size">
                ({(file.content.length / 1000).toFixed(1)}K文字)
              </span>
              <button
                type="button"
                aria-label={`${file.name}を削除`}
                onClick={(event) => {
                  event.stopPropagation();
                  setFiles((current) =>
                    current.filter(
                      (_, currentIndex) => currentIndex !== index
                    )
                  );
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="novel-check-token-info">
          <div className="novel-check-token-stats">
            <span>
              総文字数: <strong>{totalChars.toLocaleString()}</strong>文字
            </span>
            <span>
              推定トークン数:{" "}
              <strong>{estimatedTokens.toLocaleString()}</strong>
            </span>
            {estimatedModelCosts.map((model) => (
              <span key={model.id}>
                {model.label}概算: <strong>{formatUSD(model.cost)}</strong>
              </span>
            ))}
          </div>
          <div className="novel-check-token-note">
            ※日本語のトークン数は目安です。実際の請求額と若干異なる場合があります
          </div>
        </div>
      )}

      <section className="novel-check-section">
        <h2>チェック項目</h2>
        <div className="novel-check-check-items">
          {CHECK_ITEMS.map((item) => (
            <label key={item}>
              <input
                type="checkbox"
                checked={checkItems.includes(item)}
                onChange={() => toggleCheckItem(item)}
              />
              {item}
            </label>
          ))}
        </div>
      </section>

      <section className="novel-check-section novel-check-model-section">
        <h2>モデル</h2>
        <div className="novel-check-model-list">
          {NOVEL_CHECK_MODELS.map((model) => (
            <button
              type="button"
              key={model.id}
              onClick={() => setSelectedModel(model.id)}
              className={[
                "novel-check-model-button",
                selectedModel === model.id &&
                  "novel-check-model-button-selected",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {model.id}
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        className="novel-check-start-button"
        onClick={handleStart}
        disabled={!canStart}
      >
        {isLoading ? "チェック中…" : "🔍 整合性チェック開始"}
      </button>

      {(result || isLoading) && (
        <section className="novel-check-result-section">
          <h2>
            チェック結果
            {metaInfo && (
              <span>
                ({metaInfo.totalChars.toLocaleString()}文字 / 約
                {metaInfo.estimatedTokens.toLocaleString()}tok)
              </span>
            )}
          </h2>
          <div className="novel-check-result-box">
            {result ? (
              <MarkdownRenderer content={result} />
            ) : (
              <p className="novel-check-generating">生成中…</p>
            )}
          </div>
        </section>
      )}

      {result && !isLoading && (
        <section className="novel-check-save-box">
          <h2>📌 KabeHubに保存</h2>
          <input
            type="text"
            value={saveTitle}
            onChange={(event) => setSaveTitle(event.target.value)}
            placeholder="スレッドタイトル"
          />
          <button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "保存中…" : "スレッドとして保存"}
          </button>
        </section>
      )}
    </main>
  );
}
