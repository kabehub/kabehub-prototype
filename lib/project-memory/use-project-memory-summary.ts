"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectMemorySummaryTopic } from "./summary";
import { fetchProjectMemorySummaryTopics } from "./summary-client";

type SummaryState = {
  projectId: string;
  refreshToken: number;
  topics: ProjectMemorySummaryTopic[] | null;
  loading: boolean;
  error: string | null;
};

export function useProjectMemorySummary({ projectId, refreshToken }: { projectId: string | null; refreshToken: number }) {
  const [result, setResult] = useState<SummaryState | null>(null);
  const requestId = useRef(0);
  const identity = useRef({ projectId, refreshToken });
  // Invalidate responses on render, including the interval before the next effect.
  if (identity.current.projectId !== projectId || identity.current.refreshToken !== refreshToken) {
    requestId.current++;
    identity.current = { projectId, refreshToken };
  }

  useEffect(() => {
    if (projectId === null) return;
    const id = ++requestId.current;
    const controller = new AbortController();
    const isCurrent = () => id === requestId.current && !controller.signal.aborted &&
      identity.current.projectId === projectId && identity.current.refreshToken === refreshToken;
    setResult(previous => ({
      projectId, refreshToken,
      topics: previous?.projectId === projectId ? previous.topics : null,
      loading: true, error: null,
    }));
    void (async () => {
      try {
        const topics = await fetchProjectMemorySummaryTopics(projectId, controller.signal);
        if (isCurrent()) setResult({ projectId, refreshToken, topics, loading: false, error: null });
      } catch {
        if (isCurrent()) setResult({ projectId, refreshToken, topics: null, loading: false, error: "Project Memoryを読み込めませんでした" });
      }
    })();
    return () => { requestId.current++; controller.abort(); };
  }, [projectId, refreshToken]);

  if (projectId === null) return { topics: null, loading: false, error: null };
  if (result?.projectId !== projectId) return { topics: null, loading: true, error: null };
  return {
    topics: result.topics,
    loading: result.loading || result.refreshToken !== refreshToken,
    error: result.refreshToken === refreshToken ? result.error : null,
  };
}
