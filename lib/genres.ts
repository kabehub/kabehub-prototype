export const GENRES = [
  {
    id: "philosophy",
    label: "哲学・思想",
    icon: "💭",
    children: [
      { id: "philosophy_general", label: "哲学・形而上学" },
      { id: "psychology",         label: "心理学" },
      { id: "ethics",             label: "倫理学・道徳" },
      { id: "religion",           label: "宗教・神話" },
      { id: "philosophy_other",   label: "その他" },
    ],
  },
  {
    id: "social",
    label: "社会・学問",
    icon: "🏛️",
    children: [
      { id: "politics",     label: "政治・法律" },
      { id: "economics",    label: "経済・社会問題" },
      { id: "education",    label: "教育・学習" },
      { id: "social_other", label: "その他" },
    ],
  },
  {
    id: "history",
    label: "歴史・地理",
    icon: "🌏",
    children: [
      { id: "history_japan",  label: "日本史" },
      { id: "history_world",  label: "世界史" },
      { id: "geography",      label: "地理・地誌" },
      { id: "biography",      label: "伝記・人物" },
      { id: "history_other",  label: "その他" },
    ],
  },
  {
    id: "science",
    label: "自然科学",
    icon: "🔬",
    children: [
      { id: "math",          label: "数学" },
      { id: "physics",       label: "物理学" },
      { id: "chemistry",     label: "化学" },
      { id: "biology",       label: "生物学" },
      { id: "medicine",      label: "医学・健康" },
      { id: "science_other", label: "その他" },
    ],
  },
  {
    id: "technology",
    label: "テクノロジー",
    icon: "💻",
    children: [
      { id: "cs",               label: "情報・コンピュータ" },
      { id: "engineering",      label: "工学・機械" },
      { id: "ai",               label: "AI・機械学習" },
      { id: "technology_other", label: "その他" },
    ],
  },
  {
    id: "business",
    label: "ビジネス・実務",
    icon: "💼",
    children: [
      { id: "management",     label: "経営・事業戦略" },
      { id: "career",         label: "キャリア・働き方" },
      { id: "finance",        label: "財務・税務・投資" },
      { id: "business_other", label: "その他" },
    ],
  },
  {
    id: "creative",
    label: "創作・エンタメ",
    icon: "🎭",
    children: [
      { id: "manga_anime",    label: "マンガ・アニメ" },
      { id: "novel_scenario", label: "小説・シナリオ" },
      { id: "film_music",     label: "映画・映像・音楽" },
      { id: "game",           label: "ゲーム" },
      { id: "creative_other", label: "その他" },
    ],
  },
  {
    id: "literature",
    label: "言語・文学",
    icon: "📖",
    children: [
      { id: "japanese_lit",      label: "日本文学" },
      { id: "world_lit",         label: "海外文学" },
      { id: "language",          label: "言語学・語学" },
      { id: "literature_other",  label: "その他" },
    ],
  },
  {
    id: "life",
    label: "生活・趣味",
    icon: "🌱",
    children: [
      { id: "cooking",    label: "料理・食" },
      { id: "travel",     label: "旅行・外出" },
      { id: "hobby",      label: "趣味・コレクション" },
      { id: "parenting",  label: "育児・家族" },
      { id: "life_other", label: "その他" },
    ],
  },
  {
    id: "original",
    label: "KabeHub独自",
    icon: "✦",
    children: [
      { id: "idea",          label: "アイデア・企画" },
      { id: "diary",         label: "日記・メモ" },
      { id: "original_other", label: "その他" },
    ],
  },
] as const;

// 中分類IDの型
export type GenreId = typeof GENRES[number]["children"][number]["id"];

// 大分類IDの型
export type ParentGenreId = typeof GENRES[number]["id"];

// 中分類IDから親の大分類オブジェクトを逆引き
export function getParentGenre(genreId: GenreId) {
  return GENRES.find((parent) =>
    parent.children.some((child) => child.id === genreId)
  );
}

// 中分類IDからラベルを取得
export function getGenreLabel(genreId: GenreId): string {
  for (const parent of GENRES) {
    const child = parent.children.find((c) => c.id === genreId);
    if (child) return child.label;
  }
  return genreId;
}

// 大分類IDに属する中分類IDの配列を取得（exploreのIN絞り込み用）
export function getChildIds(parentId: ParentGenreId): string[] {
  return (
    GENRES.find((g) => g.id === parentId)?.children.map((c) => c.id) ?? []
  );
}
