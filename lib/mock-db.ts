import { Thread, Message } from "@/types";

// In-memory store — swap this module for Supabase calls when ready.
let threads: Thread[] = [
  {
    id: "thread-demo-1",
    title: "小説『深海の鏡』第三章の構成",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: "thread-demo-2",
    title: "量子コンピュータの論理シミュレーション検討",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "thread-demo-3",
    title: "キャラクター「宮本澪」の動機設計",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
];

let messages: Message[] = [
  {
    id: "msg-1",
    thread_id: "thread-demo-1",
    role: "user",
    content:
      "第三章では主人公が初めて深海施設に到着するシーンを書きたい。読者に閉塞感と神秘感を同時に感じさせるにはどうすればいい？",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: "msg-2",
    thread_id: "thread-demo-1",
    role: "assistant",
    content: `## 閉塞感と神秘感の共存：技法の提案

二つの感覚は一見矛盾しますが、**感覚の階層化**によって両立できます。

### 1. 五感の対比構造
- **閉塞感** → 金属の軋み音、肺を押し潰す水圧、狭い通路の壁が迫る感触
- **神秘感** → 舷窓の外に揺れる生物発光、聞こえるはずのない低周波の振動

### 2. 情報の「意図的な欠落」
全てを描写しない。主人公が見えないもの・理解できないものを際立たせることで、読者の想像力が神秘を補完します。

\`\`\`
例：長い廊下の突き当たりに、ドアがひとつあった。
   番号も名札もない。ただ、そこだけ壁の色が、
   わずかに違った。
\`\`\`

### 3. 時間感覚の歪曲
深海では昼夜がない。主人公の体内時計が狂い始める描写を早めに入れることで、「日常の論理が通用しない場所」であることを示せます。

どのシーンから着手しますか？`,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2 + 30000).toISOString(),
  },
];

// ── Thread CRUD ──────────────────────────────────────────────
export function getThreads(): Thread[] {
  return [...threads].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function getThread(id: string): Thread | undefined {
  return threads.find((t) => t.id === id);
}

export function createThread(id: string, firstMessage: string): Thread {
  const title = firstMessage.slice(0, 20) + (firstMessage.length > 20 ? "…" : "");
  const thread: Thread = {
    id,
    title,
    created_at: new Date().toISOString(),
  };
  threads = [thread, ...threads];
  return thread;
}

export function deleteThread(id: string): void {
  threads = threads.filter((t) => t.id !== id);
  messages = messages.filter((m) => m.thread_id !== id);
}

// ── Message CRUD ─────────────────────────────────────────────
export function getMessages(threadId: string): Message[] {
  return messages
    .filter((m) => m.thread_id === threadId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function addMessage(message: Message): Message {
  messages = [...messages, message];
  return message;
}
