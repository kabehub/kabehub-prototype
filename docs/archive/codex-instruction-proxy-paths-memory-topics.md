# Codex指示書: Project Memory Update Protocol APIをBearer許可リストに追加

## 背景

`app/api/projects/[projectId]/memory/topics/route.ts`（GET/POST）と
`app/api/projects/[projectId]/memory/topics/[topicId]/route.ts`（GET/PATCH）は
コミット`baf8075`で実装済みだが、`lib/proxy-paths.ts`の`API_AUTH_CLASSIFICATIONS`に
登録されていない。

`lib/supabase/route-auth.ts`の`resolveRouteAuth()`は、Authorizationヘッダーに
Bearerトークンが付いているリクエストに対して、まず
`isBearerCapableApi(pathname, method)`（内部で`classifyApi()`が
`API_AUTH_CLASSIFICATIONS`を参照する）を確認し、一致するエントリが無ければ
トークンの中身を検証する前に`authMode: "none"`として401 Unauthorizedを返す
（`lib/proxy-paths.ts:105-108`相当）。

上記2ファイル4メソッドがこの配列に含まれていないため、有効なBearerトークンを
送っても常に401になる。Cookie認証（ブラウザセッション）はこの分岐を通らないため
影響を受けない。

`proxy.ts`のmatcherは`/api/((?!mcp(?:/|$)|auth/github/callback(?:/|$)|auth/github/mobile-callback/?$|cron/storage-cleanup(?:/|$)|csp-report(?:/|$)).*)`
であり、`/api/projects/...`は元々除外されていない（proxy()自体は正常に起動している）。
したがって**`proxy.ts`のmatcherは変更不要**で、`lib/proxy-paths.ts`だけを直す。

## Goal

`API_AUTH_CLASSIFICATIONS`に、新設された2ルート・4メソッド分のエントリを
`classification: "bearer"`で追加し、Bearerトークンでの認証が正しく機能するようにする。

## Constraints

- 変更対象は`lib/proxy-paths.ts`のみ。`proxy.ts`・`app/api/projects/...`配下の
  route実装・その他の既存エントリには一切手を入れない。
- 既存の正規表現の書き方（動的segmentは`[^/]+`、末尾スラッシュ許容は`\/?$`）に揃える。
- 配列内の並び順は既存の慣習（パスのアルファベット順に近い並び）に合わせ、
  `/api/profile`のエントリと`/api/reports`のエントリの間に挿入する。
- 既存route・既存テストの挙動を一切変えない（回帰ゼロ）。

## Implementation policy

`lib/proxy-paths.ts`の`API_AUTH_CLASSIFICATIONS`配列で、以下の2行

```ts
  { pattern: /^\/api\/profile\/?$/, methods: ["GET", "POST"], classification: "bearer" },
  { pattern: /^\/api\/reports\/?$/, methods: ["POST"], classification: "bearer" },
```

を、次のように変更する（`/api/profile`と`/api/reports`の間に2行追加するだけで、
既存2行自体は変更しない）。

```ts
  { pattern: /^\/api\/profile\/?$/, methods: ["GET", "POST"], classification: "bearer" },
  { pattern: /^\/api\/projects\/[^/]+\/memory\/topics\/?$/, methods: ["GET", "POST"], classification: "bearer" },
  { pattern: /^\/api\/projects\/[^/]+\/memory\/topics\/[^/]+\/?$/, methods: ["GET", "PATCH"], classification: "bearer" },
  { pattern: /^\/api\/reports\/?$/, methods: ["POST"], classification: "bearer" },
```

## Acceptance criteria

以下をすべて生ログで確認する（サマリーのみの報告は不可）。

1. `node --test scripts/proxy-paths.test.cjs`
   - 修正前は`/api/projects/__projectId__/memory/topics`
     （および`.../__topicId__`）に対応するmanifestエントリが0件のため、
     「every real route×method has exactly one manifest classification」が
     失敗するはず。修正後は全件PASSすること。
2. `node --test scripts/proxy.test.cjs` が全件PASSすること（matcherは
   変更していないので既存の結果から退行がないことの確認）。
3. `node --test scripts/projects-memory-topics-route.test.cjs`
   `scripts/projects-memory-topics-id-route.test.cjs` が引き続き
   66ケース全PASSすること（この2ファイルはsupabaseクライアントを直接mockしており
   `resolveRouteAuth()`を経由しないため、今回の修正によって挙動が変わらないことの確認）。
4. **リポジトリ全体の`node --test`**（新規2ファイルだけでなく全`scripts/*.test.cjs`）
   を実行し、全件PASSすること。今回の抜け漏れがこのコマンド一つで検出できた
   はずである点を踏まえ、以後の標準確認項目とする。
5. `npx tsc --noEmit --incremental false` がエラーなしで完了すること。
6. `git status --short`で`lib/proxy-paths.ts`以外に意図しない差分が無いことを確認する。

## Out of scope

- `proxy.ts`のmatcher変更
- `/api/projects`自体（project作成API）の新設
- DELETE topic等、MVP方針で保留しているエンドポイント
- 今回のBearer抜け漏れと同種の問題が他のroute群に無いかの網羅監査
  （§Acceptance criteria の4番で全体テストが通ることの確認に留め、
  監査自体は別タスクとする）
