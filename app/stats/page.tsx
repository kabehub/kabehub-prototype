"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Period = "today" | "week" | "month" | "all";

interface ModelStat {
  key: string;
  count: number;
  input_tokens: number;
  output_tokens: number;
}

interface StatsData {
  sends: number;
  total_tokens: number;
  by_model: ModelStat[];
  hourly: Record<number, number>;
  since: string;
}

function formatK(n: number): string {
  if (n === 0) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatModelKey(key: string): string {
  const slash = key.indexOf("/");
  if (slash === -1) return key;
  const provider = key.slice(0, slash);
  const model = key.slice(slash + 1);
  if (model === "unknown") return `${provider} （旧データ）`;
  return key;
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "今日",
  week: "今週",
  month: "今月",
  all: "全期間",
};

export default function StatsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("today");
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/stats?period=${period}&tz=${encodeURIComponent(tz)}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error("取得失敗");
      setData(await res.json());
    } catch {
      setError("統計の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [router, period]);

  // period 変更時・初回マウント時に fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // フォーカス復帰時に再 fetch
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchStats();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchStats]);

  // 時間帯グラフの最大値
  const maxHourly = data ? Math.max(...Object.values(data.hourly), 1) : 1;

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg, #f9f9f7)", fontFamily: "'DM Sans', sans-serif" }}>
      {/* ヘッダー */}
      <div style={{ borderBottom: "1px solid var(--border, #e8e6e1)", background: "white", padding: "14px 24px", display: "flex", alignItems: "center", gap: "16px" }}>
        <button
          onClick={() => router.push("/")}
          style={{ fontSize: "13px", color: "var(--ink-muted, #888)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          ← 戻る
        </button>
        <span style={{ fontFamily: "'Lora', serif", fontWeight: 600, fontSize: "16px", color: "var(--ink, #1a1a1a)" }}>
          利用統計
        </span>
      </div>

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "24px 16px" }}>
        {/* 期間タブ */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "24px" }}>
          {(["today", "week", "month", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: "6px 16px",
                borderRadius: "20px",
                border: "1px solid",
                borderColor: period === p ? "var(--accent, #6d28d9)" : "var(--border, #e8e6e1)",
                background: period === p ? "var(--accent, #6d28d9)" : "white",
                color: period === p ? "white" : "var(--ink-muted, #888)",
                fontSize: "13px",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.15s",
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-faint, #bbb)", fontSize: "13px" }}>
            読み込み中…
          </div>
        )}

        {error && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#e53e3e", fontSize: "13px" }}>
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* サマリーカード */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
              <div style={{ background: "white", borderRadius: "10px", border: "1px solid var(--border, #e8e6e1)", padding: "20px 24px" }}>
                <div style={{ fontSize: "11px", color: "var(--ink-faint, #bbb)", fontFamily: "'JetBrains Mono', monospace", marginBottom: "8px", letterSpacing: "0.05em" }}>
                  SENDS
                </div>
                <div style={{ fontSize: "32px", fontWeight: 700, color: "var(--ink, #1a1a1a)", lineHeight: 1 }}>
                  {data.sends.toLocaleString()}
                </div>
                <div style={{ fontSize: "12px", color: "var(--ink-muted, #888)", marginTop: "4px" }}>
                  送信回数
                </div>
              </div>

              <div style={{ background: "white", borderRadius: "10px", border: "1px solid var(--border, #e8e6e1)", padding: "20px 24px" }}>
                <div style={{ fontSize: "11px", color: "var(--ink-faint, #bbb)", fontFamily: "'JetBrains Mono', monospace", marginBottom: "8px", letterSpacing: "0.05em" }}>
                  TOKENS
                </div>
                <div style={{ fontSize: "32px", fontWeight: 700, color: "var(--ink, #1a1a1a)", lineHeight: 1 }}>
                  {data.total_tokens === 0 ? "—" : formatK(data.total_tokens)}
                </div>
                {(() => {
                  const totalInput = data.by_model.reduce((s, m) => s + m.input_tokens, 0);
                  const totalOutput = data.by_model.reduce((s, m) => s + m.output_tokens, 0);
                  return (totalInput > 0 || totalOutput > 0) ? (
                    <div style={{ fontSize: "11px", color: "var(--ink-faint, #bbb)", marginTop: "3px" }}>
                      入力 {formatK(totalInput)} / 出力 {formatK(totalOutput)}
                    </div>
                  ) : null;
                })()}
                <div style={{ fontSize: "12px", color: "var(--ink-muted, #888)", marginTop: "4px" }}>
                  合計トークン数
                </div>
                {data.total_tokens === 0 && (period === "month" || period === "all") && (
                  <div style={{ fontSize: "10px", color: "var(--ink-faint, #bbb)", marginTop: "6px" }}>
                    ※ v92以降のデータのみ集計
                  </div>
                )}
              </div>
            </div>

            {/* 時間帯グラフ（today のみ） */}
            {period === "today" && (
              <div style={{ background: "white", borderRadius: "10px", border: "1px solid var(--border, #e8e6e1)", padding: "20px 24px", marginBottom: "24px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-muted, #888)", marginBottom: "16px" }}>
                  時間帯別送信数
                </div>
                {Object.keys(data.hourly).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "var(--ink-faint, #bbb)", fontSize: "12px" }}>
                    今日はまだメッセージがありません
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "80px" }}>
                    {Array.from({ length: 24 }, (_, h) => {
                      const count = data.hourly[h] ?? 0;
                      const height = count > 0 ? Math.max(4, Math.round((count / maxHourly) * 72)) : 2;
                      return (
                        <div key={h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                          <div
                            title={`${h}時: ${count}回`}
                            style={{
                              width: "100%",
                              height: `${height}px`,
                              background: count > 0 ? "var(--accent, #6d28d9)" : "var(--border, #e8e6e1)",
                              borderRadius: "2px",
                              opacity: count > 0 ? 0.85 : 0.4,
                              transition: "opacity 0.1s",
                              cursor: count > 0 ? "default" : undefined,
                            }}
                          />
                          {h % 6 === 0 && (
                            <span style={{ fontSize: "9px", color: "var(--ink-faint, #bbb)" }}>{h}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* モデル別テーブル */}
            {data.by_model.length > 0 && (
              <div style={{ background: "white", borderRadius: "10px", border: "1px solid var(--border, #e8e6e1)", overflow: "hidden" }}>
                <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border, #e8e6e1)", fontSize: "12px", fontWeight: 600, color: "var(--ink-muted, #888)" }}>
                  モデル別
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "var(--sidebar-bg, #f5f4f0)" }}>
                      <th style={{ padding: "10px 24px", textAlign: "left", fontSize: "11px", color: "var(--ink-faint, #bbb)", fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>MODEL</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontSize: "11px", color: "var(--ink-faint, #bbb)", fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>AI返答</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontSize: "11px", color: "var(--ink-faint, #bbb)", fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>入力tok</th>
                      <th style={{ padding: "10px 24px 10px 16px", textAlign: "right", fontSize: "11px", color: "var(--ink-faint, #bbb)", fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>出力tok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_model.map((m, i) => (
                      <tr key={m.key} style={{ borderTop: i > 0 ? "1px solid var(--border, #e8e6e1)" : undefined }}>
                        <td style={{ padding: "12px 24px", color: "var(--ink, #1a1a1a)", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px" }}>
                          {formatModelKey(m.key)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--ink, #1a1a1a)", fontWeight: 500 }}>
                          {m.count}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--ink-muted, #888)" }}>
                          {formatK(m.input_tokens)}
                        </td>
                        <td style={{ padding: "12px 24px 12px 16px", textAlign: "right", color: "var(--ink-muted, #888)" }}>
                          {formatK(m.output_tokens)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.by_model.length === 0 && (
              <div style={{ background: "white", borderRadius: "10px", border: "1px solid var(--border, #e8e6e1)", padding: "40px 24px", textAlign: "center", color: "var(--ink-faint, #bbb)", fontSize: "13px" }}>
                {PERIOD_LABELS[period]}はまだ利用がありません
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
