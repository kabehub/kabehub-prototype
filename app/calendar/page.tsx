"use client";

import { useEffect, useState, useCallback, type CSSProperties } from "react";

interface CalendarThread {
  id: string;
  title: string;
  updated_at: string;
}

const DAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

function toLocalDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [threads, setThreads] = useState<CalendarThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fetchData = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?year=${y}&month=${m}`);
      if (!res.ok) return;
      const data = await res.json();
      setThreads(data);
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(year, month);
    setSelectedDate(null);
  }, [year, month, fetchData]);

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  };

  const byDate = threads.reduce<Record<string, CalendarThread[]>>((acc, t) => {
    const key = toLocalDateKey(t.updated_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = toLocalDateKey(now.toISOString());
  const selectedThreads = selectedDate ? (byDate[selectedDate] ?? []) : [];

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "32px 24px", fontFamily: "'DM Sans', sans-serif" }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
        <a
          href="/"
          style={{ color: "var(--ink-muted)", textDecoration: "none", fontSize: "13px", transition: "color 0.12s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--ink-muted)"; }}
        >
          ← 壁打ちへ
        </a>
        <span style={{ color: "var(--border)" }}>|</span>
        <h1 style={{ margin: 0, fontSize: "20px", fontFamily: "'Lora', serif", fontWeight: 600, color: "var(--ink)" }}>
          📅 カレンダー
        </h1>
      </div>

      {/* 月ナビ */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
        <button onClick={prevMonth} style={navBtnStyle}>←</button>
        <span style={{ fontSize: "18px", fontWeight: 600, color: "var(--ink)", minWidth: "130px", textAlign: "center" }}>
          {year}年 {month}月
        </span>
        <button onClick={nextMonth} style={navBtnStyle}>→</button>
        {loading && <span style={{ fontSize: "12px", color: "var(--ink-muted)" }}>読み込み中…</span>}
      </div>

      {/* カレンダーグリッド */}
      <div style={{ border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden" }}>
        {/* 曜日ヘッダー */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "var(--sidebar-bg)", borderBottom: "1px solid var(--border)" }}>
          {DAYS_JA.map((d, i) => (
            <div
              key={d}
              style={{
                padding: "8px 0",
                textAlign: "center",
                fontSize: "11px",
                fontWeight: 500,
                color: i === 0 ? "#e53e3e" : i === 6 ? "#3b82f6" : "var(--ink-muted)",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 日付セル */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {cells.map((day, idx) => {
            const colIdx = idx % 7;
            const borderRight = colIdx !== 6 ? "1px solid var(--border)" : "none";
            // 最終行以外はborderBottom
            const totalRows = cells.length / 7;
            const rowIdx = Math.floor(idx / 7);
            const borderBottom = rowIdx < totalRows - 1 ? "1px solid var(--border)" : "none";

            if (!day) {
              return (
                <div
                  key={idx}
                  style={{ minHeight: "64px", borderRight, borderBottom, background: "#fafafa" }}
                />
              );
            }

            const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayThreads = byDate[dateKey] ?? [];
            const isSelected = selectedDate === dateKey;
            const isToday = dateKey === todayKey;
            const isSun = colIdx === 0;
            const isSat = colIdx === 6;
            const hasThreads = dayThreads.length > 0;

            const dayNumColor = isToday ? "white" : isSun ? "#e53e3e" : isSat ? "#3b82f6" : "var(--ink)";

            return (
              <div
                key={idx}
                onClick={() => hasThreads && setSelectedDate(isSelected ? null : dateKey)}
                style={{
                  minHeight: "64px",
                  padding: "6px 8px",
                  borderRight,
                  borderBottom,
                  background: isSelected ? "var(--sidebar-bg)" : "white",
                  cursor: hasThreads ? "pointer" : "default",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (hasThreads && !isSelected) (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "white";
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: isToday ? 700 : 400,
                    color: dayNumColor,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "22px",
                    height: "22px",
                    borderRadius: isToday ? "50%" : "0",
                    background: isToday ? "var(--accent)" : "transparent",
                  }}
                >
                  {day}
                </span>
                {hasThreads && (
                  <div style={{ marginTop: "4px" }}>
                    <span
                      style={{
                        fontSize: "10px",
                        background: "var(--accent)",
                        color: "white",
                        borderRadius: "10px",
                        padding: "1px 6px",
                        fontWeight: 500,
                      }}
                    >
                      {dayThreads.length}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 選択日のスレッド一覧 */}
      {selectedDate && (
        <div style={{ marginTop: "20px" }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--ink-muted)",
              marginBottom: "10px",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.03em",
            }}
          >
            {selectedDate} — {selectedThreads.length}件
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {selectedThreads.map((t) => (
              <a
                key={t.id}
                href={`/?thread=${t.id}`}
                style={{
                  display: "block",
                  padding: "10px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: "7px",
                  textDecoration: "none",
                  color: "var(--ink)",
                  fontSize: "13px",
                  background: "white",
                  transition: "all 0.12s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--accent-muted)";
                  (e.currentTarget as HTMLAnchorElement).style.background = "var(--sidebar-bg)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLAnchorElement).style.background = "white";
                }}
              >
                {t.title}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle: CSSProperties = {
  width: "32px",
  height: "32px",
  borderRadius: "6px",
  border: "1px solid var(--border)",
  background: "white",
  color: "var(--ink-muted)",
  fontSize: "16px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};
