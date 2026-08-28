# apps/mobile の `.env.local` 要件

- 対象: `apps/mobile`（`@kabehub/mobile`、Capacitor + Next.js static export）
- 作成日: 2026-08-28
- 前提: root直下の `.env.local`（`.env.local.example` 参照）とは**別ファイル**。KabeHubの標準ローカルビルド手順では `apps/mobile/.env.local` を用意する。

## 1. なぜ別ファイルが必要か

`apps/mobile` は `next.config.js` で `output: "export"` を指定した静的ビルド構成であり、Next.js サーバープロセスを持たない（`apps/mobile/next.config.js`）。Capacitor の WebView は `webDir: "out"` で生成された静的バンドルをローカル配信する（`apps/mobile/capacitor.config.ts`、`server.androidScheme: "https"`、`server.url` は未指定）。

このため、root の Next.js アプリ（Vercelにデプロイされるサーバーサイド込みの本体）と apps/mobile は**別々の env 変数セット**を持つ。root の `.env.local.example` には `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` という同名のSupabase公開変数も含まれるため定義内容自体はカバーしているが、そのすぐ後に `SUPABASE_SERVICE_ROLE_KEY` / `CRON_SECRET` / `GITHUB_CLIENT_SECRET` 等のroot Webアプリ向けserver-only変数が多数続く。apps/mobile 側ではこれらのserver-only変数は一切使われない（そもそも実行するサーバープロセスがない）ため、**root `.env.local.example` をそのままapps/mobileへコピーしない**こと。

## 2. apps/mobile が実際に参照している環境変数

コード上 `process.env.*` を参照しているのは `apps/mobile/lib/supabase/client.ts` の1箇所のみ（apps/mobile配下を横断確認済み）。

```typescript
// apps/mobile/lib/supabase/client.ts
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { /* ... */ }
);
```

| 変数名 | 必須 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅必須 | Supabaseクライアント初期化（認証・セッション） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅必須 | 同上 |

これ以外の環境変数は**apps/mobileには不要**。`NEXT_PUBLIC_SUPABASE_URL`と`NEXT_PUBLIC_SUPABASE_ANON_KEY`は必ず**同一プロジェクトの組み合わせ**を設定すること。

**セキュリティ注意**：`NEXT_PUBLIC_SUPABASE_ANON_KEY`はクライアントバンドル/APKから取得可能な値であり、秘密情報として扱うものではない。逆に`SUPABASE_SERVICE_ROLE_KEY`等のserver-only secretは**絶対にapps/mobileへ設定しない**（そもそも参照コードが存在しないが、誤って`.env.local`に追加しないよう明記）。

## 3. env変数化されていない値（ハードコード箇所）

以下はコード内に直書きされており、`.env.local` での上書きはできない設計になっている。値を変える場合はコード修正が必要（今回のドキュメント化の対象外）。

| 値 | ハードコード箇所 | 内容 |
|---|---|---|
| `https://www.kabehub.com` | `lib/api-client.ts` の `BASE_URL` | APIリクエスト先 |
| `https://www.kabehub.com` | `lib/auth/oauth.ts` の `CALLBACK_ORIGIN` | Google OAuth callback検証 |
| `https://www.kabehub.com/mobile/auth/callback` | `lib/auth/oauth.ts` の `redirectTo`（`startGoogleSignIn`） | Google OAuth開始時のredirect先（`CALLBACK_ORIGIN`とは別の完全URL） |
| `https://www.kabehub.com` | `lib/auth/github.ts` の `CALLBACK_ORIGIN` | GitHub OAuth callback検証 |

（`GITHUB_MOBILE_REDIRECT_URI`はroot appの`app/api/auth/github/mobile-callback/route.ts`が参照するサーバー専用変数であり、apps/mobile側では不要）

参考: `docs/task11`（Mobile CSP設計）の `connect-src` にも同じ本番ドメインと本番Supabaseプロジェクト（`https://lfrdzrdmrxmqqwmxmyxx.supabase.co`）が固定で列挙されている。**現行CSPでは本番Supabase originのみが`connect-src`に許可されているため、現在のローカル/Android検証では本番Supabaseプロジェクト（`lfrdzrdmrxmqqwmxmyxx`）を使用する。**将来staging Supabaseを導入する場合は、`.env.local`だけでなくMobile CSPの`connect-src`（`app/layout.tsx`のCSP meta）も同時に変更する必要がある。

## 4. `NEXT_PUBLIC_*` と静的exportの関係（重要な注意点）

`NEXT_PUBLIC_` プレフィックスの変数は、Next.jsのビルド時にクライアントバンドルへ**値として埋め込まれる**。apps/mobileは `output: "export"` のためサーバーでの実行時解決がなく、この埋め込みが唯一の反映経路になる。

つまり：
- `.env.local` の値を変更したら、**`npm run build`（`apps/mobile`ワークスペース）を再実行しない限り反映されない**
- Android実機/エミュレータに反映するには、ビルド後さらに `npx cap sync android`（`apps/mobile` ディレクトリで実行）が必要
- `apps/mobile/package.json` には `dev` スクリプトが存在せず（`build` / `postbuild` / `test` のみ）、現状はbuildしてCapacitor経由で確認する運用になっている

## 5. セットアップ手順

1. `apps/mobile/.env.local` を新規作成する（root の `.env.local` とは別ファイル。`.gitignore` の `.env.local` パターンはパス指定なしのため、apps/mobile配下でも自動的にGit管理対象外になる）
2. 以下を記載する（値はSupabaseダッシュボード → 本番プロジェクト `lfrdzrdmrxmqqwmxmyxx` → Project Settings → API から取得。root用に取得済みの値をそのまま流用可能）

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://lfrdzrdmrxmqqwmxmyxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=（本番anon key）
   ```

3. `apps/mobile` ディレクトリで `npm run build` を実行し、`out/` が生成されることを確認
4. `apps/mobile` ディレクトリから `npx cap sync android` を実行する
5. Android Studio / エミュレータ・実機で動作確認

## 6. 未整備事項（今回のドキュメント化のみで対応、コード変更は範囲外）

- `apps/mobile/.env.local.example` が現状リポジトリに存在しない。root同様にサンプルファイルを用意すると、本ドキュメントの内容がコード上のガードレールとしても機能するようになる（別タスクとして切り出し推奨）。
- `BASE_URL` / `CALLBACK_ORIGIN` のハードコードは、将来的にstaging環境を作る場合はenv変数化の検討対象になる（現時点では本番一本のため不要と判断）。
