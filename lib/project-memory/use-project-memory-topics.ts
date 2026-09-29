"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { webApiKeyStore } from "@/lib/apiKeyStore";
import { decodeTopicFile, deriveTopicKeyFromFilename, TopicFileHeaderError } from "@/lib/project-memory/topic-file";
import { applyInstructionEdit, requestInstructionEditPreview } from "@/lib/project-memory/instruction-edit-client";
import type { ProposalPreview } from "@/lib/project-memory/instruction-edit-client";

export type ProjectMemoryPromotion = {
  status: "not_promoted" | "current" | "stale";
  source_revision: number | null;
  lore_id: string | null;
};
export type ProjectMemoryTopic = {
  id: string;
  topic_key: string;
  content_md: string;
  revision: number;
  created_at: string;
  updated_at: string;
  promotion: ProjectMemoryPromotion;
};
export type ProjectMemoryUploadCandidate =
  | { kind: "overwrite"; topicId: string; topicKey: string; currentRevision: number; expectedRevision: number; contentMd: string }
  | { kind: "create"; topicKey: string; contentMd: string };

export type InstructionEditState = {
  topicId: string;
  topicKey: string;
  topicRevision: number;
  promotionStatus: ProjectMemoryPromotion["status"];
  phase: "input" | "generating" | "preview" | "applying" | "done";
  instruction: string;
  preview: ProposalPreview | null;
  notice: string | null;
  doneStatus: "applied" | "conflict" | "not_found" | null;
};

export function useProjectMemoryTopics({ projectId, enabled, keepLoaded = false }: { projectId: string; enabled: boolean; keepLoaded?: boolean }) {
  const [loaded, setLoaded] = useState<{ projectId: string; topics: ProjectMemoryTopic[] } | null>(null);
  const loadedRef = useRef<{ projectId: string; topics: ProjectMemoryTopic[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canPromote, setCanPromote] = useState(false);
  const [promotingTopicId, setPromotingTopicId] = useState<string | null>(null);
  const promotingRef = useRef<string | null>(null);
  const uploadingRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadConfirm, setUploadConfirm] = useState<ProjectMemoryUploadCandidate | null>(null);
  const [instructionEdit, setInstructionEdit] = useState<InstructionEditState | null>(null);
  const instructionEditRef = useRef<InstructionEditState | null>(null);
  const instructionGenerationRef = useRef(false);
  const instructionApplyingRef = useRef(false);
  const instructionRequestId = useRef(0);
  const instructionAbortRef = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const topics = loaded?.projectId === projectId ? loaded.topics : [];

  const updateInstructionEdit = (next: InstructionEditState | null) => {
    instructionEditRef.current = next;
    setInstructionEdit(next);
  };

  useEffect(() => {
    if (!enabled) {
      instructionRequestId.current++;
      instructionAbortRef.current?.abort();
      instructionAbortRef.current = null;
      instructionGenerationRef.current = false;
      instructionApplyingRef.current = false;
      updateInstructionEdit(null);
    }
    return () => {
      instructionRequestId.current++;
      instructionAbortRef.current?.abort();
      instructionAbortRef.current = null;
      instructionGenerationRef.current = false;
      instructionApplyingRef.current = false;
      updateInstructionEdit(null);
    };
  }, [projectId, enabled]);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/memory/topics`);
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.topics)) {
        throw new Error(typeof body?.error === "string" ? body.error : "Project Memoryを読み込めませんでした");
      }
      if (id === requestId.current) {
        const next = { projectId, topics: body.topics as ProjectMemoryTopic[] };
        loadedRef.current = next;
        setLoaded(next);
      }
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : "Project Memoryを読み込めませんでした");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!enabled) {
      requestId.current++;
      return;
    }
    if (!keepLoaded || loadedRef.current?.projectId !== projectId) {
      if (!keepLoaded) {
        loadedRef.current = null;
        setLoaded(null);
      }
      void reload();
    }
    let active = true;
    setCanPromote(false);
    webApiKeyStore.getKey("openai")
      .then((key) => { if (active) setCanPromote(Boolean(key?.trim())); })
      .catch(() => { if (active) setCanPromote(false); });
    return () => { active = false; requestId.current++; };
  }, [enabled, keepLoaded, projectId, reload]);

  const promote = async (topic: ProjectMemoryTopic) => {
    if (instructionEditRef.current !== null || promotingRef.current || uploadingRef.current || uploadConfirm !== null || !canPromote || !topic.content_md.trim() || topic.promotion.status === "current") return;
    promotingRef.current = topic.id;
    setPromotingTopicId(topic.id);
    setError(null);
    try {
      const key = await webApiKeyStore.getKey("openai");
      if (!key?.trim()) {
        setCanPromote(false);
        throw new Error("OpenAI APIキーが設定されていません");
      }
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/memory/topics/${encodeURIComponent(topic.id)}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-openai-api-key": key },
        body: JSON.stringify({ expected_revision: topic.revision }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) await reload();
        throw new Error(typeof body?.error === "string" ? body.error : "Loreへの昇格に失敗しました");
      }
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Loreへの昇格に失敗しました");
    } finally {
      promotingRef.current = null;
      setPromotingTopicId(null);
    }
  };

  const selectUploadFile = async (file: File) => {
    if (instructionEditRef.current !== null || uploadingRef.current || promotingRef.current || uploadConfirm !== null) return;
    let raw: string;
    try {
      raw = await file.text();
    } catch {
      if (instructionEditRef.current === null) setError("ファイルの読み込みに失敗しました。");
      return;
    }
    if (instructionEditRef.current !== null) return;
    try {
      const decoded = decodeTopicFile(raw);
      if (decoded.hasHeader) {
        const byId = topics.find((topic) => topic.id === decoded.topicId);
        if (byId) {
          if (byId.topic_key !== decoded.topicKey) throw new TopicFileHeaderError("Topic key mismatch");
          setUploadConfirm({ kind: "overwrite", topicId: byId.id, topicKey: byId.topic_key, currentRevision: byId.revision, expectedRevision: decoded.revision, contentMd: decoded.contentMd });
        } else if (topics.some((topic) => topic.topic_key === decoded.topicKey)) {
          setError("別のtopicからダウンロードされたファイルです（同名の既存topicがあります）。");
        } else {
          setUploadConfirm({ kind: "create", topicKey: decoded.topicKey, contentMd: decoded.contentMd });
        }
      } else {
        const topicKey = deriveTopicKeyFromFilename(file.name);
        if (!topicKey) setError("ファイル名からtopicを特定できません。");
        else if (topics.some((topic) => topic.topic_key === topicKey)) setError("編集元revisionが不明です。Project Memory一覧から再度ダウンロードしてからアップロードしてください。");
        else setUploadConfirm({ kind: "create", topicKey, contentMd: decoded.contentMd });
      }
    } catch (cause) {
      if (cause instanceof TopicFileHeaderError) setError("ファイルのヘッダーが壊れています。Project Memory一覧から再度ダウンロードしてください。");
      else throw cause;
    }
  };

  const executeUpload = async () => {
    if (instructionEditRef.current !== null || !uploadConfirm || uploadingRef.current || promotingRef.current) return;
    const candidate = uploadConfirm;
    uploadingRef.current = true;
    setUploading(true);
    setError(null);
    try {
      const base = `/api/projects/${encodeURIComponent(projectId)}/memory/topics`;
      const overwrite = candidate.kind === "overwrite";
      const response = await fetch(overwrite ? `${base}/${encodeURIComponent(candidate.topicId)}` : base, {
        method: overwrite ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overwrite
          ? { expected_revision: candidate.expectedRevision, edit_kind: "full", new_content_md: candidate.contentMd, source_refs: [] }
          : { topic_key: candidate.topicKey, content_md: candidate.contentMd, source_refs: [] }),
      });
      if ((overwrite && response.status === 200) || (!overwrite && response.status === 201)) {
        await reload();
      } else if (response.status === 409 || response.status === 404) {
        await reload();
        setError(overwrite
          ? response.status === 409 ? "アップロード元から内容が変更されています。再ダウンロードしてやり直してください。" : "対象のtopicが見つかりませんでした。一覧を更新しました。"
          : response.status === 409 ? "同名のtopicが既に作成されています。一覧を更新しました。もう一度お試しください。" : "Projectが見つかりませんでした。一覧を更新しました。");
      } else {
        setError("アップロードに失敗しました");
      }
    } catch {
      setError("アップロードに失敗しました");
    } finally {
      uploadingRef.current = false;
      setUploading(false);
      setUploadConfirm(null);
    }
  };

  const cancelUploadConfirm = () => setUploadConfirm(null);
  const openInstructionEdit = (topic: ProjectMemoryTopic) => {
    if (!enabled || !canPromote || instructionEditRef.current !== null || promotingRef.current !== null ||
        uploadingRef.current || uploadConfirm !== null) return;
    updateInstructionEdit({ topicId: topic.id, topicKey: topic.topic_key, topicRevision: topic.revision,
      promotionStatus: topic.promotion.status, phase: "input", instruction: "", preview: null,
      notice: null, doneStatus: null });
  };

  const closeInstructionEdit = () => {
    if (instructionApplyingRef.current) return;
    instructionRequestId.current++;
    instructionAbortRef.current?.abort();
    instructionAbortRef.current = null;
    instructionGenerationRef.current = false;
    updateInstructionEdit(null);
  };

  const cancelInstructionEditGeneration = () => {
    const current = instructionEditRef.current;
    if (!current || current.phase !== "generating") return;
    instructionRequestId.current++;
    instructionAbortRef.current?.abort();
    instructionAbortRef.current = null;
    instructionGenerationRef.current = false;
    updateInstructionEdit({ ...current, phase: "input", preview: null, notice: null });
  };

  const backToInstructionInput = () => {
    const current = instructionEditRef.current;
    if (!current || current.phase !== "preview") return;
    updateInstructionEdit({ ...current, phase: "input", preview: null, notice: null });
  };

  const setInstructionEditInstruction = (instruction: string) => {
    const current = instructionEditRef.current;
    if (!current || current.phase !== "input") return;
    updateInstructionEdit({ ...current, instruction, notice: null });
  };

  const generateInstructionEditPreview = async (instruction: string) => {
    const current = instructionEditRef.current;
    const trimmed = instruction.trim();
    if (!current || current.phase !== "input" || !trimmed || instructionGenerationRef.current || instructionApplyingRef.current) return;
    const id = ++instructionRequestId.current;
    const controller = new AbortController();
    instructionAbortRef.current = controller;
    instructionGenerationRef.current = true;
    updateInstructionEdit({ ...current, instruction, phase: "generating", preview: null, notice: null });
    try {
      const key = await webApiKeyStore.getKey("openai");
      if (id !== instructionRequestId.current || instructionEditRef.current?.topicId !== current.topicId) return;
      if (!key?.trim()) {
        setCanPromote(false);
        updateInstructionEdit({ ...current, instruction, phase: "input", preview: null,
          notice: "OpenAI APIキーが設定されていません" });
        return;
      }
      // Aborting this fetch only cancels the UI request; the upstream OpenAI call may continue.
      const result = await requestInstructionEditPreview({ projectId, topicId: current.topicId,
        instruction: trimmed, apiKey: key, signal: controller.signal });
      if (id !== instructionRequestId.current || instructionEditRef.current?.topicId !== current.topicId) return;
      if (!result.ok) {
        updateInstructionEdit({ ...current, instruction, phase: "input", preview: null,
          notice: result.kind === "aborted" ? null : result.message });
      } else if (result.preview.result === "proposal") {
        updateInstructionEdit({ ...current, instruction, phase: "preview", preview: result.preview,
          notice: null, doneStatus: null });
      } else {
        updateInstructionEdit({ ...current, instruction, topicRevision: result.preview.revision,
          phase: "input", preview: null, notice: result.preview.result === "no_change"
            ? "変更はありませんでした。指示を見直してください" : result.preview.reason });
      }
    } catch {
      if (id === instructionRequestId.current && instructionEditRef.current?.topicId === current.topicId) {
        updateInstructionEdit({ ...current, instruction, phase: "input", preview: null,
          notice: "AI編集案を生成できませんでした" });
      }
    } finally {
      if (id === instructionRequestId.current) {
        instructionAbortRef.current = null;
        instructionGenerationRef.current = false;
      }
    }
  };

  const applyInstructionEditPreview = async () => {
    const current = instructionEditRef.current;
    if (!current || current.phase !== "preview" || !current.preview || instructionApplyingRef.current) return;
    const id = ++instructionRequestId.current;
    instructionApplyingRef.current = true;
    updateInstructionEdit({ ...current, phase: "applying", notice: null });
    const result = await applyInstructionEdit({ projectId, preview: current.preview });
    if (id !== instructionRequestId.current || instructionEditRef.current?.topicId !== current.topicId) return;
    if (result.status === "failed") {
      instructionApplyingRef.current = false;
      updateInstructionEdit({ ...current, phase: "preview", notice: result.message });
      return;
    }
    await reload();
    if (id !== instructionRequestId.current || instructionEditRef.current?.topicId !== current.topicId) return;
    instructionApplyingRef.current = false;
    updateInstructionEdit({ ...current, phase: "done", preview: null, notice: null, doneStatus: result.status });
  };

  const isActionLocked = () => promotingRef.current !== null || uploadingRef.current || uploadConfirm !== null || instructionEditRef.current !== null;
  return { topics, loading, error, canPromote, promotingTopicId, uploading, uploadConfirm,
    promote, selectUploadFile, executeUpload, cancelUploadConfirm, reload, isActionLocked,
    instructionEdit, canInstructionEdit: canPromote, openInstructionEdit, closeInstructionEdit,
    setInstructionEditInstruction,
    generateInstructionEditPreview, cancelInstructionEditGeneration, backToInstructionInput,
    applyInstructionEditPreview };
}
