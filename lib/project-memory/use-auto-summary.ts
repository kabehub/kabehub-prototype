"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { webApiKeyStore } from "@/lib/apiKeyStore";
import { AUTO_SUMMARY_STANDARD_TOPIC_KEYS, type AutoSummaryTopicKey, type AutoSummaryPreview, type AutoSummaryNotApplicableReason } from "./auto-summary-limits";
import { applyAutoSummary, requestAutoSummaryPreview, type AutoSummaryApplyResult } from "./auto-summary-client";

const NOTICES: Record<AutoSummaryNotApplicableReason, string> = {
  all_standard_topics_exist: "標準のProject Memoryはすべて作成済みです",
  no_eligible_threads: "要約できる会話がありません。通常スレッドにユーザーの発言が2件以上必要です",
  insufficient_evidence: "会話からProject Memoryを作成するための十分な根拠が見つかりませんでした",
};
export function useAutoSummary({ projectId, enabled, showToast }: {
  projectId: string | null; enabled: boolean; showToast: (message: string, kind?: "error" | "success") => void;
}) {
  const [eligibility, setEligibility] = useState<{ projectId: string; missing: AutoSummaryTopicKey[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [previewState, setPreview] = useState<{ projectId: string; value: AutoSummaryPreview } | null>(null);
  const [results, setResults] = useState<AutoSummaryApplyResult[] | null>(null);
  const identity = useRef({ projectId, enabled });
  identity.current = { projectId, enabled };
  const requestId = useRef(0);
  const epoch = useRef(0);
  const busy = useRef(false);
  const applying = useRef(false);
  const consumedRun = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const isCurrent = (id: string | null, generation: number) => identity.current.projectId === id && identity.current.enabled && epoch.current === generation;

  const reload = useCallback(async () => {
    if (!projectId || !enabled) return;
    const generation = epoch.current;
    // An old apply still refreshes its Project, but must not invalidate a new Project's pending GET.
    const id = isCurrent(projectId, generation) ? ++requestId.current : -1;
    if (isCurrent(projectId, generation)) { setLoading(true); setError(null); setEligibility(null); }
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/memory/topics`);
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.topics) || !body.topics.every((t: unknown) =>
        typeof t === "object" && t !== null && typeof (t as { topic_key?: unknown }).topic_key === "string")) throw new Error("Project Memoryを読み込めませんでした");
      if (id === requestId.current && isCurrent(projectId, generation)) {
        const existing = new Set(body.topics.map((t: { topic_key: string }) => t.topic_key));
        setEligibility({ projectId, missing: AUTO_SUMMARY_STANDARD_TOPIC_KEYS.filter(k => !existing.has(k)) });
      }
    } catch {
      if (id === requestId.current && isCurrent(projectId, generation)) setError("Project Memoryを読み込めませんでした");
    } finally {
      if (id === requestId.current && isCurrent(projectId, generation)) setLoading(false);
    }
  }, [projectId, enabled]);

  useEffect(() => {
    epoch.current++; busy.current = false; applying.current = false; consumedRun.current = null;
    setGenerating(false); setIsApplying(false); setPreview(null); setResults(null); setEligibility(null); setError(null); setLoading(false);
    if (enabled && projectId) void reload();
    return () => { epoch.current++; requestId.current++; abort.current?.abort(); };
  }, [projectId, enabled, reload]);
  const missingStandardTopicKeys = enabled && eligibility?.projectId === projectId ? eligibility.missing : [];
  const canGenerate = Boolean(enabled && projectId && eligibility?.projectId === projectId && !loading && !error && missingStandardTopicKeys.length && !generating && !isApplying && !previewState);

  const generate = async () => {
    if (!canGenerate || !projectId || busy.current) return;
    busy.current = true; setGenerating(true);
    const generation = epoch.current;
    const controller = new AbortController(); abort.current = controller;
    try {
      const key = await webApiKeyStore.getKey("openai");
      if (!isCurrent(projectId, generation)) return;
      if (!key?.trim()) throw new Error("OpenAI APIキーが設定されていません");
      const next = await requestAutoSummaryPreview(projectId, key.trim(), controller.signal);
      if (!isCurrent(projectId, generation)) return;
      if (next.result === "not_applicable") { showToast(NOTICES[next.reason]); await reload(); }
      else { consumedRun.current = null; setResults(null); setPreview({ projectId, value: next }); }
    } catch (cause) {
      if (isCurrent(projectId, generation) && !controller.signal.aborted) showToast(cause instanceof Error ? cause.message : "会話からProject Memoryを生成できませんでした", "error");
    } finally {
      if (isCurrent(projectId, generation)) { busy.current = false; setGenerating(false); abort.current = null; }
    }
  };
  const preview = previewState?.projectId === projectId && enabled ? previewState.value : null;
  const apply = async (keys: string[]) => {
    if (!projectId || !preview || applying.current || consumedRun.current === preview.run_id || !keys.length) return;
    const generation = epoch.current;
    consumedRun.current = preview.run_id; applying.current = true; setIsApplying(true);
    try {
      const next = await applyAutoSummary(projectId, preview, keys);
      if (isCurrent(projectId, generation)) setResults(next);
    } finally {
      // Always refresh after applied/conflict/failed. Failed runs cannot reuse old generated content.
      await reload();
      if (isCurrent(projectId, generation)) { applying.current = false; setIsApplying(false); }
    }
  };
  const close = () => { if (applying.current) return; setPreview(null); setResults(null); };
  return { missingStandardTopicKeys, loading, error, canGenerate, generating, isApplying, preview, results, generate, apply, close, reload,
    buttonLabel: generating ? "生成中…" : missingStandardTopicKeys.length === AUTO_SUMMARY_STANDARD_TOPIC_KEYS.length ? "会話からMemoryを作る" : "不足分を会話から作る" };
}
