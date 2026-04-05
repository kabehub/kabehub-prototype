import { Metadata } from "next";
import { notFound } from "next/navigation";
import ArenaViewPage from "./ArenaViewPage";

// ── データ取得 ────────────────────────────────────────────────────

async function fetchArenaData(token: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const res = await fetch(`${baseUrl}/api/share/${token}`, {
    cache: "no-store",
  });

  if (!res.ok) return null;
  return res.json();
}

// ── 動的OGP ──────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: { token: string };
}): Promise<Metadata> {
  const data = await fetchArenaData(params.token);

  if (!data?.thread) {
    return { title: "AI闘技場 | KabeHub" };
  }

  const meta = data.thread.metadata;
  const ai1Label = meta?.ai1Provider
    ? { claude: "Claude", gemini: "Gemini", openai: "ChatGPT" }[meta.ai1Provider as string] ?? "AI1"
    : "AI1";
  const ai2Label = meta?.ai2Provider
    ? { claude: "Claude", gemini: "Gemini", openai: "ChatGPT" }[meta.ai2Provider as string] ?? "AI2"
    : "AI2";
  const topic = meta?.topic ?? data.thread.title ?? "AI対決";
  const msgCount = data.messages?.length ?? 0;

  const title = `【AI闘技場】${ai1Label} vs ${ai2Label} | KabeHub`;
  const description = `お題：${topic}（${msgCount}件の発言）`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      siteName: "KabeHub",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

// ── ページ ────────────────────────────────────────────────────────

export default async function ArenaTokenPage({
  params,
}: {
  params: { token: string };
}) {
  const data = await fetchArenaData(params.token);

  if (!data?.thread) {
    notFound();
  }

  return <ArenaViewPage thread={data.thread} messages={data.messages ?? []} />;
}
