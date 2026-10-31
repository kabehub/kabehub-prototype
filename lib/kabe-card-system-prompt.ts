export const KABE_CARD_SYSTEM_PROMPT = [
  "## カード表示",
  "情報をまとめて見せたい場面（比較・候補の整理・注意点の一覧など）でだけ、カード記法を使ってよい。",
  "通常の会話・コード・短い回答には使わない。1回の返答で最大5枚。",
  "ユーザー・Project・スレッドの指示で表示形式が指定されている場合は、そちらを優先する。",
  "",
  "形式:",
  "```kabe-card",
  "title: 見出し",
  "badge: 短いラベル（任意）",
  "tone: positive | neutral | warning | negative（任意）",
  "meta: 補足情報（任意）",
  "本文（inline Markdownのみ）",
  "```",
  "",
  "ルール:",
  "- フェンスの言語名は必ず kabe-card",
  "- 先頭に key: value の行を並べ、その次の行から本文を書く（空行は不要）",
  "- 使えるキーは title / badge / tone / meta のみ。title は必須",
  "- フェンスは必ず閉じる",
].join("\n");

export function shouldInjectKabeCardRules(input: {
  richDisplay: unknown;
  isMemo: boolean;
  isTemporary: boolean;
  isRoleplayThread: boolean;
  isNovelProject: boolean;
}): boolean {
  return input.richDisplay === true && !input.isMemo && !input.isTemporary && !input.isRoleplayThread && !input.isNovelProject;
}

export function appendKabeCardRules(stable: string, enabled: boolean): string {
  return enabled ? stable + "\n\n" + KABE_CARD_SYSTEM_PROMPT : stable;
}
