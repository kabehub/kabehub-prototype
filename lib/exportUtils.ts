// lib/exportUtils.ts
// ⚠️ このファイルでは [[text]]→████ の変換は一切行わない。
//    エクスポートは常に生データを出力すること（variant="share" を通さない）。

import JSZip from "jszip";
import { Message, Thread } from "@/types";

// ============================================================
// 型定義（一括エクスポート用）
// ============================================================

export type BulkExportRawData = {
  threads: Thread[];
  messages: Message[];
  tags: { id: string; thread_id: string; name: string; user_id: string; created_at: string }[];
  notes: { id: string; thread_id: string; content: string; created_at: string; updated_at: string; user_id: string }[];
  messageNotes: { id: string; message_id: string; thread_id: string; content: string; created_at: string; user_id: string }[];
  drafts: { id: string; thread_id: string; content: string; created_at: string; user_id: string }[];
  profiles: unknown[];
  likes: unknown[];
  exportedAt: string;
};

// ============================================================
// CSVブロックの省略処理（ChatPanel.tsx から移動）
// ============================================================

export const processCsvBlocks = (content: string, omitCsv: boolean): string => {
  if (!omitCsv) return content;
  return content.replace(/```csv\s*\r?\n([\s\S]*?)```/gi, (_match, csvData: string) => {
    const lines = csvData.split(/\r?\n/).filter((line: string) => line.trim() !== "");
    const rowCount = Math.max(0, lines.length - 1);
    return `（添付ファイル: ${rowCount}行のCSVデータ）`;
  });
};

// ============================================================
// エクスポートコンテンツ生成（ChatPanel.tsx から移動）
// ============================================================

export type ExportOptions = { omitCsv: boolean };

export const buildExportContent = (
  format: "txt" | "md" | "csv",
  thread: Thread,
  messages: Message[],
  options: ExportOptions = { omitCsv: false }
): string => {
  const lines: string[] = [];

  if (format === "md") {
    const createdAt = messages.length > 0
      ? new Date(messages[0].created_at).toISOString()
      : new Date(thread.created_at).toISOString();
    const modifiedAt = messages.length > 0
      ? new Date(messages[messages.length - 1].created_at).toISOString()
      : new Date(thread.updated_at ?? thread.created_at).toISOString();

    const usedAIs = Array.from(
      new Set(
        messages
          .map((m) => m.provider)
          .filter((p) => p === "claude" || p === "gemini" || p === "openai")
      )
    );
    const exportTags = ["ai-conversation", ...usedAIs];
    const safeTitle = thread.title.replace(/"/g, '\\"');
    const systemPromptValue = thread.system_prompt?.trim() ?? "";

    lines.push("---");
    lines.push(`title: "${safeTitle}"`);
    lines.push(`source: kabehub`);
    lines.push(`created: ${createdAt}`);
    lines.push(`modified: ${modifiedAt}`);
    lines.push(`tags:`);
    exportTags.forEach((tag) => lines.push(`  - ${tag}`));
    lines.push(`message_count: ${messages.length}`);
    lines.push(`system_prompt: "${systemPromptValue.replace(/"/g, '\\"')}"`);
    lines.push("---");
    lines.push("");

    messages.forEach((msg) => {
      const msgContent = processCsvBlocks(msg.content, options.omitCsv);
      const contentLines = msgContent.split("\n").map((l) => `> ${l}`).join("\n");

      if (msg.provider === "memo") {
        lines.push(`> [!MEMO] 📝 Memo`);
        lines.push(contentLines);
      } else if (msg.role === "user") {
        lines.push(`> [!QUESTION] You`);
        lines.push(contentLines);
      } else {
        const aiLabel =
          msg.provider === "gemini" ? "Gemini" :
          msg.provider === "openai" ? "ChatGPT" : "Claude";
        lines.push(`> [!NOTE] ${aiLabel}`);
        lines.push(contentLines);
      }
      lines.push("");
    });

  } else if (format === "csv") {
    lines.push("\uFEFF" + "timestamp,role,provider,content");
    messages.forEach((msg) => {
      const timestamp = new Date(msg.created_at).toLocaleString("ja-JP");
      const rawContent = msg.content.replace(/\n/g, " ");
      const needsQuote = /[,"\n]/.test(rawContent);
      const escapedContent = rawContent.replace(/"/g, '""');
      const content = needsQuote ? `"${escapedContent}"` : escapedContent;
      lines.push(`${timestamp},${msg.role},${msg.provider ?? "unknown"},${content}`);
    });

  } else {
    // txt
    lines.push(`# ${thread.title}`);
    lines.push(`エクスポート日時: ${new Date().toLocaleString("ja-JP")}`);
    lines.push("=".repeat(40));
    lines.push("");
    messages.forEach((msg) => {
      const aiName =
        msg.provider === "gemini" ? "Gemini" :
        msg.provider === "openai" ? "ChatGPT" :
        msg.provider === "claude" ? "Claude" : "AI";
      const roleLabel =
        msg.provider === "memo" ? "【📝 メモ】" :
        msg.role === "user" ? "【あなた】" :
        `【${aiName}】`;
      const time = new Date(msg.created_at).toLocaleString("ja-JP");
      lines.push(`${roleLabel} ${time}`);
      lines.push(processCsvBlocks(msg.content, options.omitCsv));
      lines.push("");
      lines.push("-".repeat(40));
      lines.push("");
    });
  }

  return lines.join("\n");
};

// ============================================================
// 一括エクスポート：全データのZIP生成
// ============================================================

export const generateBulkExportZip = async (data: BulkExportRawData): Promise<Blob> => {
  const zip = new JSZip();

  // 1. kabehub_export.json（全データの機械可読スナップショット）
  const jsonPayload = {
    exported_at: data.exportedAt,
    version: "1",
    profile: data.profiles[0] ?? null,
    threads: data.threads,
    messages: data.messages,
    thread_tags: data.tags,
    thread_notes: data.notes,
    message_notes: data.messageNotes,
    drafts: data.drafts,
    likes: data.likes,
  };
  zip.file("kabehub_export.json", JSON.stringify(jsonPayload, null, 2));

  // 2. threads/{slug}/thread.md（人間可読MDファイル群）
  const threadsFolder = zip.folder("threads");
  if (!threadsFolder) throw new Error("ZIP folder creation failed");

  // メッセージをthread_idでグルーピング
  const messagesByThread: Record<string, Message[]> = {};
  for (const msg of data.messages) {
    if (!messagesByThread[msg.thread_id]) messagesByThread[msg.thread_id] = [];
    messagesByThread[msg.thread_id].push(msg);
  }

  for (const thread of data.threads) {
    const threadMessages = messagesByThread[thread.id] ?? [];
    const md = buildExportContent("md", thread, threadMessages, { omitCsv: false });
    const slug = buildSlug(thread.title, thread.id);
    const folder = threadsFolder.folder(slug);
    folder?.file("thread.md", md);
  }

  return zip.generateAsync({ type: "blob" });
};

// ============================================================
// ユーティリティ
// ============================================================

const buildSlug = (title: string, id: string): string => {
  const sanitized = title
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
  const shortId = id.slice(0, 8);
  return `${sanitized || "thread"}-${shortId}`;
};