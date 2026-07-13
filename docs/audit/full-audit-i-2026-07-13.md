# KabeHub 全体監査レポート I — 依存パッケージの棚卸し

- 監査日: 2026-07-13
- 監査対象: `package.json` の `dependencies` / `devDependencies`、`app`、`components`、`lib`、`scripts`、`types`、ルート設定ファイル
- 実施方針: 読み取り専用監査。コード、テスト、設定、依存関係は変更していない。
- 非対象: `node_modules` / `.next` の内容（開始前の `node_modules/next/package.json` 健全性確認を除く）、DB接続、SQL実行

## サマリ

| 項目 | 結果 |
|---|---:|
| 直接依存パッケージ | 23件（`dependencies` 13件、`devDependencies` 10件） |
| 指摘 | 2件（高 0 / 中 1 / 低 1） |
| 参照が確認できない可能性のあるパッケージ | 1件（`rehype-highlight`） |
| `npm audit` | 0件（Critical 0 / High 0 / Moderate 0 / Low 0 / Info 0） |
| 既知基準との一致 | 不一致。既知の High 1件 + Moderate 2件から、現在は全深刻度0件へ減少 |
| 新規に増えた脆弱性 | 0件 |
| 型検査・build・既存テスト | 全件成功 |

## 1. 開始条件

開始前に次を実行した。

```powershell
git status --short
Test-Path -LiteralPath docs/audit/full-audit-i-2026-07-13.md
Test-Path -LiteralPath node_modules/next/package.json
(Get-Item -LiteralPath node_modules/next/package.json).Length
```

結果は次のとおり。

- `git status --short`: 出力なし。`docs/audit/` 外を含め、開始時の差分なし。
- 対象レポート: `False`。既存ファイルなし。
- `node_modules/next/package.json`: `True`、9,992 bytes。存在し、極端に小さい状態ではない。
- `rg --files -g 'AGENTS.md' -g '!node_modules/**' -g '!.next/**'`: 出力なし。追加のリポジトリ内指示書なし。

以上から停止条件には該当せず、監査を開始した。

## 2. 確認方法

### 2.1 対象ファイルの確定

次を実行し、`app` 77件、`components` 14件、`lib` 34件、`scripts` 7件、`types` 1件の計133件を列挙した。これにルート設定6件と、依存定義の `package.json` / `package-lock.json` を加えて確認した。完全な一覧は「付録A」に記載する。

```powershell
rg --files app components lib scripts types
```

### 2.2 パッケージごとの文字列検索

`package.json` の23パッケージすべてを `$packages` に列挙し、定義ファイル自身と監査非対象を除いて固定文字列検索した。実行した検索のテンプレートは次のとおり。

```powershell
rg -n --no-heading -F --glob '!package.json' --glob '!package-lock.json' --glob '!docs/**' --glob '!node_modules/**' --glob '!.next/**' -- $pkg app components lib scripts types middleware.ts next.config.js postcss.config.js tailwind.config.js tsconfig.json next-env.d.ts
```

さらに、通常のES import、dynamic import、CommonJS require、設定ファイル内の型用 `import()` に限定した次のPCRE2検索を全23件に実行し、行数とファイル数を集計した。

```powershell
$pattern = '(?:\bfrom\s*|\brequire\(\s*|\bimport(?:\(\s*|\s+))["'']' + [regex]::Escape($pkg) + '(?:/[^"'']*)?["'']'
rg -n --no-heading --pcre2 -- $pattern app components lib scripts types middleware.ts next.config.js postcss.config.js tailwind.config.js tsconfig.json next-env.d.ts
```

`rehype-highlight` については別名・関連設定の見落としを避けるため、次も実行した。

```powershell
rg -n --no-heading -i --glob '!package.json' --glob '!package-lock.json' --glob '!docs/**' --glob '!node_modules/**' --glob '!.next/**' -- 'rehype|highlight\.js|hljs|rehypePlugins' app components lib scripts types middleware.ts next.config.js postcss.config.js tailwind.config.js tsconfig.json next-env.d.ts
```

結果は出力なしだった。

### 2.3 インストール状態・脆弱性

```powershell
npm ls --depth=0
npm ls next postcss uuid rehype-highlight react-dom @types/jszip @types/uuid --all --depth=3
npm audit --json
npm audit
```

- `npm ls --depth=0`: 終了コード0。23件すべてがインストール済みで、missing / extraneous の表示なし。
- `npm audit --json`: 終了コード0。全深刻度0件、総数0件。
- `npm audit`: 終了コード0、`found 0 vulnerabilities`。
- 実行環境: Node.js `v24.14.1`、npm `11.11.0`、registry `https://registry.npmjs.org/`、npmの `audit` 設定は `true`。
- `npm install`、`npm update`、`npm audit fix` その他の依存関係変更コマンドは実行していない。

## 3. 依存パッケージ棚卸し

「直接参照」は2.2のimport/require限定検索の `該当行数 / 該当ファイル数`。型定義は対応する本体の利用を、ビルドツールとフレームワークは設定・実行経路を確認して判定した。

### 3.1 `dependencies`

| パッケージ | 定義場所 | 直接参照 | 実ファイルでの確認結果 | 判定 |
|---|---|---:|---|---|
| `@supabase/ssr` | `package.json:11` | 5 / 5 | `middleware.ts:1`、`app/auth/callback/route.ts:1`、`lib/supabase/client.ts:1`、`lib/supabase/route-handler.ts:1`、`lib/supabase/server.ts:1` | 問題なし |
| `@supabase/supabase-js` | `package.json:12` | 7 / 7 | `app/api/reports/route.ts:2`、`app/page.tsx:12`、`components/Sidebar.tsx:5`、`lib/lore/search.ts:1`、`lib/mcp-auth.ts:5`、`lib/supabase-db.ts:1`、`lib/supabase/download-image.ts:1` | 問題なし |
| `@upstash/ratelimit` | `package.json:13` | 2 / 1 | `lib/rate-limit.ts:5-6` で値と型をimport | 問題なし |
| `@upstash/redis` | `package.json:14` | 1 / 1 | `lib/rate-limit.ts:7` | 問題なし |
| `@vercel/functions` | `package.json:15` | 1 / 1 | `app/api/chat/route.ts:2` | 問題なし |
| `jszip` | `package.json:16` | 1 / 1 | `lib/exportUtils.ts:7` | 問題なし |
| `next` | `package.json:17` | 77 / 74 | `middleware.ts:2` ほかAPI route・page・設定で使用。フレームワーク本体でもある | 問題なし（除外対象） |
| `react` | `package.json:18` | 26 / 26 | `components/BranchTree.tsx:3` ほか26ファイルで使用。フレームワーク本体でもある | 問題なし（除外対象） |
| `react-dom` | `package.json:19` | 0 / 0 | 直接importなし。`npm ls` で `react-dom@18.3.1` と Next 配下のdedupeを確認し、本番buildも成功。フレームワーク本体として未使用指摘から除外 | 問題なし（除外対象） |
| `react-markdown` | `package.json:20` | 1 / 1 | `components/MarkdownRenderer.tsx:4` | 問題なし |
| `rehype-highlight` | `package.json:21` | 0 / 0 | 固定文字列検索・import/require検索・関連語検索がすべて0件 | **I-1** |
| `remark-gfm` | `package.json:22` | 1 / 1 | `components/MarkdownRenderer.tsx:5`、利用箇所は同ファイル `:204` | 問題なし |
| `uuid` | `package.json:23` | 7 / 7 | `app/api/arena/route.ts:3`、`app/api/chat/route.ts:4`、`app/api/threads/[id]/branch-to/route.ts:2`、`app/api/threads/[id]/drafts/route.ts:3`、`app/api/threads/[id]/route.ts:3`、`app/arena/page.tsx:4`、`app/page.tsx:4` | 問題なし |

### 3.2 `devDependencies`

| パッケージ | 定義場所 | 直接参照 | 実ファイル・設定での確認結果 | 判定 |
|---|---|---:|---|---|
| `@tailwindcss/typography` | `package.json:26` | 1 / 1 | `tailwind.config.js:48` でrequire、同ファイル `:32-45` にtypography設定 | 問題なし（設定経由） |
| `@types/jszip` | `package.json:27` | 0 / 0 | 対応本体 `jszip` を `lib/exportUtils.ts:7` で使用 | 問題なし（型定義除外） |
| `@types/node` | `package.json:28` | 0 / 0 | `next.config.js:2` の `process`、`lib/github-token-crypto.ts:30` の `Buffer` ほかNodeグローバルをTypeScriptコードで使用 | 問題なし（型定義・暗黙利用） |
| `@types/react` | `package.json:29` | 0 / 0 | 対応本体 `react` は26ファイルで使用 | 問題なし（型定義除外） |
| `@types/react-dom` | `package.json:30` | 0 / 0 | 対応本体 `react-dom` はNext/Reactのフレームワーク構成としてインストールされ、本番build成功 | 問題なし（型定義・フレームワーク除外） |
| `@types/uuid` | `package.json:31` | 0 / 0 | 対応本体 `uuid` は7ファイルで使用 | 問題なし（型定義除外） |
| `autoprefixer` | `package.json:32` | 0 / 0 | 固定文字列検索では `postcss.config.js:4` に1件。PostCSS plugin設定 | 問題なし（設定経由） |
| `postcss` | `package.json:33` | 0 / 0 | `postcss.config.js:1-6` が存在し、Tailwind/Autoprefixerを設定。本番build成功 | 問題なし（設定経由） |
| `tailwindcss` | `package.json:34` | 1 / 1 | `tailwind.config.js:1` の型import、`postcss.config.js:3` のplugin設定 | 問題なし（設定経由） |
| `typescript` | `package.json:35` | 7 / 7 | `scripts/*.test.cjs` 全7件でrequire。`npx tsc --noEmit` も成功 | 問題なし（ビルドツール） |

### 3.3 「問題なし」の根拠まとめ

- 通常依存: `rehype-highlight` を除く通常依存は実ファイルのimport/requireを確認した。
- フレームワーク: `next`、`react` は多数の直接参照、`react-dom` はNextの実行構成と成功したbuildを確認し、指定どおり未使用指摘から除外した。
- 型定義: 対応本体またはNodeグローバルの利用を確認し、指定どおり未使用指摘から除外した。
- ビルドツール: `tailwind.config.js`、`postcss.config.js`、`tsconfig.json`、7本のテストスクリプト、実際の型検査・buildを確認した。
- 参照検索は付録Aの全139ファイル（ソース133件 + 設定6件）に対して実施した。依存定義・解決確認には `package.json` と `package-lock.json` も使用した。

## 4. 指摘

### [I-1] `rehype-highlight` の参照が監査対象内に存在しない

- 場所: `package.json:21`（対象パッケージの記載行）

```json
    "react-markdown": "^9.0.1",
    "rehype-highlight": "^7.0.0",
    "remark-gfm": "^4.0.0",
```

確認したMarkdown実装のimportは次の3行だった。

```tsx
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
```

利用pluginの指定も `remarkGfm` のみだった。

```tsx
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
```

- 事実: 付録Aの139ファイルに対するパッケージ名の固定文字列検索は0件、import/require限定検索は0件、`rehype|highlight\.js|hljs|rehypePlugins` の関連語検索も0件だった。`components/MarkdownRenderer.tsx:3-5` と `components/MarkdownRenderer.tsx:203-205` には `react-markdown` と `remark-gfm` の利用があるが、`rehype-highlight` のimport・plugin指定はない。
- 分類: デッドコード
- 推奨対応: 意図したsyntax highlight機能が不要なら、レビュー後に依存定義とlockfileから削除することを検討する。
- 優先度: 中

### [I-2] `npm audit` は既知の残存3件ではなく0件を返す

- 場所: `package.json:17`、`package.json:23`、`package.json:33`（既知メモに関係する対象パッケージの記載行）

```json
    "next": "14.2.35",
```

```json
    "uuid": "^9.0.1"
```

```json
    "postcss": "^8",
```

- 事実: `npm audit --json` は Info 0 / Low 0 / Moderate 0 / High 0 / Critical 0 / Total 0、`npm audit` は `found 0 vulnerabilities`、いずれも終了コード0だった。依頼文の2026-07-13既知基準（Next 16化待ちのHigh 1件、postcss/uuid絡みのModerate 2件、計3件）とは一致せず、3件から0件への減少である。新規増加は0件。`npm ls` で実体は `next@14.2.35`、`uuid@9.0.1`、直接依存 `postcss@8.5.18`、Next配下 `postcss@8.4.31` と確認したため、Next 16 / uuid 14へのメジャー更新待ちというバージョン状態自体は継続している。
- 分類: 情報のみ
- 推奨対応: 既知項目を閉じる前に、同じlockfileとregistry条件でCI側の `npm audit` も再確認し、監査結果変化の根拠を保存する。
- 優先度: 低

## 5. `npm audit` 比較

| 深刻度 | 既知基準 | 今回実測 | 増減 | 新規増加 |
|---|---:|---:|---:|---:|
| Critical | 0 | 0 | 0 | 0 |
| High | 1 | 0 | -1 | 0 |
| Moderate | 2 | 0 | -2 | 0 |
| Low | 0 | 0 | 0 | 0 |
| Info | 0 | 0 | 0 | 0 |
| 合計 | 3 | 0 | -3 | 0 |

結論: 既知の残存件数とは一致しない。ただし差分は新規脆弱性の増加ではなく、全3件が現在のnpm advisory応答に現れない方向の変化である。バージョンはNext 14系、uuid 9系のままであり、メジャー更新済みを意味しない。

## 付録A. 参照検索で確認したファイル一覧

ソース133件と設定6件の計139件。下記すべてに対してパッケージ固定文字列検索とimport/require限定検索を実施した。

<details>
<summary>app（77件）</summary>

```text
app/[handle]/default.tsx
app/[handle]/page.tsx
app/[handle]/ProfilePage.tsx
app/album/page.tsx
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
app/arena/[token]/ArenaViewPage.tsx
app/arena/[token]/default.tsx
app/arena/[token]/page.tsx
app/arena/page.tsx
app/auth/callback/route.ts
app/calendar/page.tsx
app/explore/page.tsx
app/globals.css
app/image/page.tsx
app/layout.tsx
app/legal/page.tsx
app/login/page.tsx
app/memory/page.tsx
app/novel-check/page.tsx
app/page.tsx
app/privacy/page.tsx
app/settings/page.tsx
app/share/[token]/page.tsx
app/sitemap.ts
app/stats/page.tsx
app/terms/page.tsx
app/threads/[id]/tree/page.tsx
```

</details>

<details>
<summary>components（14件）</summary>

```text
components/ArenaTimeline.tsx
components/BranchTree.tsx
components/ChatInput.tsx
components/ChatInputCentered.tsx
components/ChatPanel.tsx
components/ExportModal.tsx
components/LegalLayout.tsx
components/MarkdownRenderer.tsx
components/MessageBubble.tsx
components/NovelSettingsPane.tsx
components/OutlinePane.tsx
components/PublishConfirmModal.tsx
components/RoleplayBubble.tsx
components/Sidebar.tsx
```

</details>

<details>
<summary>lib（34件）</summary>

```text
lib/ai-context-blocks.ts
lib/branching.ts
lib/branchTree.ts
lib/context-window.ts
lib/exportUtils.ts
lib/genres.ts
lib/github-token-crypto.ts
lib/github-token-store.ts
lib/github-tool-loop.ts
lib/github.ts
lib/internalModels.ts
lib/lore/batchTrain.ts
lib/lore/consolidation.ts
lib/lore/dreaming.ts
lib/lore/index.ts
lib/lore/mappers.ts
lib/lore/openai.ts
lib/lore/search.ts
lib/lore/selects.ts
lib/lore/types.ts
lib/loreMemorySelect.ts
lib/mcp-auth.ts
lib/mock-db.ts
lib/modelRegistry.ts
lib/pricing.ts
lib/rate-limit.ts
lib/storage-path-guard.ts
lib/stringUtils.ts
lib/supabase-db.ts
lib/supabase.ts
lib/supabase/client.ts
lib/supabase/download-image.ts
lib/supabase/route-handler.ts
lib/supabase/server.ts
```

</details>

<details>
<summary>scripts（7件）</summary>

```text
scripts/ai-context-blocks.test.cjs
scripts/branchTree.test.cjs
scripts/loadModel.test.cjs
scripts/lore-openai.test.cjs
scripts/lore.test.cjs
scripts/modelRegistry.test.cjs
scripts/pricing.test.cjs
```

</details>

<details>
<summary>types・ルート設定（7件）</summary>

```text
types/index.ts
middleware.ts
next.config.js
postcss.config.js
tailwind.config.js
tsconfig.json
next-env.d.ts
```

</details>

依存定義・解決の確認対象:

```text
package.json
package-lock.json
```

## 付録B. 検証コマンドと結果

### 型検査

| コマンド | 終了コード | 結果 |
|---|---:|---|
| `npx tsc --noEmit` | 0 | エラー出力なし |

`npx tsc --noEmit` により `tsconfig.tsbuildinfo` が更新されたため、指定どおり `git restore --worktree -- tsconfig.tsbuildinfo` を実行した。実行前SHA-256は `B71482A1F1CC187AA29DFA25F73A6D28585632ACB99868C8AA52E308F125C473`、更新時は `91276E26F6506DEFC29D0617D992505AFAC656227842A02C2499563B33C92794`、復元後は再び `B71482A1F1CC187AA29DFA25F73A6D28585632ACB99868C8AA52E308F125C473` となり、元の内容への復元を確認した。

### 既存Nodeテスト

実行前に `scripts/*.test.cjs` を全件列挙した。`lore-openai.test.cjs` は `global.fetch` をスタブ化し、`lore.test.cjs` はSupabase query builderをモック化していることを実ファイルで確認したため、外部API・DBへの接続なしで実行した。

| コマンド | 終了コード | 出力要約 |
|---|---:|---|
| `node scripts/ai-context-blocks.test.cjs` | 0 | `ai-context-blocks tests passed` |
| `node scripts/branchTree.test.cjs` | 0 | `branchTree tests passed` |
| `node scripts/loadModel.test.cjs` | 0 | `loadModel tests passed` |
| `node scripts/lore-openai.test.cjs` | 0 | 11 tests passed |
| `node scripts/lore.test.cjs` | 0 | 20 characterization tests passed |
| `node scripts/modelRegistry.test.cjs` | 0 | `modelRegistry tests passed` |
| `node scripts/pricing.test.cjs` | 0 | `pricing tests passed` |

### 本番build

| コマンド | 終了コード | 結果 |
|---|---:|---|
| `npm run build` | 0 | Compiled successfully、型検査成功、静的ページ26/26生成、build traces収集完了 |

制限付き環境での初回実行はNext.jsのworker生成時に `spawn EPERM` となったため、同一コマンドを子プロセス実行可能な環境で再実行した。再実行は終了コード0で、プロジェクト由来のbuildエラーはなかった。build後の `tsconfig.tsbuildinfo` のSHA-256は復元済みの値から変化せず、`git status --short` も出力なしだった。

## 付録C. 項目A〜Hレポートの存在確認

内容の再検証は行わず、ファイルの存在のみ確認した。8件すべて存在する。

```text
docs/audit/full-audit-a-2026-07-13.md
docs/audit/full-audit-b-2026-07-13.md
docs/audit/full-audit-c-2026-07-13.md
docs/audit/full-audit-d-2026-07-13.md
docs/audit/full-audit-e-2026-07-13.md
docs/audit/full-audit-f-2026-07-13.md
docs/audit/full-audit-g-2026-07-13.md
docs/audit/full-audit-h-2026-07-13.md
```

## 最終状態

監査完了時に `git status --short` を実行した結果は次の1件のみ。

```text
?? docs/audit/full-audit-i-2026-07-13.md
```
