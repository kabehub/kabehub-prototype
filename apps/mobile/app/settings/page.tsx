"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ApiKeyProvider } from "@kabehub/shared";

import {
  buildApiKeySaveOperations,
  MOBILE_API_KEY_PROVIDERS,
  type ApiKeyFieldState,
} from "../../lib/apiKeySaveOperations";
import { mobileApiKeyStore } from "../../lib/apiKeyStore";

type ApiKeyFields = Record<ApiKeyProvider, ApiKeyFieldState>;
type ProviderMessages = Partial<Record<ApiKeyProvider, string>>;

const PROVIDER_DETAILS: Record<
  ApiKeyProvider,
  { label: string; placeholder: string }
> = {
  claude: { label: "Claude（Anthropic）", placeholder: "sk-ant-..." },
  gemini: { label: "Gemini", placeholder: "AIza..." },
  openai: { label: "OpenAI", placeholder: "sk-..." },
  ideogram: { label: "Ideogram", placeholder: "APIキーを入力" },
  openrouter: { label: "OpenRouter", placeholder: "sk-or-v1-..." },
};

function createInitialFields(): ApiKeyFields {
  return {
    claude: {
      status: "missing",
      initialValue: "",
      value: "",
      dirty: false,
    },
    gemini: {
      status: "missing",
      initialValue: "",
      value: "",
      dirty: false,
    },
    openai: {
      status: "missing",
      initialValue: "",
      value: "",
      dirty: false,
    },
    ideogram: {
      status: "missing",
      initialValue: "",
      value: "",
      dirty: false,
    },
    openrouter: {
      status: "missing",
      initialValue: "",
      value: "",
      dirty: false,
    },
  };
}

function createRevealState(): Record<ApiKeyProvider, boolean> {
  return {
    claude: false,
    gemini: false,
    openai: false,
    ideogram: false,
    openrouter: false,
  };
}

// Web版と同じく、短い値は固定表示、それ以外は末尾4文字だけを表示する。
function maskKey(key: string): string {
  if (key.length <= 4) return "****";
  return "••••••••" + key.slice(-4);
}

function statusLabel(field: ApiKeyFieldState): string {
  if (field.status === "error") return "読み込みエラー";
  return field.status === "loaded" ? "設定済み" : "未設定";
}

export default function MobileSettingsPage() {
  const [fields, setFields] = useState<ApiKeyFields>(createInitialFields);
  const [revealed, setRevealed] =
    useState<Record<ApiKeyProvider, boolean>>(createRevealState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<ProviderMessages>({});
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadKeys() {
      const results = await Promise.allSettled(
        MOBILE_API_KEY_PROVIDERS.map((provider) =>
          mobileApiKeyStore.getKey(provider)
        )
      );

      if (!active) return;

      const next = createInitialFields();
      results.forEach((result, index) => {
        const provider = MOBILE_API_KEY_PROVIDERS[index];

        if (result.status === "fulfilled") {
          const value = result.value ?? "";
          next[provider] = {
            status: result.value === null ? "missing" : "loaded",
            initialValue: value,
            value,
            dirty: false,
          };
        } else {
          next[provider] = {
            status: "error",
            initialValue: "",
            value: "",
            dirty: false,
          };
        }
      });

      setFields(next);
      setLoading(false);
    }

    void loadKeys();

    return () => {
      active = false;
    };
  }, []);

  function handleChange(provider: ApiKeyProvider, value: string) {
    setFields((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        value,
        // 一度でも編集されたら、初期値へ戻っても保存対象のままにする。
        dirty: true,
      },
    }));
    setSaveErrors((current) => ({ ...current, [provider]: undefined }));
    setSaveMessage(null);
  }

  async function handleSave() {
    const operations = buildApiKeySaveOperations(fields);
    setSaveErrors({});

    if (operations.length === 0) {
      setSaveMessage("保存する変更はありません。");
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    const results = await Promise.allSettled(
      operations.map((operation) =>
        operation.kind === "set"
          ? mobileApiKeyStore.setKey(operation.provider, operation.value)
          : mobileApiKeyStore.removeKey(operation.provider)
      )
    );

    const failed: ProviderMessages = {};
    const successCount = results.filter(
      (result) => result.status === "fulfilled"
    ).length;

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        failed[operations[index].provider] =
          "保存に失敗しました。内容を確認してもう一度お試しください。";
      }
    });

    setFields((current) => {
      const next = { ...current };

      results.forEach((result, index) => {
        const operation = operations[index];

        if (result.status === "rejected") return;

        const savedValue =
          operation.kind === "set" ? operation.value : "";
        const currentField = current[operation.provider];

        next[operation.provider] = {
          ...currentField,
          status: savedValue === "" ? "missing" : "loaded",
          initialValue: savedValue,
          value: savedValue,
          dirty: false,
        };
      });

      return next;
    });

    setSaveErrors(failed);
    const failureCount = operations.length - successCount;
    setSaveMessage(
      failureCount === 0
        ? `${successCount}件のAPIキー設定を保存しました。`
        : `${successCount}件を保存し、${failureCount}件は失敗しました。`
    );
    setSaving(false);
  }

  return (
    <main className="mobile-page">
      <div className="mobile-card mobile-settings-card">
        <div className="mobile-heading-row">
          <div>
            <p className="mobile-eyebrow">KabeHub Mobile</p>
            <h1>APIキー設定</h1>
          </div>
          <Link href="/">ホームへ戻る</Link>
        </div>

        <p className="mobile-muted">
          キーはAndroid Keystoreで保護されたSecure Storageへ保存されます。
          AI機能の利用時だけKabeHubサーバーへ送信され、データベースには保存されません。
        </p>

        {loading ? (
          <p>Secure Storageから読み込み中...</p>
        ) : (
          <div className="api-key-fields">
            {MOBILE_API_KEY_PROVIDERS.map((provider) => {
              const field = fields[provider];
              const details = PROVIDER_DETAILS[provider];

              return (
                <section className="api-key-field" key={provider}>
                  <div className="api-key-field-heading">
                    <label htmlFor={`api-key-${provider}`}>
                      {details.label}
                    </label>
                    <span
                      className={`api-key-status api-key-status-${field.status}`}
                    >
                      {statusLabel(field)}
                    </span>
                  </div>

                  <div className="api-key-input-row">
                    <input
                      id={`api-key-${provider}`}
                      type={revealed[provider] ? "text" : "password"}
                      value={field.value}
                      onChange={(event) =>
                        handleChange(provider, event.target.value)
                      }
                      placeholder={details.placeholder}
                      autoComplete="off"
                      disabled={saving}
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setRevealed((current) => ({
                          ...current,
                          [provider]: !current[provider],
                        }))
                      }
                      disabled={saving}
                    >
                      {revealed[provider] ? "隠す" : "表示"}
                    </button>
                  </div>

                  {field.value && !revealed[provider] && (
                    <p className="api-key-mask">{maskKey(field.value)}</p>
                  )}
                  {field.status === "error" && (
                    <p className="mobile-error">
                      読み込みに失敗しました。入力すると上書き保存されます。
                    </p>
                  )}
                  {field.dirty && (
                    <p className="mobile-dirty">未保存の変更があります。</p>
                  )}
                  {saveErrors[provider] && (
                    <p className="mobile-error">{saveErrors[provider]}</p>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <div className="mobile-save-row">
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving}
          >
            {saving ? "保存中..." : "編集したAPIキーを保存"}
          </button>
          {saveMessage && <p aria-live="polite">{saveMessage}</p>}
        </div>
      </div>
    </main>
  );
}
