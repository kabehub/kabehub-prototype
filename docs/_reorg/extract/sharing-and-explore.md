# 抽出メモ: sharing-and-explore（①-2）

作成: 2026-11-25／対象: 公開スレッド一覧（`/explore`、`/api/explore`）、共有ページ・フォーク・マスク（`/share/[token]`）、公開・未ログイン閲覧の認証境界。
タグ: 【資料】／【コード】（実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。
略称: cursor＝explore_cursor注入対応 引き継ぎ資料 v1（2026-10-27）、mw＝middleware_explore対応 引き継ぎ（2026-07-20。auth-and-security にも紐づくが、本ファイルで読み、auth-and-security 側では参照のみ）。この機能の A／B 資料はこの2本のみ（共有ページ・フォーク・マスクの専用資料はなく、`share/[token]` の記述は CC と highlight・rich-conversation の資料に限る）。`proxy.ts` の認証境界は CC に表があるので重複して書かない。

## 確定した判断

1. **`/api/explore` の `sort=popular`／`sort=trending` のカーソル注入を修正（2026-10-27、コミット `2fb1649 fix: explore cursor injection hardening`）**。経緯: 2026-10-22 に外部の個人から（自社の静的スキャナの宣伝を末尾で自認する）セキュリティ指摘メールが届き（2026-10-27 に Rui が共有）、指摘内容は実コードで再現条件が確認でき正確だった。返信は必須ではなく、GitHub ユーザー名などの個人情報は渡さない方針。判断者: Claude の分析＋Rui の確認。出典: cursor §1・§3。【資料】【コード】（`git log` で `2fb1649` を確認）
2. **脆弱性の内容**: `serviceRoleClient()` で `threads` を検索しており RLS が効かない状態で、`parseSortCursor()` が `cursor_at` と `id` の中身を検証せず `.or()` のフィルタ文字列に直接連結していたため、カンマ・括弧を含む値で任意の条件を追加できた（追加条件は `threads` の任意の列を参照でき、`select` に含まれない列も含む）。`.eq("is_public", true)` は残るため読み取りのみ・公開スレッドに限定。ブール・オラクルとして、`allow_prompt_fork = false` の公開スレッドの system prompt を1文字ずつ推測しうるシナリオ（`threads` に `system_prompt` 列があるか、実際に抽出できるかは未検証）。`newest` 分岐は RLS 付きクライアントで `public_threads_view` を引き、カーソルは `.lt("created_at", cursor)` に渡すだけなので影響なし。出典: cursor §2。【資料】【コード】（`app/api/explore/route.ts:82` に `serviceRoleClient()`、`:133` に `public_threads_view`）
3. **修正内容**: `parseSortCursor` を厳格化（`likes_count` は `Number.isSafeInteger`、`cursor_at` は ISO 8601 timestamptz の厳格な正規表現（小数秒は最大6桁、末尾は `Z` または `±HH:MM`、末尾に改行等を許さない `(?![\s\S])`）、`id` は UUID 正規表現）。**`cursor_at` は `Date` に通さず検証のみで元の文字列を使う**（DB が返すマイクロ秒精度が丸められるとページ境界で行の重複・欠落が起きるため）。不正なカーソルは `serviceRoleClient()` の生成・クエリ実行より前に `400 {"error":"invalid cursor"}`。500 時のレスポンスは固定メッセージ `Failed to fetch threads`（詳細は `console.error` のみ）。`newest` 分岐のクエリ・成功レスポンスは無変更（byte 一致を確認）。テストは `scripts/explore-cursor.test.cjs`（新規・216ケース）。出典: cursor §3。【資料】【コード】（`route.ts:30`〜`:46,79,171`、`scripts/explore-cursor.test.cjs` の存在）
4. **事前調査と検証**: Codex の読み取り調査で、`app/api` 72ファイルのうち、リクエスト由来の値を文字列連結して `.or()`／`.filter()` に渡す箇所は explore の1箇所のみ。`npm test`（ネットワーク遮断下）1,224件全件成功、`tsc` エラーなし、本番確認（2026-10-27 11:04 JST）で `curl "…/api/explore?sort=popular&cursor=x"` が `HTTP/1.1 400`・`{"error":"invalid cursor"}`。出典: cursor §4。【資料】
5. **恒久策は別タスク**: `SECURITY DEFINER` の型付き RPC（例 `get_public_threads_sorted(p_sort text, p_likes int, p_at timestamptz, p_id uuid, p_limit int)`）か `public_threads_view` に `likes_count` を追加し、このルートから service role を外す。運用ルールとして、リクエスト由来の値を `.or()`／`.filter()` の文字列に連結する場合は、値の厳格な検証（型・正規表現・UUID）を必須にする。出典: cursor §6。【資料】【コード】（`docs/schema.sql` に `get_public_threads_sorted` は無く、`route.ts:82` は現在も `serviceRoleClient()` を使う）
6. **`/explore` の未ログイン表示不良（2026-07-20、B-01 の本番確認中に発見）**: 未ログインで `/explore` を開くと公開スレッドが一切出ない。原因は `middleware.ts` の `matcher` が `/api/` 配下のうち `mcp`・`share`・`reports`・`auth/github/callback` 以外をすべて保護対象にしており、`/api/explore` が未ログインで `/login?next=…` へリダイレクトされて JSON でなく HTML が返っていたこと。route 側のコードは `user` が null でも動く設計で、B-01 自体の実装不備ではなく別レイヤーの既存問題。出典: mw「症状」「原因（推定）」。【資料】
7. **mw で得られた教訓**: 「未ログインでも使える設計の API ルートを新設・変更するときは、route.ts 側だけでなく認証プロキシの `matcher`／除外リストが同じ意図で通しているかをセットで確認する」（S22.5 の作業記録に既にあった教訓）。調査の観点は、①発生時期の切り分け（`git log` で `middleware.ts` の履歴）②同種の見落としの横断確認③修正方針の確定（案1: `/api/explore` を除外リストに追加）④回帰確認（未ログインで `/explore` の全ソート・`/[handle]`、ログイン時のいいね、`/settings` が引き続き `/login` へ）。出典: mw「対応方針の選択肢」「次回セッションで最初に確認すべき事項」。【資料】【コード】（現行は `proxy.ts` の `isPublicOptionalAuthApi` が `/api/explore` を未認証通過させ（CC の認証境界表に既出）、`lib/proxy-paths.ts` の分類と `scripts/proxy-paths.test.cjs` が全 route×method を検証）

## 地雷（CLAUDE.mdに載っていないもの）

1. **`/api/explore` の popular／trending は service role で `threads` を検索しており RLS が効かない**。カーソル等のリクエスト由来の値を文字列に連結する変更を入れると、再び注入が成立する。新しい検索条件を足すときは、型・正規表現・UUID の厳格な検証を必須にする。出典: cursor §2・§6。【資料】【コード】（`route.ts:82`）
2. **`cursor_at` は `Date` に通さず元の文字列で渡す**（マイクロ秒精度の丸めでページ境界の重複・欠落が起きる）。`?cursor=`（空文字）は修正前は「カーソルなし」で通ったが、修正後は 400。出典: cursor §3・§5。【資料】【コード】（`app/explore/page.tsx:373` は `if (cursor) params.set("cursor", cursor)` で、空の `cursor=` は付けない）
3. **不正なカーソルを `serviceRoleClient()` の生成より前に弾く**順序を保つ（検証→400→クライアント生成）。500 のレスポンスに `queryError.message` を返さない（固定メッセージのみ）。出典: cursor §3。【資料】【コード】
4. **`newest` 分岐は RLS 付きクライアント＋`public_threads_view`**、popular／trending は service role という二重構造。片方だけ直すと整合が崩れる。出典: cursor §2。【資料】【コード】（`route.ts:133` と `:82`）
5. **作業手順の教訓（git）**: `git pull origin main` は現在のブランチが `main` でないときに実行すると、現在のブランチが `origin/main` に fast-forward される。作業開始時に `git branch --show-current` を確認し、`main` で作業するなら `git checkout main` してから pull する。`git push origin main` は手元の `main` を push するので、手元の `main` が古いと non-fast-forward で拒否される（`git push origin HEAD:main` で意図したコミットのみ反映）。出典: cursor §7。【資料】

CLAUDE.mdに既出: 3項目（`/api/explore` が `getOptionalRouteUser`・`isPublicOptionalAuthApi` で未認証通過・認証境界の表・新 Route の `API_AUTH_CLASSIFICATIONS` 登録）。

## 未実装・宿題

1. **Rui のブラウザ確認**: `https://www.kabehub.com/explore` で人気順・急上昇の切替と「もっと見る」（次ページ）が正常に動く（正常なカーソルが弾かれていない）こと。結果は資料にない。出典: cursor §6。【資料】【未確認】
2. **Vercel ログの確認**: 過去の `/api/explore` リクエストに悪用の痕跡（`cursor` に `system_prompt`、`like.`、`)`、`,` 等）がないか（ログの保持期間内に限る）。出典: cursor §6。【資料】【未確認】
3. **恒久策（service role を外す RPC／view 化）**: 未実施（地雷1・判断5）。出典: cursor §6。【資料】【コード】
4. **任意**: 外部の送信者への返信（礼のみで足り、個人情報は渡さない）。出典: cursor §6。【資料】
5. **mw の確認項目の結果記録**: 発生時期の切り分け、`/api/explore` 以外に同様の見落としがないかの横断確認、修正後の検証4項目は、資料には結果の記録がない（現行は `proxy.ts` に移行済みで解消とみられる）。出典: mw。【資料】【未確認】

## 矛盾・要照合

1. **cursor §5 の「`app/explore/page.tsx` が空の `cursor=` を付けていないか未確認」**: 現行コードは `if (cursor)` で付けない（`:373`）。解消済みとみられる。【コード】
2. **mw の `middleware.ts`**: 現行は Next.js 16 の `proxy.ts`（CC）。資料側が古いのでここには書かない。【資料】
3. **inventory.md の分類の確認事項**: 方針書 §4-1 に `sharing-and-explore.md` の出典が挙がるが、共有ページ（`/share/[token]`）・フォーク・マスクの専用資料は旧フォルダに無く（A／B は上記2本のみ）、`share/[token]`・`fork` は CC の API 表・認証境界表と、rich-conversation・highlight の資料の断片（共有 API のサーバーマスク `[redacted]`、`shared_at` の意味）に限られる。②では CC とコードを主な根拠にする。直していない。【資料】
4. **cursor の本番確認の記録に時刻が「11:04 JST」とあるが、当日のコミットの時刻との整合は未確認**。【資料】【未確認】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_explore_cursor注入対応_引き継ぎ資料_v1.md | A | 全文（8KB） |
| KabeHub_middleware_explore対応_引き継ぎ.md | A | 全文（6.5KB） |
| CLAUDE.md・`app/api/explore/route.ts`・`app/explore/page.tsx`・`proxy.ts`・`docs/schema.sql` | — | 既出判定・突合のための grep のみ |

読めなかった A 資料: なし。
