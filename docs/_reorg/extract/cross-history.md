# 抽出メモ: cross-history（changelog／status の素材）（①-2）

作成: 2026-11-26／担当: B10-1／対象: 版番号つき引き継ぎ資料（v176・v191・v193・v194）、変更履歴アーカイブ（v133-v140／v160-v172／v171-v181／v182-v190）、`vXXX完了時.txt` 6本、`docs/applied/README.md`、統合バックログ v3 の「現在地」部分。出力先の想定は `docs/history/changelog.md` と `docs/status.md`。運用・環境は `cross-operations.md`、機能の中身は各 feature の抽出メモ、バックログ表は `cross-overview-roadmap.md` を参照し、ここでは繰り返さない。
タグ: 【資料】【コード】（grep／`git log`／ファイル確認）【未確認】。ID は「統合バックログv3: S4」のように資料名を前に付ける。
略称: v176／v191／v193／v194＝`KabeHub_引き継ぎ資料_vNNN`、AR133＝変更履歴アーカイブ v133-v140、AR160＝v160-v172、AR171＝v171-v181、AR182＝v182-v190、BL3＝統合バックログ v3、CC＝CLAUDE.md。
**公開リポジトリ向けの注意**: 実在値は書かない。所在は `docs/internal/internal-notes-cross-1.md`。

## 確定した判断

判断者は、資料に「Rui 氏確認／決定」とあるものだけ「Rui」。それ以外は「不明」。

### 版番号の体系

1. **引き継ぎ資料の版番号（v1〜v194）と migration 番号は別体系**。DB 変更は v175 以降 migration 番号で管理し、台帳は `docs/applied/README.md`。v194 の冒頭が「v194 は資料の版番号で `migration_v19x` とは無関係」と明記。資料の版番号は2026-11-01 の v194 が最後で、**以後は版を増やさず `docs/status.md` を更新する運用に移る**（方針書 §7）。判断者: Rui（方針書の決定）。出典: v194 冒頭・方針書。【資料】
2. **v177・v178 は2台の PC で別内容が並行採番された**（v179 で発覚・統合済み）。デスクトップ系統: v177＝Gemini 3.7 Flash 追加／v178＝D群9件仕分け＋H-46。ノート PC 系統: v177＝Claude Opus 5 組込み＋Thinking 全面再設計／v178＝監査A・B・C の進捗反映（ドキュメントのみ）。**実コードは両系統とも本番にマージ済み**で、反映漏れは資料だけ。番号は振り直さず「（別ブランチ）」と明記して時系列順に AR171 へ統合。時系列は、ノート PC の v177（Opus 5、2026-07-28 以前）がデスクトップの v177（Gemini 3.7 Flash、2026-08-14 頃）より古い。判断者: 不明。出典: AR171 冒頭。【資料】【コード】（`lib/modelRegistry.ts` に `claude-opus-5`・`gemini-3.7-flash` が共存）
3. **引き継ぎ資料は「スリム版」へ切り出す運用**: v176 以降、変更履歴の詳細をアーカイブに退避し、本編には現況・地雷・次の着手だけ残す。v182（2026-08-16、コードなし）が v171〜v181 の約360行を AR171 へ、v191 が運用知見を「運用知見アーカイブ v178-v191」へ、v192 が横断原則を本編へ統合。本編の「既知の地雷」節は v192 以降 CC と重複するため削除済み（v193・v194 は CC に無い節だけ）。判断者: 不明。【資料】
4. **欠落資料は `vXXX完了時.txt` 6本と前後の版で補う**: v124・v125・v135・v167＋168・v172・v189 の本体は存在しない。6本は各セッション最終回答の抜粋（v124＝v124 SQL 確定版、v125＝`match_lore_embeddings_v2` 作成完了と Codex 指示文、v135＝`temporal_status` 自動更新の説明、v167＋168＝入力欄自動伸縮・サイドバー折り畳み・メッセージ中央寄せ、v172＝`MessageBubble` のドロップダウン化と資料更新の要約、v189＝内部モデル刷新 v4 への反映作業ログ）で、仕様の正本にはしない。欠番（v7・v10・v11・v12・v14）は初期でそもそも作られなかったと推定。出典: inventory §5。【資料】

### 日付つきの変更履歴（changelog 素材。詳細は各 feature メモ）

5. **v133〜v140（2026-06）**: Memory Summary UI→archive 修正→`temporal_status` 自動更新→類似記憶統合候補→ユーザー承認つき統合→自動 Dreaming→統合履歴 UI・ロールバック→3件以上統合と batch-train の user 限定（AR133）。CC の履歴表と一致（lore-rag.md）。【資料】
6. **v160〜v173（スマホ・入力欄 UI）**: AR160。詳細は `chat-ui.md`。v167・v168 は1つの完了時 txt にまとまっている。【資料】
7. **v174〜v181（2026-07〜08）**: v174 Claude Sonnet 5／v175 は本資料更新のみ（コード変更なし）／v176 GPT-5.6 系・Gemini 3.6 Flash・3.5 Flash-Lite 追加と C-02（gpt-5.5-pro の Arena）解消／v177・v178 は判断2／v179 `ai_usage_events`（Claude／OpenAI／Gemini のキャッシュ課金・画像4社・`gemini-2.5-pro` の 200K 超 tier・`thoughtsTokenCount`）／v180 リポジトリ直下の不要物整理（`{app` 誤生成ディレクトリ、`temp_*.txt`、`supabase-schema.OBSOLETE.sql` を `docs/archive/` へ）／v181 `ai_usage_events` を canonical schema へ統合（テスト環境での存在確認済み）。出典: AR171。【資料】【コード】（`docs/archive/supabase-schema.OBSOLETE.sql` が存在）
8. **v182〜v191（2026-08-16〜10-21）**: v182 資料整理／v183 監査総括とのクロスチェック（旧ロードマップ A／B／C 単体は総括付録と完全一致で重複のみ、CSP Enforce 切替・D群仕分け・`app/test-login/` の記述を最新化、Next.js 16.3.0 が技術スタック表に未追従だった漏れを発見）／v184 Arena コスト計測（`request_type: "arena"`、保存失敗時も `message_id: null` で記録）／v185 H-23 PWA（`app/manifest.json`・`app/icon.png`・`app/apple-icon.png`、マスコット「カベハブくん」）／v186 裏モデル棚卸し＋GPT-6 Astra・Claude Fable 5.1・Gemini 3.8 Flash 追加／v187 Arena モデル選択式化と `playerIndex`／v188 小説設定抽出を `claude-sonnet-4-6`→`claude-sonnet-5`／v189 `scripts/lore.test.cjs` 修正（RPC 移設時のテスト後始末漏れ、`63fb02a`）／v190 Lore 内部モデルを `gpt-4o-mini`→`gpt-5.6-luna`（`715ee11`）／v191 分岐ツリーに provider・モデル名表示と `lib/messageDisplay.ts` 共通化（`2a1ed22`、`npm test` 638→667件）。出典: AR182。【資料】【コード】
9. **v192〜v194（2026-10-22〜11-01）**: v192＝運用知見の統合、v193＝ゴミ箱化の反映（Phase 1〜4、migration v207、PR #1、マージ `a883349`、2026-10-23〜25）、v194＝リッチ会話UI Lv1／Lv2 の実装結果（〜2026-11-01）。以後の主な変更は版番号を持たず、CC の最終更新行・`git log`（776 コミット、最終のコード変更は 2026-11-17 の Next.js 16.4.6／`npm audit fix`）が履歴。出典: v194・BL3。【資料】【コード】
10. **migration 番号と機能の対応は `docs/applied/README.md` が台帳**（`migration_v119`〜`v207` と `v78`・`v89`・`v141c`・`v175` の旧形式、`docs/applied/` の `migration_v*.sql` 46本と README 表の `migration_v` 行数46が一致（ほかに `migration_rls_cleanup_p0.sql` と旧形式4本））。Project Memory 系は v182〜v206（Phase A〜E、昇格 v200〜v203、チャット注入 v204、一括削除 v205、自動要約 cursor v206）、ゴミ箱は v207。【コード】
11. **直近の確定事項（2026-11-17、Rui）**: Phase 4 マネタイズは優先度低め（CC に反映済み）／iPhone 実機確認は完了／Next.js は 16.4.6 へ更新し本番確認済み／F6（再生成の統一）の挙動ルールと F3（メモリ取り込みの範囲）は決定済み、F4（管理者不可視）は実装時に再検討（バックログの決定事項は `cross-overview-roadmap.md`）。出典: BL3 §6。【資料】

CLAUDE.mdに既出: 5項目（`docs/applied/` の運用、版番号と migration 番号の関係の一部、`docs/schema.sql` が正本であること、Phase 3 完了・Phase 4 未着手のフェーズ表記、バージョン別の実装済み機能表（v132〜v207））。

## 地雷（CLAUDE.mdに載っていないもの）

1. **「v178」は3通りに読める**: CC の履歴表の v178＝migration（メッセージ分岐復元 RPC）、引き継ぎ資料のデスクトップ系統 v178＝D群仕分け＋H-46、ノート PC 系統 v178＝監査状況の反映。CC の BYOK 節の「v178 で `CSP_REPORT_ONLY=false`」は引き継ぎ資料のデスクトップ系統（2026-08-13 のセッション）を指すと読める（auth-and-security-2.md 矛盾6 の解決材料）。資料を引用するときは「引き継ぎ v178」「migration v178」と種別を書く。【資料】
2. **同一番号でも内容が違う資料が複数ある**: v30・v63 は重複番号（inventory §6 #16）、v177・v178 は判断2。「新v178」（2026-08-14 更新）が正本で、旧 v178 と v178（07-28 版）は内容同一の旧版。【資料】
3. **旧フォルダの `完了時.txt` は仕様の根拠にしない**: 最終回答の抜粋で、コード・SQL の貼り付けや指示文が主。v124 の SQL のように後続の migration（`docs/applied/`）と食い違いうる。【資料】
4. **引き継ぎ資料の「技術スタック」表は陳腐化しやすい**: Next.js の版数は v183 で 16.3.0 と 16.2.11 の食い違いを発見、v194 でも「CLAUDE.md は 16.2.11、実測 16.3.0」とした。現行 `package.json` は `16.4.6`。履歴を書くときは、版数の出典を `package.json`・`package-lock.json` に置く。【資料】【コード】
5. **テスト件数は時点の値**: v191＝`npm test` 667／`test:all` 699、v194＝1840（リッチ会話UI完了時）、CC＝1827（2026-11-01 Phase 0 で13件削除後）、バックログ v3＝1827 成功（Next.js 更新前後で同数）。changelog には「時点つき」でだけ書く。【資料】【コード】
6. **v191 のテスト基準は CRLF 起因の1件失敗を含んでいた**（`auto-summary.ts` の作業ツリー側 CRLF、Git 上は LF）。ベースライン取得を指示に含める運用の由来。詳細は `cross-operations.md`。【資料】

## 未実装・宿題

1. **`docs/history/changelog.md` の作成**: v1〜v194 の版番号と migration 番号の対応表、主要コミット1行ずつ。素材は CC のバージョン別表（v132〜v207）、AR133／AR160／AR171／AR182、`docs/applied/README.md`。v1〜v131 は CC 表の「〜v131」1行しかなく、旧資料（C 扱い）を読まないと詳細は作れない。【資料】
2. **`docs/status.md` の作成**: 下の status 候補表を起点にする。再編後は引き継ぎ資料の代わりにここを更新する（方針書 §7）。【資料】
3. **v167・v168・v172・v189 などの空白期間の補完**: 完了時 txt で粒度は足りる。v7・v10・v11・v12・v14 は欠番のまま。【資料】
4. **CC の最終更新行に `7dbee1b`・`68144bb` が未反映**（BL3 §4#12）: CC の現行の最終更新行は 2026/11/17 ハイライト Phase 0 から始まる記述で、Next.js 16.4.6 の更新は技術スタック表側にだけある。【コード】【資料】
5. **旧 Vercel プロジェクト `kabehub-prototype-6lud` の整理**（PR のたびに×表示になる）: 未着手。【資料】
6. **プライバシーポリシーの更新（7日間のゴミ箱保持）と `thread_tags_name_check` の schema 反映**: 未着手。`thread_tags_name_check` は現行 `docs/schema.sql` に見当たらない（grep 0件）。【資料】【コード】

### status.md 候補: 日付つき項目

| 日付 | 項目 | 内容・状態 | 出典 | コードでの確認 |
|-|-|-|-|-|
| 2026-12-01 00:00 UTC | Gemini 4 Argon の料金切替 | 〜11/30 は入力 2.00／キャッシュ 0.10／出力 10.00、12/1〜は 4.00／0.20／20.00（出力は思考トークン込み）。公式確認済み（2026-11-17）。コード変更は不要。12/2 に Rui が `ai_usage_events` の `model_id='gemini-4-argon'` を時系列に並べ、金額が約2倍になっているか確認。UTC か Pacific かは未確認（最大8時間差）。導入価格が適用されないという開発者フォーラムの報告あり | BL3 S2 | 【コード】`lib/modelRegistry.ts`・`packages/shared/src/modelRegistry.ts` の epoch `2026-12-01T00:00:00.000Z` |
| 2026-12-31 → 2027-01-01 | Gemini 3.6／3.7／3.8 Flash の導入価格終了 | 0.75／3.75 → 1.50／7.50。`gemini-3.8-flash` の `features.novelCheck.estimatedInputPerMTok` は epoch に連動せず固定 0.75 のため、2027-01-01 以降は 1.50 への手動更新が要る（models-and-pricing.md 地雷3） | BL3 §2-5、AR182 v186 | 【コード】`modelRegistry.ts` 140・144・148 行付近に `2027-01-01` の epoch、`features.novelCheck` を持つエントリは3件（2.5 Flash・2.5 Pro・3.8 Flash） |
| 〜2026-11-25（過ぎている） | ゴミ箱 Cron の dry-run 観測 | 本番デプロイは 2026-10-25。ゴミ箱のスレッドが7日を超えてから `[thread-trash-purge-cron]` で候補数を確認し、問題なければ `THREAD_TRASH_PURGE_DRY_RUN=false` で再デプロイ。**Hobby の runtime logs は保持1時間**のため、Cron（毎日 17:00 UTC＝02:00 JST）直後の1時間以内に見るか、`CRON_SECRET` 付きで手動実行して直後に見る。手動実行の前に変数が `"false"` でないことを確認。現在の本番値は未確認 | BL3 S3、v194 | 【コード】`vercel.json` の `0 17 * * *`、`.env.local.example` は `THREAD_TRASH_PURGE_DRY_RUN=true` |
| 月次（毎月初） | Next.js のセキュリティリリース確認 | `npm ls next` と `npm audit` を照合する運用案。16.3.3 の後に 16.4.x への更新が3回続いた教訓 | BL3 O1【提案】 | 【コード】現行 `next` は `16.4.6` |
| Android 公開前 | Capacitor の critical 脆弱性2件（`@capacitor/android`・`@capacitor/ios` の 8.5.0 以上 8.5.1 未満。内部 HTTP プロキシ経由でオリジンにリモートコンテンツを読み込める） | 未対応。Web・本番には影響しない。最小は 8.5.1。`apps/mobile-shell-poc` も同バージョン | BL3 S4 | 【コード】`apps/mobile/package.json` は `@capacitor/android 8.5.0`、`apps/mobile-shell-poc` が追跡済み（59ファイル） |
| 未定 | Supabase トークンのリフレッシュの長時間運用確認 | Task12 実機確認で未検証 | mobile.md 宿題8 | 【未確認】 |
| 2026-10-05 以降 | 「Lore Book への添付検索」の再開条件 | Rui が頻度が高いと感じたとき（chat-core.md 判断9） | chat-core.md | — |

### status.md 候補: 現在地

- **フェーズ**: Phase 3 完了（RAG／Memory 一区切り）／Phase 4（マネタイズ）未着手で優先度低め【資料】【コード】（CC）。
- **直近の完了（日付つき）**: リッチ会話UI Lv1／Lv2（〜2026-11-01）、ゴミ箱化 Phase 1〜4（2026-10-23〜25）、ハイライト Phase 0（「👍 記憶に追加」と `/api/lore/like` の撤去、2026-11-17、`2f2abb4`）、Next.js 16.4.6 更新と本番確認（2026-11-17、`7dbee1b`・`68144bb`）、CSP の本番 Enforce 確認（2026-11-17）、iPhone 実機確認（2026-11-17）。【資料】【コード】
- **着手中**: ドキュメント再編（方針書 2026-11-25、①抽出メモ B1〜B10）。コード側の着手中項目は資料時点で無し。【資料】
- **次の着手候補（Rui 判断待ち）**: BL3 §5 の提案順＝S3 観測／S2 の 12/2 確認／F5 モデル追加とF2 ソース除外／F6 再生成の統一／F1 ハイライト Phase 1／F8・F7 の軽いもの／F9・F3／F4。詳細は `cross-overview-roadmap.md`。【資料】
- **`apps/mobile`**: Capacitor 化のタスク14 まで完了、Phase 2 以降・リッチ会話UIのモバイル展開・ゴミ箱 Phase 3C は未着手（mobile.md）。【資料】【コード】

## 矛盾・要照合

1. **`STORAGE_CLEANUP_DRY_RUN` の本番値**: v194 は「`delete` モード（直近30日で候補0件）」と書く（ゴミ箱の資料を出典）。B6（auth-and-security-1.md 宿題2）は「資料からは分からない」。コード側（`.env.local.example` は `true`、実装は `"false"` 完全一致のときだけ削除）では「`delete`」という値は存在しない。**v194 の記述は「削除モード（`false`）」の意味かもしれないが、変数の値としては不整合**。本番の実値は【未確認】。
2. **v194 の「CC は 16.2.11 表記」と現行 CC**: CC の技術スタック表は現在 16.4.6 に更新済み（BL3 §4#7）。資料は古い。【コード】
3. **v194 の「現在の課題」にあるテスト件数 1840 と CC の 1827**: 前者はリッチ会話UI完了時（2026-11-01 の B2 後）、後者はハイライト Phase 0 で 13 件削除後。同一時点ではない。【資料】【コード】
4. **BL3 は `origin/main = 68144bb` 基準**。現行の `git log` 先頭は docs のコミット（B8・B9 の抽出メモ）で、アプリコードの最終変更は `68144bb`。ただし `docs/` の変更は含むので、「コードが変わっていない」の確認は `app/`・`components/`・`lib/` に限る。【コード】
5. **引き継ぎ資料 v191 と v194 の「監査の横断残タスク」**: v191 は4項目を挙げるが、v194 は「v191 時点の記載、現況は未再確認」。D-04・D-06 は対応済み（B6：`lib/storage-path-guard.ts`・`lib/mcp-token-hash.ts`）、Route Handler の Cookie 書き戻し横断監査は解消済みとみられる（B6 矛盾4）、D-13 の再突合は未確認。【資料】【コード】
6. **inventory の分類（直さない）**: ①引き継ぎ v177〜v193（B／一部 A）は変更履歴アーカイブと重なり、v191・v193 を A にするより AR182 を A に格上げするほうが効率的だった。②`セッションログ_20260607_v133`・`壁打ち引き継ぎ資料_20260328` は history／overview の起点としては薄い。③`docs/applied/README.md`（A）は表の構成が機械的に作れるため、changelog では参照にとどめられる。

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| 引き継ぎ資料 v194 | A | §1〜§4・「直近の変更」・「現在の課題」・「次に実装予定」・運用知見を読了。技術スタック表は現行と照合 |
| 引き継ぎ資料 v191／v193／v176 | A | 見出し一覧のみ。v193 は v194 に取り込み済みの差分（リッチ会話UI前の状態）、v191 の運用知見は運用アーカイブ・v194 に転記済み、v176 は AR171 にほぼ収録 |
| 変更履歴アーカイブ v182-v190（AR182） | B | 先頭（バージョン分岐の説明を含む AR171 の冒頭も）、v182・v183、実装済み機能一覧（v154〜v191）、付録の横断残タスク |
| 変更履歴アーカイブ v171-v181（AR171）／v160-v172（AR160）／v133-v140（AR133） | B | 見出し一覧のみ（AR171 は冒頭のバージョン分岐の節を読了）。個別バージョンの詳細は各 feature のメモで読み済み（chat-ui・models-and-pricing・lore-rag） |
| 完了時 txt 6本（v124・v125・v135・v167＋168・v172・v189） | B | 各冒頭700字 |
| 統合バックログ v3 | A | 全文（現在地・日付項目・§3・§4・§6 を本メモ、項目表は `cross-overview-roadmap.md`） |
| `docs/applied/README.md`／`ls docs/applied`／`git log` | A | 表の行数（46）とファイル数（46）の照合、先頭部のみ読み |
| 引き継ぎ資料 v177〜v190・新v178・2026-08-10〜13 の4本・セッションログ v133 | B | **未読**（題名のみ。AR171／AR182・総括で内容は代替できる見込み） |

読めなかった A 資料はない。v177〜v190 の個別資料と v191 の本文（97KB）は見出しのみのため、細部（各バージョンのコミットハッシュ、地雷の経緯）は AR171／AR182 の記述に依存する。changelog に書く直前に、CC の履歴表と `git log --oneline` で個別に確認する。
