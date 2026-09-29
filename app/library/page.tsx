"use client";

import { useCallback, useEffect, useState } from "react";
import ProjectMemorySection from "@/components/ProjectMemorySection";

type Project = { id: string; name: string };

export default function LibraryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.projects)) throw new Error("Projectを読み込めませんでした。");
      setProjects((body.projects as Project[]).sort((a, b) => a.name.localeCompare(b.name, "ja")));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Projectを読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  return (
    <div style={{ maxWidth: "920px", margin: "0 auto", padding: "32px 24px", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "24px" }}>
        <a href="/" style={{ color: "var(--ink-muted)", textDecoration: "none", fontSize: "13px", transition: "color 0.12s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--ink-muted)"; }}>← 壁打ちへ</a>
        <span style={{ color: "var(--border)" }}>|</span>
        <h1 style={{ margin: 0, fontSize: "20px", fontFamily: "'Lora', serif", fontWeight: 600, color: "var(--ink)" }}>Project Memory ライブラリ</h1>
        <a href="/memory" style={{ marginLeft: "auto", color: "var(--ink-muted)", textDecoration: "none", fontSize: "13px" }}>AI記憶（Lore）を見る →</a>
      </div>
      {loading ? <p style={{ color: "var(--ink-muted)" }}>読み込み中…</p>
        : error ? <div role="alert" style={{ color: "#b91c1c" }}><p>{error}</p><button type="button" onClick={() => void loadProjects()}>再読み込み</button></div>
        : projects.length === 0 ? <p style={{ color: "var(--ink-muted)" }}>Projectがありません。</p>
        : <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {projects.map((project) => <ProjectMemorySection key={project.id} projectId={project.id} projectName={project.name} />)}
          </div>}
    </div>
  );
}
