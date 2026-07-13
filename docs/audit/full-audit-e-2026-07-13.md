# KabeHub 全体監査 E — ハードコード値の残存一覧

- 監査日: 2026-07-13（Asia/Tokyo）
- 対象: KabeHub リポジトリの追跡ファイル 174件（`node_modules`・`.next`・`.git` は対象外）
- 変更方針: コード・テスト・設定・既存文書は変更せず、本レポートだけを新規作成
- 判定基準: 実ファイルの文字列リテラルまたは route 内で挙動を決める数値を確認できた場合のみ記載。各引用は1〜3行。

## サマリ

| 区分 | 指摘件数 | 検出規模 | 高 | 中 | 低 |
|---|---:|---:|---:|---:|---:|
| アプリケーションコード内のモデルID直書き | 9 | 9ファイル・47リテラル | 0 | 9 | 0 |
| route 内の閾値・limit・上限等 | 21 | 19ファイル・51行 | 0 | 21 | 0 |
| `scripts/*.test.cjs` 内の参考情報 | 4 | 4ファイル・110リテラル | 0 | 0 | 4 |
| **合計** | **34** | — | **0** | **30** | **4** |

補足:

- モデルIDは大文字小文字を区別せず `gpt-`・`claude-`・`gemini-`・`text-embedding-` を含む構文木上の文字列リテラルを抽出した。`x-gemini-api-key` 等のheader名、表示ラベル、コメント、README等の説明文はモデルIDではないため除外した。
- 数値は、API出力budget、検索件数・閾値、ページング、履歴件数、入力長、timeout・TTL等、route の挙動を決める値を対象とした。HTTP status、配列添字、件数初期値の0、日時・ms/秒等の単位換算、DB error code、構造上のpair arityは除外した。
- `lib/modelRegistry.ts`・`lib/internalModels.ts`・`lib/lore/types.ts` 内の定義・export・型定義は指定どおり指摘対象外とした。ただし、別ファイルの直書きとの比較根拠として定義箇所を確認した。

## 指摘 — アプリケーションコード内のモデルID

### [E-01] 公開モデルUnionがregistryとは別に文字列Unionとして直書きされている
- 場所: `types/index.ts:28`、`types/index.ts:29`、`types/index.ts:30`、`types/index.ts:31`、`types/index.ts:32`、`types/index.ts:33`、`types/index.ts:34`、`types/index.ts:35`、`types/index.ts:36`、`types/index.ts:37`、`types/index.ts:38`
- 事実: `types/index.ts` はregistry由来型をimportして相互差分を型検査している一方、Claude 8件、Gemini 4件、OpenAI 5件、対象prefixを持つ画像モデル2件を文字列Unionにも記述している。

`types/index.ts:28`:

```ts
  | "claude-fable-5"
  | "claude-opus-4-8"
  | "claude-opus-4-7"
```

`types/index.ts:31`:

```ts
  | "claude-opus-4-6"
  | "claude-sonnet-5"
  | "claude-sonnet-4-5"
```

`types/index.ts:34`:

```ts
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";
```

`types/index.ts:36`:

```ts
export type GeminiModel = "gemini-2.5-flash" | "gemini-2.5-pro" | "gemini-3.5-flash" | "gemini-3.1-flash-lite";
```

`types/index.ts:37`:

```ts
export type OpenAIModel = "gpt-4o" | "gpt-5.4-mini" | "gpt-5.4" | "gpt-5.5" | "gpt-5.5-pro";
```

`types/index.ts:38`:

```ts
export type ImageGenModel = "gpt-image-2" | "gemini-2.5-flash-image" | "ideogram-v3" | "black-forest-labs/flux.2-pro";
```

- 分類: ハードコード
- 推奨対応: registry由来型へ一本化できるか、現在の相互差分assertを残す必要性と合わせて検討する。
- 優先度: 中

### [E-02] Arenaのprovider呼び出し既定引数に3モデルIDが残っている
- 場所: `app/api/arena/route.ts:30`、`app/api/arena/route.ts:47`、`app/api/arena/route.ts:63`
- 事実: 同routeは `getDefaultModel` で `DEFAULT_MODELS` を構築しているが、3つのprovider関数の既定引数にも個別のモデルIDがある。

`app/api/arena/route.ts:30`:

```ts
async function callClaude(apiKey: string, messages: ChatMessage[], systemPrompt?: string, modelId: ClaudeModel = "claude-sonnet-4-5"): Promise<string> {
```

`app/api/arena/route.ts:47`:

```ts
async function callGemini(apiKey: string, messages: ChatMessage[], systemPrompt?: string, modelId: GeminiModel = "gemini-2.5-flash"): Promise<string> {
```

`app/api/arena/route.ts:63`:

```ts
async function callOpenAI(apiKey: string, messages: ChatMessage[], systemPrompt?: string, modelId: OpenAIModel = "gpt-4o"): Promise<string> {
```

- 分類: ハードコード
- 推奨対応: provider関数のfallbackもregistryのsurface別defaultから取得する案を検討する。
- 優先度: 中

### [E-03] Chatの既定引数とモデル固有分岐に5モデルIDが残っている
- 場所: `app/api/chat/route.ts:141`、`app/api/chat/route.ts:275`、`app/api/chat/route.ts:349`、`app/api/chat/route.ts:377`、`app/api/chat/route.ts:406`
- 事実: 3provider関数の既定引数に加え、Responses API分岐とtoken parameter分岐でモデルIDを直接比較している。

`app/api/chat/route.ts:141`:

```ts
  modelId: ClaudeModel = "claude-sonnet-4-5",
```

`app/api/chat/route.ts:275`:

```ts
  modelId: GeminiModel = "gemini-2.5-flash",
```

`app/api/chat/route.ts:349`:

```ts
  modelId: OpenAIModel = "gpt-5.4-mini",
```

`app/api/chat/route.ts:377`:

```ts
        if (modelId === "gpt-5.5-pro") {
```

`app/api/chat/route.ts:406`:

```ts
          body: JSON.stringify({ model: modelId, ...(modelId === "gpt-4o" ? { max_tokens: 8192 } : { max_completion_tokens: 8192 }), stream: true, stream_options: { include_usage: true }, messages: msgs }),
```

- 分類: ハードコード
- 推奨対応: endpoint/token-parameter能力をregistry metadataまたは専用capability関数として表現できるか検討する。
- 優先度: 中

### [E-04] 設定抽出routeが3providerのモデルを個別に固定している
- 場所: `app/api/extract-settings/route.ts:113`、`app/api/extract-settings/route.ts:129`、`app/api/extract-settings/route.ts:155`
- 事実: Claude/OpenAIはrequest body、Geminiはendpoint URLの中に固定モデルIDがある。

`app/api/extract-settings/route.ts:113`:

```ts
          model: 'claude-sonnet-4-6',
```

`app/api/extract-settings/route.ts:129`:

```ts
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
```

`app/api/extract-settings/route.ts:155`:

```ts
          model: 'gpt-4o',
```

- 分類: ハードコード
- 推奨対応: この機能専用モデルをinternal model定義へ寄せるか、provider別方針を明示した共通定義にする案を検討する。
- 優先度: 中

### [E-05] 画像生成routeのregistry fallback後にモデルIDリテラルが残っている
- 場所: `app/api/image-gen/route.ts:19`、`app/api/image-gen/route.ts:78`
- 事実: `getDefaultImageModel` がnullの場合の最終fallbackとしてGemini/OpenAIのモデルIDを直接記述している。

`app/api/image-gen/route.ts:19`:

```ts
  const geminiModel = modelId ?? getDefaultImageModel('gemini') ?? 'gemini-2.5-flash-image'
```

`app/api/image-gen/route.ts:78`:

```ts
      model: getDefaultImageModel('openai') ?? 'gpt-image-2',
```

- 分類: ハードコード
- 推奨対応: registry lookup失敗時の扱いをerrorにするか、fallback定義をregistry側へ一本化するか検討する。
- 優先度: 中

### [E-06] 画像生成専用ページにモデル一覧・fallback・初期値が残っている
- 場所: `app/image/page.tsx:30`、`app/image/page.tsx:31`、`app/image/page.tsx:32`、`app/image/page.tsx:38`、`app/image/page.tsx:47`
- 事実: Gemini画像モデル3件の配列、OpenAI fallback、Gemini state初期値をページ内で直接定義している。

`app/image/page.tsx:30`:

```ts
  { id: 'gemini-2.5-flash-image', label: '2.5 Flash Image', badge: '既存' },
  { id: 'gemini-3.1-flash-image', label: '3.1 Flash Image', badge: '新' },
  { id: 'gemini-3-pro-image',     label: '3 Pro Image',     badge: '高性能' },
```

`app/image/page.tsx:38`:

```ts
    case 'openai':     return 'gpt-image-2'
```

`app/image/page.tsx:47`:

```ts
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash-image')
```

- 分類: ハードコード
- 推奨対応: 画像モデル一覧・表示可否・初期値をregistry selectorから取得する案を検討する。
- 優先度: 中

### [E-07] Novel Checkページがモデル型・初期値・選択肢をページ内に固定している
- 場所: `app/novel-check/page.tsx:41`、`app/novel-check/page.tsx:307`
- 事実: 同じ2つのGeminiモデルIDがstateの型/初期値と描画用配列に現れる。

`app/novel-check/page.tsx:41`:

```ts
  const [selectedModel, setSelectedModel] = useState<"gemini-2.5-flash" | "gemini-2.5-pro">("gemini-2.5-flash");
```

`app/novel-check/page.tsx:307`:

```tsx
          {(["gemini-2.5-flash", "gemini-2.5-pro"] as const).map((m) => (
```

- 分類: ハードコード
- 推奨対応: Novel Checkで許可するモデル集合とdefaultをregistry由来の機能別selectorにする案を検討する。
- 優先度: 中

### [E-08] メインページの画像生成用model mapに2モデルIDが残っている
- 場所: `app/page.tsx:792`、`app/page.tsx:793`
- 事実: providerから送信model IDを求めるローカルmapにGemini/OpenAIのIDを直接記述している。

`app/page.tsx:792`:

```ts
      gemini: 'gemini-2.5-flash-image',
      openai: 'gpt-image-2',
```

- 分類: ハードコード
- 推奨対応: `getDefaultImageModel` 相当をclient-safeに参照するか、registryからmapを構築する案を検討する。
- 優先度: 中

### [E-09] Settingsのモデル選択stateに3つの初期モデルIDが残っている
- 場所: `app/settings/page.tsx:82`、`app/settings/page.tsx:83`、`app/settings/page.tsx:84`
- 事実: Claude/Gemini/OpenAIのstate初期値がページ内の文字列で初期化されている。

`app/settings/page.tsx:82`:

```ts
  const [claudeModel, setClaudeModel] = useState<ModelId>('claude-sonnet-4-5')
  const [geminiModel, setGeminiModel] = useState<ModelId>('gemini-2.5-flash')
  const [openaiModel, setOpenaiModel] = useState<ModelId>('gpt-5.4-mini')
```

- 分類: ハードコード
- 推奨対応: 各stateの初期値をregistryのUI defaultから取得する案を検討する。
- 優先度: 中

## 指摘 — route 内の閾値・limit・上限等

### [E-10] Album routeにpage sizeと署名URL TTLがローカル固定されている
- 場所: `app/api/album/route.ts:15`、`app/api/album/route.ts:57`
- 事実: 1ページ20件、署名URL有効期間3600秒をroute内で決めている。

`app/api/album/route.ts:15`:

```ts
  const PAGE_SIZE = 20;
```

`app/api/album/route.ts:57`:

```ts
      .createSignedUrls(storagePaths, 3600);
```

- 分類: ハードコード
- 推奨対応: pagination/TTLの運用値を名前付き共有定数または設定へ移す案を検討する。
- 優先度: 中

### [E-11] Arena routeにtoken・title・historyの上限が固定されている
- 場所: `app/api/arena/route.ts:33`、`app/api/arena/route.ts:206`、`app/api/arena/route.ts:234`
- 事実: Claude出力8192 tokens、title 30文字、APIへ渡す履歴10件をroute内の数値で決めている。

`app/api/arena/route.ts:33`:

```ts
    max_tokens: 8192,
```

`app/api/arena/route.ts:206`:

```ts
      const title = `【AI闘技場】${(topic ?? "").slice(0, 30)}`;
```

`app/api/arena/route.ts:234`:

```ts
  const rawHistory = historyWithIntervention.slice(-10);
```

- 分類: ハードコード
- 推奨対応: Arenaのprovider budgetと表示/履歴上限を用途別の名前付き定数へまとめる案を検討する。
- 優先度: 中

### [E-12] Chat routeにprovider別出力・thinking budgetが固定されている
- 場所: `app/api/chat/route.ts:181`、`app/api/chat/route.ts:186`、`app/api/chat/route.ts:187`、`app/api/chat/route.ts:382`、`app/api/chat/route.ts:406`
- 事実: Claude通常8192、thinking budget 10000/出力16000、OpenAI出力8192が各request構築箇所に記述されている。

`app/api/chat/route.ts:181`:

```ts
    max_tokens: 8192,
```

`app/api/chat/route.ts:186`:

```ts
    body.thinking = { type: "enabled", budget_tokens: 10000 };
    body.max_tokens = 16000;
```

`app/api/chat/route.ts:382`:

```ts
            body: JSON.stringify({ model: modelId, input, max_output_tokens: 8192 }),
```

`app/api/chat/route.ts:406`:

```ts
          body: JSON.stringify({ model: modelId, ...(modelId === "gpt-4o" ? { max_tokens: 8192 } : { max_completion_tokens: 8192 }), stream: true, stream_options: { include_usage: true }, messages: msgs }),
```

- 分類: ハードコード
- 推奨対応: provider/model capabilityとtoken budgetを単一の設定面から取得する案を検討する。
- 優先度: 中

### [E-13] Chat routeにtitle・単一行query・参加者判定の件数値が残っている
- 場所: `app/api/chat/route.ts:617`、`app/api/chat/route.ts:805`、`app/api/chat/route.ts:817`、`app/api/chat/route.ts:881`、`app/api/chat/route.ts:1028`
- 事実: title 20文字、3つのDB queryの1件上限、複数参加者noteの開始件数2をroute内で決めている。

`app/api/chat/route.ts:617`:

```ts
      const title = userContent.slice(0, 20) + (userContent.length > 20 ? "…" : "");
```

`app/api/chat/route.ts:805`:

```ts
          .limit(1)
```

`app/api/chat/route.ts:817`:

```ts
          .limit(1)
```

`app/api/chat/route.ts:881`:

```ts
        .limit(1)
```

`app/api/chat/route.ts:1028`:

```ts
  const participantNote = participants.length >= 2
```

- 分類: ハードコード
- 推奨対応: UI文字数とquery/participant件数を意図が分かる名前付き定数にする案を検討する。
- 優先度: 中

### [E-14] Chat routeのLore検索件数・timeout・match thresholdが呼び出しごとに固定されている
- 場所: `app/api/chat/route.ts:948`、`app/api/chat/route.ts:963`、`app/api/chat/route.ts:971`、`app/api/chat/route.ts:1207`、`app/api/chat/route.ts:1209`、`app/api/chat/route.ts:1210`
- 事実: 結合検索timeout 3000ms、検索上位3/5/4件、別RAG検索timeout 3000msと一致閾値0.3をrouteが直接渡している。

`app/api/chat/route.ts:948`:

```ts
    const combinedTimer = setTimeout(() => combinedController.abort(), 3_000);
```

`app/api/chat/route.ts:963`:

```ts
                topK: 3,
```

`app/api/chat/route.ts:971`:

```ts
                topK: 5,
```

`app/api/chat/route.ts:1207`:

```ts
        topK: 4,
```

`app/api/chat/route.ts:1209`:

```ts
        timeoutMs: 3_000,
        matchThreshold: 0.3,
```

- 分類: ハードコード
- 推奨対応: Lore/RAG用途別の検索policyを名前付き設定として共通化する案を検討する。
- 優先度: 中

### [E-15] Chat routeのtool loop・context window・蓄積文字数に上限値が固定されている
- 場所: `app/api/chat/route.ts:1182`、`app/api/chat/route.ts:1183`、`app/api/chat/route.ts:1233`、`app/api/chat/route.ts:1234`、`app/api/chat/route.ts:1235`、`app/api/chat/route.ts:1362`
- 事実: GitHub tool call/read上限、context trimmingのtoken/turn設定、stream蓄積文字数をroute内で決めている。

`app/api/chat/route.ts:1182`:

```ts
        maxToolCalls: 10,
        maxReadFiles: 8,
```

`app/api/chat/route.ts:1233`:

```ts
      maxInputTokens: 80_000,
      anchorTurns: 6,
      responseReserveTokens: 2_000,
```

`app/api/chat/route.ts:1362`:

```ts
  const MAX_ACCUMULATED_CHARS = 200_000;
```

- 分類: ハードコード
- 推奨対応: tool/search/context/outputの保護値を用途別configとして確認可能にする案を検討する。
- 優先度: 中

### [E-16] 設定抽出routeのClaude出力上限が固定されている
- 場所: `app/api/extract-settings/route.ts:114`
- 事実: Claude requestの最大出力tokenを4096に固定している。

`app/api/extract-settings/route.ts:114`:

```ts
          max_tokens: 4096,
```

- 分類: ハードコード
- 推奨対応: 設定抽出専用モデルと合わせて出力budgetを名前付き定数へまとめる案を検討する。
- 優先度: 中

### [E-17] Novel Check routeにtoken見積係数と出力上限が固定されている
- 場所: `app/api/novel-check/route.ts:43`、`app/api/novel-check/route.ts:64`
- 事実: 文字数からtokenを見積もる係数1.2とGemini最大出力8192をroute内で決めている。

`app/api/novel-check/route.ts:43`:

```ts
  const estimatedTokens = Math.ceil(totalChars * 1.2);
```

`app/api/novel-check/route.ts:64`:

```ts
    generationConfig: { maxOutputTokens: 8192 },
```

- 分類: ハードコード
- 推奨対応: token見積規則とprovider出力budgetを機能設定として名前付けする案を検討する。
- 優先度: 中

### [E-18] Folder Settings routeにref長とpinned file件数の上限が固定されている
- 場所: `app/api/folder-settings/route.ts:80`、`app/api/folder-settings/route.ts:94`
- 事実: `github_ref` は255文字超を拒否し、`pinned_github_files` は先頭5件に切り詰める。

`app/api/folder-settings/route.ts:80`:

```ts
    if (typeof github_ref !== 'string' || github_ref.length > 255) {
```

`app/api/folder-settings/route.ts:94`:

```ts
          ? { pinned_github_files: (pinned_github_files as string[]).slice(0, 5) }
```

- 分類: ハードコード
- 推奨対応: client/serverで共有できるfolder settings validation定数へ寄せる案を検討する。
- 優先度: 中

### [E-19] Report routeにreason文字数上限が固定されている
- 場所: `app/api/reports/route.ts:38`
- 事実: 通報理由が1000文字を超える場合に拒否する数値をroute内で直接比較している。

`app/api/reports/route.ts:38`:

```ts
  if (reason.length > 1000) {
```

- 分類: ハードコード
- 推奨対応: 通報入力schemaと共有できる名前付き上限定数にする案を検討する。
- 優先度: 中

### [E-20] Profile routeのhandle長制約が正規表現内に固定されている
- 場所: `app/api/profile/route.ts:43`
- 事実: 先頭1文字に続く文字数を2〜19とすることで、handle全体を3〜20文字に制限している。

`app/api/profile/route.ts:43`:

```ts
  const formatOk = /^[a-z][a-z0-9_-]{2,19}$/.test(normalized ?? '')
```

- 分類: ハードコード
- 推奨対応: handleのmin/maxと正規表現・UI表示を同じvalidation定義から生成する案を検討する。
- 優先度: 中

### [E-21] MCP routesにRetry-After下限とthread取得上限が固定されている
- 場所: `app/api/mcp/threads/route.ts:9`、`app/api/mcp/threads/route.ts:42`、`app/api/mcp/threads/[id]/messages/route.ts:9`
- 事実: 2routeがRetry-Afterを最低1秒に丸め、thread一覧routeは100件でqueryを打ち切る。

`app/api/mcp/threads/route.ts:9`:

```ts
  const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
```

`app/api/mcp/threads/route.ts:42`:

```ts
    .limit(100)
```

`app/api/mcp/threads/[id]/messages/route.ts:9`:

```ts
  const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
```

- 分類: ハードコード
- 推奨対応: MCP response/query policyとしてrate-limit helperと一覧上限を共有定数化する案を検討する。
- 優先度: 中

### [E-22] Explore routeのページ件数が固定されている
- 場所: `app/api/explore/route.ts:59`
- 事実: popular/trendingと通常検索の双方が、同じローカル変数`limit = 20`を使う。

`app/api/explore/route.ts:59`:

```ts
  const limit = 20;
```

- 分類: ハードコード
- 推奨対応: Explore UIと共有可能なpagination定数として切り出す案を検討する。
- 優先度: 中

### [E-23] Lore consolidation候補routeにthresholdとlimitのdefault/boundsが固定されている
- 場所: `app/api/lore/consolidate/candidates/route.ts:25`、`app/api/lore/consolidate/candidates/route.ts:26`
- 事実: similarity thresholdはdefault 0.9・範囲0.8〜0.98、limitはdefault 10・範囲1〜30としてroute内でclampする。

`app/api/lore/consolidate/candidates/route.ts:25`:

```ts
  const threshold = clamp(Number.isFinite(rawThreshold) ? rawThreshold : 0.9, 0.8, 0.98);
  const limit = clamp(Number.isFinite(rawLimit) ? rawLimit : 10, 1, 30);
```

- 分類: ハードコード
- 推奨対応: consolidation用default/boundsを`lib/lore/types.ts`相当のserver-safe定数へまとめる案を検討する。
- 優先度: 中

### [E-24] Dreaming routeが`DREAMING_DEFAULTS`と同じdefaultを再度直書きしている
- 場所: `app/api/lore/dreaming-batch/route.ts:28`、`app/api/lore/dreaming-batch/route.ts:29`
- 事実: `lib/lore/types.ts:23` の `DREAMING_DEFAULTS = { limit: 5, threshold: 0.92 }` と同じdefault値をimportせず、route内fallbackに記述する。併せてlimit範囲1〜5、threshold範囲0.80〜0.98も同じ行で固定する。

`app/api/lore/dreaming-batch/route.ts:28`:

```ts
  const limit = clamp(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 5, 1, 5);
  const threshold = clamp(Number.isFinite(rawThreshold) ? rawThreshold : 0.92, 0.80, 0.98);
```

比較した `lib/lore/types.ts:23`:

```ts
export const DREAMING_DEFAULTS = { limit: 5, threshold: 0.92 } as const;
```

- 分類: ハードコード
- 推奨対応: API fallbackとUI request defaultを同じserver-safe定数から参照する案を検討する。
- 優先度: 中

### [E-25] Lore batch-train routeにrequest limitのdefault/boundsが固定されている
- 場所: `app/api/lore/batch-train/route.ts:27`
- 事実: request未指定時20、最小1、最大100としてroute内でclampする。`lib/lore/types.ts:29-32` はUI送信値100とserver default 20を別概念と明記しているため、本指摘は同一defaultの重複ではなくroute policyの直書きとして扱う。

`app/api/lore/batch-train/route.ts:27`:

```ts
  const limit = clamp(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 20, 1, 100);
```

- 分類: ハードコード
- 推奨対応: server側default/min/maxをUI request値とは区別した名前付き定数として定義する案を検討する。
- 優先度: 中

### [E-26] Dreaming history routeに取得limitのdefault/boundsが固定されている
- 場所: `app/api/lore/dreaming-batch/history/route.ts:24`
- 事実: history取得件数を未指定時20、範囲1〜20としてroute内でclampする。

`app/api/lore/dreaming-batch/history/route.ts:24`:

```ts
  const limit = clamp(Number.isFinite(rawLimit) ? rawLimit : 20, 1, 20);
```

- 分類: ハードコード
- 推奨対応: Dreaming historyのpagination policyを名前付き定数へ移す案を検討する。
- 優先度: 中

### [E-27] Lore embed routeに逐次処理waitが固定されている
- 場所: `app/api/lore/embed/route.ts:47`
- 事実: chunkごとのembedding/insert後に200ms待機する。

`app/api/lore/embed/route.ts:47`:

```ts
    await new Promise(resolve => setTimeout(resolve, 200));
```

- 分類: ハードコード
- 推奨対応: provider rate policyとして待機時間を名前付き定数または共通処理へ移す案を検討する。
- 優先度: 中

### [E-28] Lore bulk archive routeに一括件数上限が固定されている
- 場所: `app/api/lore/bulk-archive/route.ts:21`
- 事実: request内のIDが50件を超えると拒否する。

`app/api/lore/bulk-archive/route.ts:21`:

```ts
  if (ids.length > 50) {
```

- 分類: ハードコード
- 推奨対応: bulk operationの上限をclient/server共有定数へ移す案を検討する。
- 優先度: 中

### [E-29] Image generation routeに生成枚数・画像サイズ・image weightが固定されている
- 場所: `app/api/image-gen/route.ts:80`、`app/api/image-gen/route.ts:81`、`app/api/image-gen/route.ts:116`
- 事実: OpenAI生成は1枚・1024x1024、Ideogram remixのimage weightは文字列`90`としてrequestに設定する。

`app/api/image-gen/route.ts:80`:

```ts
      n: 1,
      size: '1024x1024',
```

`app/api/image-gen/route.ts:116`:

```ts
    formData.append('image_weight', '90')
```

- 分類: ハードコード
- 推奨対応: provider別画像生成parameterをモデル設定または用途別configとして集約する案を検討する。
- 優先度: 中

### [E-30] Thread tag routeに20文字上限が2箇所固定されている
- 場所: `app/api/threads/[id]/tags/route.ts:36`、`app/api/threads/[id]/tags/route.ts:38`
- 事実: 入力を先に20文字で切り詰め、その後に20文字超を検査する2箇所に同じ値がある。

`app/api/threads/[id]/tags/route.ts:36`:

```ts
  const cleanName = rawName.replace(/^#+/, "").replace(/[\s\u3000]/g, "").slice(0, 20);
```

`app/api/threads/[id]/tags/route.ts:38`:

```ts
  if (cleanName.length > 20) return NextResponse.json({ error: "タグ名は20文字以内にしてください" }, { status: 400 });
```

- 分類: ハードコード
- 推奨対応: tag validationの上限とtruncate/reject方針を1つの定義で表現する案を検討する。
- 優先度: 中

## 参考情報 — `scripts/*.test.cjs` 内のモデルID

テスト内の期待値・境界値・invalid/legacy IDはテストの性質上ハードコードが自然であるため、以下はすべて参考情報かつ優先度「低」とする。行の取りこぼしを避けるため、構文木で検出した全該当行を引用する。

### [E-31] `loadModel.test.cjs` にモデルIDリテラル45件がある（参考）
- 場所: `scripts/loadModel.test.cjs:98`、`scripts/loadModel.test.cjs:102`、`scripts/loadModel.test.cjs:103`、`scripts/loadModel.test.cjs:106`、`scripts/loadModel.test.cjs:107`、`scripts/loadModel.test.cjs:108`、`scripts/loadModel.test.cjs:113`、`scripts/loadModel.test.cjs:114`、`scripts/loadModel.test.cjs:115`、`scripts/loadModel.test.cjs:121`、`scripts/loadModel.test.cjs:123`、`scripts/loadModel.test.cjs:125`、`scripts/loadModel.test.cjs:127`、`scripts/loadModel.test.cjs:144`、`scripts/loadModel.test.cjs:145`、`scripts/loadModel.test.cjs:146`、`scripts/loadModel.test.cjs:147`、`scripts/loadModel.test.cjs:148`、`scripts/loadModel.test.cjs:149`、`scripts/loadModel.test.cjs:150`、`scripts/loadModel.test.cjs:151`、`scripts/loadModel.test.cjs:153`、`scripts/loadModel.test.cjs:154`、`scripts/loadModel.test.cjs:156`、`scripts/loadModel.test.cjs:157`、`scripts/loadModel.test.cjs:168`、`scripts/loadModel.test.cjs:170`、`scripts/loadModel.test.cjs:171`、`scripts/loadModel.test.cjs:172`、`scripts/loadModel.test.cjs:173`、`scripts/loadModel.test.cjs:174`、`scripts/loadModel.test.cjs:176`、`scripts/loadModel.test.cjs:177`、`scripts/loadModel.test.cjs:178`、`scripts/loadModel.test.cjs:179`、`scripts/loadModel.test.cjs:180`
- 事実: localStorage、default、registry一覧、thinking supportの期待値として45個の対象モデルID文字列を直接使う。

`scripts/loadModel.test.cjs:98`:

```js
global.localStorage.setItem(MODEL_CONFIG.claude.lsKey, "claude-old-model");
```

`scripts/loadModel.test.cjs:102`:

```js
global.localStorage.setItem(MODEL_CONFIG.claude.lsKey, "claude-opus-4-8");
assert.equal(loadModel("claude"), "claude-opus-4-8");
```

`scripts/loadModel.test.cjs:106`:

```js
global.localStorage.setItem(MODEL_CONFIG.gemini.lsKey, "gemini-3.5-flash");
assert.equal(loadModel("gemini"), "gemini-3.5-flash");
assert.equal(loadModel("claude"), "claude-opus-4-8"); // 他providerの変更に影響されない
```

`scripts/loadModel.test.cjs:113`:

```js
saveModel("openai", "gpt-5.5-pro");
assert.equal(global.localStorage.store[MODEL_CONFIG.openai.lsKey], "gpt-5.5-pro");
assert.equal(loadModel("openai"), "gpt-5.5-pro");
```

`scripts/loadModel.test.cjs:121`:

```js
assert.equal(MODEL_CONFIG.claude.defaultModel, "claude-sonnet-4-5");
```

`scripts/loadModel.test.cjs:123`:

```js
assert.equal(MODEL_CONFIG.gemini.defaultModel, "gemini-2.5-flash");
```

`scripts/loadModel.test.cjs:125`:

```js
assert.equal(MODEL_CONFIG.openai.defaultModel, "gpt-5.4-mini");
```

`scripts/loadModel.test.cjs:127`:

```js
assert.equal(MODEL_CONFIG.image_gen.defaultModel, "gpt-image-2");
```

`scripts/loadModel.test.cjs:144`:

```js
    "claude-fable-5",
    "claude-sonnet-5",
    "claude-opus-4-8",
```

`scripts/loadModel.test.cjs:147`:

```js
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-5",
```

`scripts/loadModel.test.cjs:150`:

```js
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
```

`scripts/loadModel.test.cjs:153`:

```js
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3.5-flash", "gemini-3.1-flash-lite"],
  openai: ["gpt-4o", "gpt-5.4-mini", "gpt-5.4", "gpt-5.5", "gpt-5.5-pro"],
```

`scripts/loadModel.test.cjs:156`:

```js
    "gpt-image-2",
    "gemini-2.5-flash-image",
```

`scripts/loadModel.test.cjs:168`:

```js
  ["claude-fable-5", "claude-haiku-4-5-20251001", "claude-sonnet-5"].sort()
```

`scripts/loadModel.test.cjs:170`:

```js
assert.equal(isThinkingUnsupported("claude-haiku-4-5-20251001"), true);
assert.equal(isThinkingUnsupported("claude-fable-5"), true);
assert.equal(isThinkingUnsupported("claude-sonnet-5"), true);
```

`scripts/loadModel.test.cjs:173`:

```js
assert.equal(isThinkingUnsupported("claude-opus-4-8"), false);
assert.equal(isThinkingUnsupported("claude-sonnet-4-5"), false);
```

`scripts/loadModel.test.cjs:176`:

```js
assert.equal(canUseDeepThinking("claude", "claude-opus-4-8"), true);
assert.equal(canUseDeepThinking("claude", "claude-sonnet-5"), false); // Thinking非対応3モデルの一つ
assert.equal(canUseDeepThinking("claude", "claude-fable-5"), false);
```

`scripts/loadModel.test.cjs:179`:

```js
assert.equal(canUseDeepThinking("claude", "claude-haiku-4-5-20251001"), false);
assert.equal(canUseDeepThinking("gemini", "claude-opus-4-8"), false); // provider不一致（claude以外は常にfalse）
```

- 分類: 情報のみ
- 推奨対応: 現状維持。registry契約のsnapshot/境界テストとして意図的かだけレビュー時に確認する。
- 優先度: 低

### [E-32] `lore-openai.test.cjs` に内部モデルIDリテラル2件がある（参考）
- 場所: `scripts/lore-openai.test.cjs:52`、`scripts/lore-openai.test.cjs:106`
- 事実: embedding requestとLore用chat requestが内部モデル定数の値を送ることを期待値で検証する。

`scripts/lore-openai.test.cjs:52`:

```js
    assert.equal(JSON.parse(call[1].body).model, "text-embedding-3-small");
```

`scripts/lore-openai.test.cjs:106`:

```js
    assert.equal(body.model, "gpt-4o-mini");
```

- 分類: 情報のみ
- 推奨対応: 現状維持。内部モデル変更時に意図的に更新される契約テストとして扱う。
- 優先度: 低

### [E-33] `modelRegistry.test.cjs` にモデルIDリテラル39件がある（参考）
- 場所: `scripts/modelRegistry.test.cjs:30`、`scripts/modelRegistry.test.cjs:31`、`scripts/modelRegistry.test.cjs:32`、`scripts/modelRegistry.test.cjs:33`、`scripts/modelRegistry.test.cjs:34`、`scripts/modelRegistry.test.cjs:35`、`scripts/modelRegistry.test.cjs:36`、`scripts/modelRegistry.test.cjs:37`、`scripts/modelRegistry.test.cjs:39`、`scripts/modelRegistry.test.cjs:45`、`scripts/modelRegistry.test.cjs:46`、`scripts/modelRegistry.test.cjs:47`、`scripts/modelRegistry.test.cjs:48`、`scripts/modelRegistry.test.cjs:50`、`scripts/modelRegistry.test.cjs:56`、`scripts/modelRegistry.test.cjs:57`、`scripts/modelRegistry.test.cjs:58`、`scripts/modelRegistry.test.cjs:59`、`scripts/modelRegistry.test.cjs:60`、`scripts/modelRegistry.test.cjs:62`、`scripts/modelRegistry.test.cjs:68`、`scripts/modelRegistry.test.cjs:69`、`scripts/modelRegistry.test.cjs:73`、`scripts/modelRegistry.test.cjs:81`、`scripts/modelRegistry.test.cjs:82`、`scripts/modelRegistry.test.cjs:83`、`scripts/modelRegistry.test.cjs:94`、`scripts/modelRegistry.test.cjs:116`、`scripts/modelRegistry.test.cjs:117`、`scripts/modelRegistry.test.cjs:118`、`scripts/modelRegistry.test.cjs:119`、`scripts/modelRegistry.test.cjs:120`、`scripts/modelRegistry.test.cjs:121`、`scripts/modelRegistry.test.cjs:122`
- 事実: legacy config構築、pricing prefix、日付切替、画像モデル非課金を検証する入力/期待値として39個のモデルIDを使う。`scripts/modelRegistry.test.cjs:56-60` の表示用 `label: "GPT-..."` 5件はモデルID件数には含めていない。

`scripts/modelRegistry.test.cjs:30`:

```js
      { id: "claude-fable-5", label: "Fable 5", badge: "最高精度" },
      { id: "claude-sonnet-5", label: "Sonnet 5", badge: "新標準" },
      { id: "claude-opus-4-8", label: "Opus 4.8", badge: "最高精度" },
```

`scripts/modelRegistry.test.cjs:33`:

```js
      { id: "claude-opus-4-7", label: "Opus 4.7", badge: "高精度" },
      { id: "claude-opus-4-6", label: "Opus 4.6", badge: "高精度" },
      { id: "claude-sonnet-4-5", label: "Sonnet 4.5", badge: "標準" },
```

`scripts/modelRegistry.test.cjs:36`:

```js
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6", badge: "高性能" },
      { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", badge: "軽量・爆速" },
```

`scripts/modelRegistry.test.cjs:39`:

```js
    defaultModel: "claude-sonnet-4-5",
```

`scripts/modelRegistry.test.cjs:45`:

```js
      { id: "gemini-2.5-flash", label: "2.5 Flash", badge: "標準" },
      { id: "gemini-2.5-pro", label: "2.5 Pro", badge: "高性能" },
      { id: "gemini-3.5-flash", label: "3.5 Flash", badge: "高性能" },
```

`scripts/modelRegistry.test.cjs:48`:

```js
      { id: "gemini-3.1-flash-lite", label: "3.1 Flash Lite", badge: "軽量・爆速" },
```

`scripts/modelRegistry.test.cjs:50`:

```js
    defaultModel: "gemini-2.5-flash",
```

`scripts/modelRegistry.test.cjs:56`:

```js
      { id: "gpt-4o", label: "GPT-4o", badge: "旧世代" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini", badge: "標準" },
      { id: "gpt-5.4", label: "GPT-5.4", badge: "高性能" },
```

`scripts/modelRegistry.test.cjs:59`:

```js
      { id: "gpt-5.5", label: "GPT-5.5", badge: "最高精度" },
      { id: "gpt-5.5-pro", label: "GPT-5.5 Pro", badge: "最上位" },
```

`scripts/modelRegistry.test.cjs:62`:

```js
    defaultModel: "gpt-5.4-mini",
```

`scripts/modelRegistry.test.cjs:68`:

```js
      { id: "gpt-image-2", label: "GPT Image 2", badge: "OpenAI" },
      { id: "gemini-2.5-flash-image", label: "Gemini Image", badge: "Google" },
```

`scripts/modelRegistry.test.cjs:73`:

```js
    defaultModel: "gpt-image-2",
```

`scripts/modelRegistry.test.cjs:81`:

```js
  "gpt-4o", "gemini-2.5-pro", "ideogram-v3", "black-forest-labs/flux.2-pro",
  "gpt-5.4-mini-preview", "gpt-5-mini-2026", "claude-haiku-3.5-turbo",
  "gemini/gemini-2.5-flash", "openai/GPT-4O-MINI", "OpenAI/gpt-4o-mini", "unknown-model-xyz",
```

`scripts/modelRegistry.test.cjs:94`:

```js
assert.equal(registry.getPricing("gemini-2.5-flash-image"), null);
```

`scripts/modelRegistry.test.cjs:116`:

```js
assert.deepEqual(registry.getPricing("claude-sonnet-5", intro), { inputPerMTok: 2, outputPerMTok: 10 });
assert.deepEqual(registry.getPricing("claude-sonnet-5", regular), { inputPerMTok: 3, outputPerMTok: 15 });
assert.deepEqual(registry.getPricing("claude-sonnet-5", later), { inputPerMTok: 3, outputPerMTok: 15 });
```

`scripts/modelRegistry.test.cjs:119`:

```js
assert.deepEqual(registry.getPricing("claude-sonnet-5-20260615", intro), { inputPerMTok: 2, outputPerMTok: 10 });
assert.deepEqual(registry.getPricing("claude-sonnet-5-20260615", regular), { inputPerMTok: 3, outputPerMTok: 15 });
assert.equal(registry.getPricing("gemini/gemini-2.5-flash-image"), null);
```

`scripts/modelRegistry.test.cjs:122`:

```js
assert.deepEqual(registry.getPricing("claude-opus-4-8"), { inputPerMTok: 5, outputPerMTok: 25 });
```

- 分類: 情報のみ
- 推奨対応: 現状維持。registryの公開契約と境界入力を固定するsnapshotとして扱う。
- 優先度: 低

### [E-34] `pricing.test.cjs` にモデルIDリテラル24件がある（参考）
- 場所: `scripts/pricing.test.cjs:49`、`scripts/pricing.test.cjs:50`、`scripts/pricing.test.cjs:58`、`scripts/pricing.test.cjs:60`、`scripts/pricing.test.cjs:62`、`scripts/pricing.test.cjs:64`、`scripts/pricing.test.cjs:65`、`scripts/pricing.test.cjs:68`、`scripts/pricing.test.cjs:69`、`scripts/pricing.test.cjs:74`、`scripts/pricing.test.cjs:75`、`scripts/pricing.test.cjs:76`、`scripts/pricing.test.cjs:78`、`scripts/pricing.test.cjs:84`、`scripts/pricing.test.cjs:96`、`scripts/pricing.test.cjs:97`、`scripts/pricing.test.cjs:104`、`scripts/pricing.test.cjs:105`、`scripts/pricing.test.cjs:106`、`scripts/pricing.test.cjs:107`、`scripts/pricing.test.cjs:112`、`scripts/pricing.test.cjs:113`、`scripts/pricing.test.cjs:114`、`scripts/pricing.test.cjs:119`
- 事実: exact/prefix/case/provider-prefix/date切替とcost計算の入力として24個のモデルIDを使う。

`scripts/pricing.test.cjs:49`:

```js
assert.deepEqual(getPricing("gpt-4o"), { inputPerMTok: 2.5, outputPerMTok: 10.0 });
assert.deepEqual(getPricing("gemini-2.5-pro"), { inputPerMTok: 1.25, outputPerMTok: 10.0 });
```

`scripts/pricing.test.cjs:58`:

```js
assert.deepEqual(getPricing("gpt-5.4-mini-preview"), { inputPerMTok: 0.75, outputPerMTok: 4.5 });
```

`scripts/pricing.test.cjs:60`:

```js
assert.deepEqual(getPricing("gpt-5-mini-2026"), { inputPerMTok: 0.25, outputPerMTok: 2.0 });
```

`scripts/pricing.test.cjs:62`:

```js
assert.deepEqual(getPricing("gpt-5.4-nano-x"), { inputPerMTok: 0.2, outputPerMTok: 1.25 });
```

`scripts/pricing.test.cjs:64`:

```js
assert.deepEqual(getPricing("claude-opus-4-8"), { inputPerMTok: 5.0, outputPerMTok: 25.0 });
assert.deepEqual(getPricing("claude-opus-4-7"), { inputPerMTok: 5.0, outputPerMTok: 25.0 });
```

`scripts/pricing.test.cjs:68`:

```js
assert.deepEqual(getPricing("claude-haiku-4-5-20251001"), { inputPerMTok: 1.0, outputPerMTok: 5.0 });
assert.deepEqual(getPricing("claude-haiku-3.5-turbo"), { inputPerMTok: 0.8, outputPerMTok: 4.0 });
```

`scripts/pricing.test.cjs:74`:

```js
assert.deepEqual(getPricing("gemini/gemini-2.5-flash"), { inputPerMTok: 0.3, outputPerMTok: 2.5 });
assert.deepEqual(getPricing("openai/gpt-5.4-mini"), { inputPerMTok: 0.75, outputPerMTok: 4.5 });
assert.deepEqual(getPricing("claude/claude-sonnet-4-6"), { inputPerMTok: 3.0, outputPerMTok: 15.0 });
```

`scripts/pricing.test.cjs:78`:

```js
assert.deepEqual(getPricing("openai/GPT-4O-MINI"), { inputPerMTok: 0.15, outputPerMTok: 0.6 });
```

`scripts/pricing.test.cjs:84`:

```js
assert.equal(getPricing("OpenAI/gpt-4o-mini"), null);
```

`scripts/pricing.test.cjs:96`:

```js
assert.equal(getPricing("gemini-2.5-flash-image"), null);
assert.equal(getPricing("gemini/gemini-2.5-flash-image"), null);
```

`scripts/pricing.test.cjs:104`:

```js
assert.deepEqual(getPricing("claude-sonnet-5", introPriceEnd), { inputPerMTok: 2.0, outputPerMTok: 10.0 });
assert.deepEqual(getPricing("claude-sonnet-5-20260615", introPriceEnd), { inputPerMTok: 2.0, outputPerMTok: 10.0 });
assert.deepEqual(getPricing("claude-sonnet-5", regularPriceStart), { inputPerMTok: 3.0, outputPerMTok: 15.0 });
```

`scripts/pricing.test.cjs:107`:

```js
assert.deepEqual(getPricing("claude-sonnet-5-20260615", regularPriceStart), { inputPerMTok: 3.0, outputPerMTok: 15.0 });
```

`scripts/pricing.test.cjs:112`:

```js
assert.equal(calcCost(null, 100, "gpt-4o"), null); // v92以前データ（inputTokens null）
assert.equal(calcCost(100, null, "gpt-4o"), null); // v92以前データ（outputTokens null）
assert.equal(calcCost(1_000_000, 1_000_000, "gpt-4o"), 12.5); // (1*2.5)+(1*10.0)
```

`scripts/pricing.test.cjs:119`:

```js
assert.equal(calcCost(1_000_000, 1_000_000, "openai/gpt-5.4-mini-preview"), 5.25);
```

- 分類: 情報のみ
- 推奨対応: 現状維持。pricingの照合・正規化・日付境界を固定するテストデータとして扱う。
- 優先度: 低

## 問題なし・対象外と判断した項目と確認方法

### `text-embedding-` のactive code内重複はなし

- 実行コマンド:
  - `rg -ni --hidden --glob '!node_modules/**' --glob '!.next/**' --glob '!.git/**' --glob '!lib/modelRegistry.ts' --glob '!lib/internalModels.ts' '(gpt-|claude-|gemini-|text-embedding-)' .`
  - `rg -n 'LORE_EMBEDDING_MODEL|LORE_CHAT_MODEL' --glob '!lib/internalModels.ts' app components lib types scripts`
- 確認ファイル: `lib/internalModels.ts`、`lib/lore/openai.ts`、`scripts/lore-openai.test.cjs`、`CLAUDE.md`、`README.md`、`README.en.md`。
- 結論: active codeでは `lib/lore/openai.ts` が内部モデル定数を参照し、`text-embedding-...` の値そのものは除外対象の定義ファイル以外にない。テスト期待値は[E-32]へ分離した。README/CLAUDEの記述は実行リテラルではない。

`lib/lore/openai.ts:1`:

```ts
import { LORE_EMBEDDING_MODEL, LORE_CHAT_MODEL } from "../internalModels";
```

`lib/lore/openai.ts:16`:

```ts
    body: JSON.stringify({ model: LORE_EMBEDDING_MODEL, input }),
```

`lib/lore/openai.ts:56`:

```ts
      model: LORE_CHAT_MODEL,
```

### `LIKED_AI_DEFAULTS` はroute側で共通定数を参照している

- 実行コマンド: `rg -n --glob '!lib/lore/types.ts' 'DREAMING_DEFAULTS|LIKED_AI_DEFAULTS|BATCH_TRAIN_UI_REQUEST_LIMIT' .`
- 確認ファイル: `lib/lore/types.ts`、`app/api/lore/like/route.ts`、`app/memory/page.tsx`、`scripts/lore.test.cjs`。
- 結論: liked AIの`memoryKind`・`importanceScore`・`confidenceScore`はroute内数値ではなくimportした定数から取得するため、この3値について追加指摘なし。

`app/api/lore/like/route.ts:5`:

```ts
import { LIKED_AI_DEFAULTS } from "@/lib/lore/types";
```

`app/api/lore/like/route.ts:65`:

```ts
  const { memoryKind, importanceScore, confidenceScore } = LIKED_AI_DEFAULTS;
```

### UI側のDreaming/Batch Train requestは既存定数を参照している

- 実行コマンド: 上記の定数名grepに加え、`rg -n '^' app/memory/page.tsx` で呼び出し文脈を確認。
- 確認ファイル: `app/memory/page.tsx`、`lib/lore/types.ts`、`app/api/lore/dreaming-batch/route.ts`、`app/api/lore/batch-train/route.ts`。
- 結論: UI送信値は共通定数を参照する。Dreaming API側の同値fallbackは[E-24]、Batch Train API側の別概念のserver policyは[E-25]に記載したため、それ以外の追加指摘なし。

`app/memory/page.tsx:784`:

```ts
        body: JSON.stringify({ limit: BATCH_TRAIN_UI_REQUEST_LIMIT }),
```

`app/memory/page.tsx:841`:

```ts
        body: JSON.stringify(DREAMING_DEFAULTS),
```

### 他のテスト3本に対象モデルIDリテラルはなし

- 実行方法: `git ls-files -- 'scripts/*.test.cjs'` の7本すべてをTypeScript Compiler APIで構文解析し、文字列リテラルだけを抽出。
- 確認ファイル: `scripts/ai-context-blocks.test.cjs`、`scripts/branchTree.test.cjs`、`scripts/lore.test.cjs`。
- 結論: 対象prefixを含むモデルID文字列リテラルは0件。残る4本は[E-31]〜[E-34]に全件記載した。

### モデルgrepの非該当hit

- `x-gemini-api-key` および同文字列を含むerror messageはheader名でありモデルIDではない。確認ファイル: `app/api/arena/route.ts`、`app/api/chat/route.ts`、`app/api/extract-settings/route.ts`、`app/api/image-gen/route.ts`、`app/api/novel-check/route.ts`、`app/arena/page.tsx`、`app/image/page.tsx`、`app/novel-check/page.tsx`、`app/page.tsx`。
- `CLAUDE.md`、`README.md`、`README.en.md`、`docs/audit/full-audit-a-2026-07-13.md` のhitは説明文または過去レポート内の引用であり、実行コードの文字列リテラルではない。
- `scripts/modelRegistry.test.cjs:56-60` の `label: "GPT-..."` 5件は表示ラベルであり、同じ行の`id`だけをモデルID件数に数えた。

### 対象となる上限・閾値がなかったroute

- 実行コマンド:
  - `git ls-files -- 'app/**/route.ts'`
  - `rg -n -P --glob 'app/api/**/route.ts' '(?i)(?:\blimit\b|\bthreshold\b|\bmax[A-Za-z_]*|\bmin[A-Za-z_]*|\btimeout[A-Za-z_]*|\b[A-Za-z_]*score\b|\b[A-Za-z_]*tokens\b|\b[A-Za-z_]*chars\b)\s*[:=]\s*[0-9_]+(?:\.[0-9]+)?' app/api`
  - `rg -n -P --glob 'app/api/**/route.ts' '\.limit\(\s*[0-9_]+\s*\)' app/api`
  - `rg -n --glob 'app/api/**/route.ts' 'clamp\([^\r\n]*[0-9]' app/api`
  - `rg -n -P --glob 'app/api/**/route.ts' '(?:===|!==|>=|<=|>|<)\s*[0-9_]+(?:\.[0-9]+)?' app/api`
  - `rg -n -P --glob 'app/api/**/route.ts' '\.(?:slice|substring|substr)\([^\r\n]*[0-9_]' app/api`
  - `rg -n -P --glob 'app/api/**/route.ts' '(?:setTimeout|\.range|\.limit)\([^\r\n]*[0-9_]' app/api`
  - `rg -n -P --glob 'app/api/**/route.ts' '\{[0-9]+(?:,[0-9]*)?\}' app/api`
  - `rg -n -P --glob 'app/api/**/route.ts' '["''][0-9]+(?:\.[0-9]+)?(?:x[0-9]+)?["'']' app/api`
- 全52 routeを対象にし、`app/auth/callback/route.ts` は `rg -n '^' app/auth/callback/route.ts` で全行も確認した。
- 51行を[E-10]〜[E-30]へ記載した後、定義した対象基準に該当する値がなかったrouteは次の33件:

```text
app/api/auth/github/callback/route.ts
app/api/auth/github/route.ts
app/api/auth/github/status/route.ts
app/api/calendar/route.ts
app/api/fetch-github/route.ts
app/api/lore/[id]/route.ts
app/api/lore/chunks/[id]/route.ts
app/api/lore/chunks/route.ts
app/api/lore/consolidate/dismiss/route.ts
app/api/lore/consolidate/merge/route.ts
app/api/lore/consolidate/preview/route.ts
app/api/lore/dreaming-batch/rollback/route.ts
app/api/lore/like/route.ts
app/api/lore/route.ts
app/api/lore/update-temporal-status/route.ts
app/api/mcp-tokens/route.ts
app/api/messages/[id]/route.ts
app/api/search/route.ts
app/api/share/[token]/fork/route.ts
app/api/share/[token]/route.ts
app/api/stats/route.ts
app/api/threads/[id]/branch-to/route.ts
app/api/threads/[id]/copy/route.ts
app/api/threads/[id]/drafts/route.ts
app/api/threads/[id]/likes/route.ts
app/api/threads/[id]/message-notes/route.ts
app/api/threads/[id]/messages/[messageId]/route.ts
app/api/threads/[id]/messages/restore-branch/route.ts
app/api/threads/[id]/messages/route.ts
app/api/threads/[id]/notes/route.ts
app/api/threads/[id]/route.ts
app/api/threads/route.ts
app/auth/callback/route.ts
```

`app/api/calendar/route.ts` のJST/UTC換算、`app/api/stats/route.ts` の日付・時刻bucket、HTTP status、配列index、radix、DB error code等は検索結果を実ファイルで確認したうえで、閾値・limit・運用上限ではないため除外した。

## 監査方法と確認範囲

### 開始条件

| 確認 | 実測結果 |
|---|---|
| 開始時 `git status --short` | 出力なし（clean） |
| `docs/audit/full-audit-e-2026-07-13.md` | `False`（未作成） |
| `node_modules/next/package.json` | 存在、9,992 bytes |
| `git ls-files` | 174ファイル |
| 追跡コード `*.ts/*.tsx/*.js/*.cjs` | 137ファイル |
| `app/**/route.ts` | 52ファイル |
| `scripts/*.test.cjs` | 7ファイル |

開始時に`docs/audit/`外の差分はなく、対象レポートも存在しなかったため監査を開始した。

### モデルID全件抽出

1. リポジトリ全体を前述のcase-insensitive `rg` で検索し、非コード文書・コメント・header名を含む候補を得た。
2. `git ls-files -- '*.ts' '*.tsx' '*.js' '*.cjs'` の137ファイルをローカルの`typescript` Compiler APIでメモリ上だけでparseした（補助ファイル作成なし）。`StringLiteral`/`NoSubstitutionTemplateLiteral`で `/(gpt-|claude-|gemini-|text-embedding-)/i` に一致するnodeの実値と開始行を抽出した。
3. 除外指定の2定義ファイルを外し、モデルIDではないheader/labelを文脈で除外した結果、active codeは次の9ファイル・47リテラルだった。すべて[E-01]〜[E-09]へ記載済み。

```text
app/api/arena/route.ts                         3
app/api/chat/route.ts                          5
app/api/extract-settings/route.ts              3
app/api/image-gen/route.ts                     2
app/image/page.tsx                             5
app/novel-check/page.tsx                       5
app/page.tsx                                   2
app/settings/page.tsx                          3
types/index.ts                                19
合計                                          47
```

4. 同じ構文木抽出を`git ls-files -- 'scripts/*.test.cjs'`へ適用し、表示labelを除いた結果は次の4ファイル・110リテラルだった。すべて[E-31]〜[E-34]へ記載済み。

```text
scripts/loadModel.test.cjs                    45
scripts/lore-openai.test.cjs                   2
scripts/modelRegistry.test.cjs                39
scripts/pricing.test.cjs                      24
合計                                         110
```

### 全routeファイル一覧

次の52ファイルを数値grepの母集団とし、hit行を実ファイルで開いて用途を確認した。

```text
app/api/album/route.ts
app/api/arena/route.ts
app/api/auth/github/callback/route.ts
app/api/auth/github/route.ts
app/api/auth/github/status/route.ts
app/api/calendar/route.ts
app/api/chat/route.ts
app/api/explore/route.ts
app/api/extract-settings/route.ts
app/api/fetch-github/route.ts
app/api/folder-settings/route.ts
app/api/image-gen/route.ts
app/api/lore/[id]/route.ts
app/api/lore/batch-train/route.ts
app/api/lore/bulk-archive/route.ts
app/api/lore/chunks/[id]/route.ts
app/api/lore/chunks/route.ts
app/api/lore/consolidate/candidates/route.ts
app/api/lore/consolidate/dismiss/route.ts
app/api/lore/consolidate/merge/route.ts
app/api/lore/consolidate/preview/route.ts
app/api/lore/dreaming-batch/history/route.ts
app/api/lore/dreaming-batch/rollback/route.ts
app/api/lore/dreaming-batch/route.ts
app/api/lore/embed/route.ts
app/api/lore/like/route.ts
app/api/lore/route.ts
app/api/lore/update-temporal-status/route.ts
app/api/mcp-tokens/route.ts
app/api/mcp/threads/[id]/messages/route.ts
app/api/mcp/threads/route.ts
app/api/messages/[id]/route.ts
app/api/novel-check/route.ts
app/api/profile/route.ts
app/api/reports/route.ts
app/api/search/route.ts
app/api/share/[token]/fork/route.ts
app/api/share/[token]/route.ts
app/api/stats/route.ts
app/api/threads/[id]/branch-to/route.ts
app/api/threads/[id]/copy/route.ts
app/api/threads/[id]/drafts/route.ts
app/api/threads/[id]/likes/route.ts
app/api/threads/[id]/message-notes/route.ts
app/api/threads/[id]/messages/[messageId]/route.ts
app/api/threads/[id]/messages/restore-branch/route.ts
app/api/threads/[id]/messages/route.ts
app/api/threads/[id]/notes/route.ts
app/api/threads/[id]/route.ts
app/api/threads/[id]/tags/route.ts
app/api/threads/route.ts
app/auth/callback/route.ts
```

## 検証結果

コードは変更していないが、現状が全緑であることと監査による破損がないことを確認した。

| コマンド | 終了コード | 結果 |
|---|---:|---|
| `npx tsc --noEmit` | 0 | stdout/stderrなし |
| `npm run build` | 0 | `✓ Compiled successfully`、`✓ Generating static pages (26/26)` |
| `node scripts/ai-context-blocks.test.cjs` | 0 | `ai-context-blocks tests passed` |
| `node scripts/branchTree.test.cjs` | 0 | `branchTree tests passed` |
| `node scripts/loadModel.test.cjs` | 0 | `loadModel tests passed` |
| `node scripts/lore-openai.test.cjs` | 0 | `11 lore OpenAI tests passed` |
| `node scripts/lore.test.cjs` | 0 | `1..20` / `# 20 lore characterization tests passed` |
| `node scripts/modelRegistry.test.cjs` | 0 | `modelRegistry tests passed` |
| `node scripts/pricing.test.cjs` | 0 | `pricing tests passed` |

検証時の差分管理:

- `npx tsc --noEmit` 後の `git status --short` は ` M tsconfig.tsbuildinfo` だった。
- 指定どおり `git restore --worktree -- tsconfig.tsbuildinfo` を実行して復元し、その直後の`git status --short`が空であることを確認した。
- `npm run build` のsandbox内初回実行はNext.js workerの`spawn EPERM`で終了コード1だったため、同一コマンドを子process実行可能な権限で再実行した。上表は再実行の実測結果であり、終了コード0でbuild完了した。
- build後および全7テスト後の `git status --short` はいずれも空だった。

## 最終 `git status --short`

レポート作成後に実行した結果:

```text
?? docs/audit/full-audit-e-2026-07-13.md
```
