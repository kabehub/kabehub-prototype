"use client";

import { useEffect, useRef, useState } from "react";
import { webApiKeyStore } from "@/lib/apiKeyStore";
import type { AutoSummaryUpdatePreview, AutoSummaryUpdateNotApplicableReason } from "./auto-summary-update-limits";
import { applyUpdate, skipAllUpdates, checkpointOnly, requestUpdatePreview, type UpdateTopicResult } from "./auto-summary-update-client";

type Preview = Extract<AutoSummaryUpdatePreview, { result: "preview" }>;
type Outcome = Extract<AutoSummaryUpdatePreview, { result: "not_applicable" }> |
  (Extract<AutoSummaryUpdatePreview, { result: "checkpoint_only" }> & { results: UpdateTopicResult[] });
const NOTICES: Record<AutoSummaryUpdateNotApplicableReason, string> = {
  no_updatable_topics: "差分更新できるMemoryがありません",
  no_new_messages: "差分要約の対象となる新しい発言がありません",
};

export function useAutoSummaryUpdate({ projectId, enabled, showToast, onApplied }: {
  projectId: string | null; enabled: boolean; showToast: (message: string, kind?: "error" | "success") => void;
  onApplied?: () => void | Promise<void>;
}) {
  const [generating, setGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [previewState, setPreview] = useState<{ projectId: string; value: Preview } | null>(null);
  const [results, setResults] = useState<UpdateTopicResult[] | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const identity = useRef({ projectId, enabled });
  identity.current = { projectId, enabled };
  const epoch = useRef(0);
  const busy = useRef(false);
  const applying = useRef(false);
  const consumedRun = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const isCurrent = (id: string | null, generation: number) => identity.current.projectId === id && identity.current.enabled && epoch.current === generation;

  useEffect(() => {
    epoch.current++; busy.current = false; applying.current = false; consumedRun.current = null;
    abort.current?.abort(); abort.current = null;
    setGenerating(false); setIsApplying(false); setPreview(null); setResults(null); setOutcome(null);
    return () => { epoch.current++; abort.current?.abort(); abort.current = null; };
  }, [projectId, enabled]);
  const preview = previewState?.projectId === projectId && enabled ? previewState.value : null;
  const canGenerate = Boolean(enabled && projectId && !generating && !isApplying && !preview);

  const generate = async () => {
    if (!canGenerate || !projectId || busy.current || applying.current) return;
    const generation = epoch.current;
    if (!isCurrent(projectId, generation)) return;
    busy.current = true; setGenerating(true); setOutcome(null);
    const controller = new AbortController(); abort.current = controller;
    try {
      const key = await webApiKeyStore.getKey("openai");
      if (!isCurrent(projectId, generation)) return;
      if (!key?.trim()) throw new Error("OpenAI APIキーが設定されていません");
      const next = await requestUpdatePreview(projectId, key.trim(), controller.signal);
      if (!isCurrent(projectId, generation)) return;
      if (next.result === "preview") {
        consumedRun.current = null; setResults(null); setPreview({ projectId, value: next });
      } else if (next.result === "checkpoint_only") {
        // Mutations already started must finish, even if the preview request is aborted.
        const checkpointResults = await checkpointOnly(projectId, next);
        if (!isCurrent(projectId, generation)) return;
        setOutcome({ ...next, results: checkpointResults });
        if (checkpointResults.some(t => t.checkpoint === "failed")) showToast("確認位置の記録に失敗しました（次回、同じ発言から再確認されます）", "error");
        else showToast("更新が必要なMemoryはありませんでした");
      } else {
        setOutcome(next); showToast(NOTICES[next.reason]);
      }
    } catch (cause) {
      if (isCurrent(projectId, generation) && !controller.signal.aborted) showToast(cause instanceof Error ? cause.message : "差分要約を生成できませんでした", "error");
    } finally {
      if (isCurrent(projectId, generation)) { busy.current = false; setGenerating(false); abort.current = null; }
    }
  };

  const run = async (selectedTopicIds: string[] | null) => {
    if (!projectId || !preview || applying.current || consumedRun.current === preview.run_id) return;
    const generation = epoch.current;
    if (!isCurrent(projectId, generation)) return;
    consumedRun.current = preview.run_id; applying.current = true; setIsApplying(true);
    let next: UpdateTopicResult[];
    try {
      next = selectedTopicIds === null ? await skipAllUpdates(projectId, preview) : await applyUpdate(projectId, preview, selectedTopicIds);
    } catch {
      // Client throws only before mutation starts, so this run may safely be retried.
      if (isCurrent(projectId, generation)) {
        consumedRun.current = null; applying.current = false; setIsApplying(false);
        showToast("差分更新を開始できませんでした。選択内容を確認してください", "error");
      }
      return;
    }
    if (isCurrent(projectId, generation)) {
      setResults(next);
      try { await onApplied?.(); }
      catch { if (isCurrent(projectId, generation)) showToast("Memory一覧の再読込に失敗しました", "error"); }
      // Reload can outlive a Project switch; never unlock a new Project's operation.
      if (isCurrent(projectId, generation)) { applying.current = false; setIsApplying(false); }
    }
  };
  const apply = (selectedTopicIds: string[]) => run(selectedTopicIds);
  const skipAll = () => run(null);
  const close = () => { if (applying.current) return; setPreview(null); setResults(null); };
  return { canGenerate, generating, isApplying, preview, results, outcome, generate, apply, skipAll, close };
}
