import { chatCompleteMini } from "@/lib/lore/openai";
import {
  buildConsolidationUserPrompt,
  ConsolidationSourceRow,
} from "@/lib/lore/consolidation";

export const CONSOLIDATION_PROMPT = `複数の記憶を、重複を取り除いて1つに統合してください。
元の記憶にない新事実は追加しないでください。
矛盾がある場合は、created_at が新しい記憶を優先し、古い内容は「以前は〜だったが、現在は〜」のように整理してください。
出力は統合後の記憶本文のみ。説明や前置きは不要です。`;

export async function generateMergedText(openaiKey: string, sources: ConsolidationSourceRow[]) {
  const mergedText = await chatCompleteMini(
    openaiKey,
    CONSOLIDATION_PROMPT,
    buildConsolidationUserPrompt(sources),
  );
  if (typeof mergedText !== "string" || mergedText.trim().length === 0) {
    throw new Error("Missing merged text");
  }
  return mergedText.trim();
}
