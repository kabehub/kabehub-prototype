# KabeHub ドキュメント再編 方針 v2（2026-11-25）

作成日: 2026-11-25
基準: `origin/main` = `68144bb`（11/17以降、アプリのコードは変わっていない）
状態: **方針確定**（§8 の決定を反映）。§6 の手順①から別セッションで始める。

**v1からの変更点**: §8 の決定事項（Rui確認済み）を反映。旧資料の欠落分が見つかったため §1 の棚卸し数値を更新。リポジトリは公開と確定し、非公開情報は `docs/internal/`（gitignore・ローカルのみ）に置く（§3・§5・§9-6）。Projectは再編後に旧版を削除し、ClaudeCode／Codexがローカル・GitHubの資料を読む方式に一本化（§7・§9-4）。機能変更コミットでのfeatureドキュメント更新は、再編の初日から適用（§7）。

想定する流れ:
- ① Claude: 棚卸しと、機能ごとの「抽出メモ」の作成（旧資料の読み込みを含む）
- ② Codex: 抽出メモとコードを元に新ドキュメントを執筆
- ③ Claude: ②の内容をコードと旧資料に照らしてチェック
- ①と③は、claude.aiのセッションでも**Claude Codeでも**実施できる（§6 冒頭）

---

## 1. 現状の棚卸し（2026-11-25時点）

### 1-1. 資料の置き場所は3つある

| 置き場所 | 期間 | 量 | 中身 |
|-|-|-|-|
| `C:\Users\ruima\kabehub-old-docs`（フラット、サブフォルダなし） | 2026-03〜11 | 632ファイル・約23MB（Project資料81本のうち本方針書以外をすべて複製済み＋不足分の追加分を含む） | 引き継ぎ資料 v1〜v176（約190本）、分岐UI・RAG・UIリデザイン・スマホ・監査A対応ロードマップ（19本）、公開準備タスク v2〜v6、full-audit A〜I（本文＋巨大ログ）、ご神託00〜02、設計メモ、トラブル対処の備忘録など |
| claude.ai Project「KabeHubプロトタイプ作成」 | 2026-09〜11 | 81本（旧フォルダに全て複製済み。移行後に削除予定） | 引き継ぎ v191／v193／v194、トラック別資料（自動要約 v1〜v15、Lore昇格 v4〜v13、チャット参照元 v1〜v10、リッチ会話UI v1〜v12、ゴミ箱 v1〜v3、内部モデル刷新 v5〜v6、Argon v1、ハイライト v1〜v2、統合バックログ v1〜v3 ほか）、アーカイブ2本 |
| リポジトリ（`kabehub-prototype`） | 現行 | `CLAUDE.md` 約139KB、`docs/` 約943KB（SQL・監査ログ含む） | `CLAUDE.md`（現行の正本）、`docs/schema.sql`・`storage.sql`・`applied/`（migration台帳）、`docs/audit/`、`api-key-flow-inventory.md`、各種レポート（未追跡の `thread-trash-phase2a/2b-report.md` を含む） |

**Claude Code移行の観点**: Claude Codeが直接読めるのは3番目（リポジトリ）だけ。Projectの資料は読めない。つまり**今の資料の大半（Project 81本）は、移行しない限りClaude Codeから見えない**。

### 1-2. 問題点

1. **同じ事実が何か所にも書かれ、ずれている**。例: Next.js の版数（CLAUDE.md・v194・実物で3通りあった）、`MarkdownRenderer` のマスクの説明、CSP の状態。直すたびに複数ファイルを手で揃えている。
2. **`CLAUDE.md` が肥大化している（約139KB）**。索引・仕様・地雷・変更履歴・テスト表が1ファイルに同居している。Claude Codeは起動時に全文を読み込むため、毎セッションのコンテキストを大きく消費する。
3. **版番号のファイルが増え続ける**。`_v1〜_v15` のように全版が残り、どれが最新か・どれが統合済みかはファイル名で判断するしかない。Claude Codeがgrepすると旧版が混ざって誤読する。
4. **番号体系が2つ混在している**。引き継ぎ資料の版番号（v1〜v194）と migration 番号（v175以降）。
5. **欠けていた資料の追跡結果（2026-11-25）**。
   - 後から見つかり旧フォルダへ追加済み: 総括引き継ぎ（08-09／08-16版）、変更履歴アーカイブ v171-v181、Project Memory Manager 設計検討、Lore昇格ルール v8、ハイライト v3、pg_trgm 仕様書（2026/05/30）、APIメモ（その1・その2・概要）、`vXXX完了時.txt`（チャット最終回答の抜粋であり、引き継ぎ資料の本体ではない）。
   - **作られたことがない**ものとして扱う: CLAUDE.md が参照する5本のロードマップ（CSP Enforce切替・運用／PWA・Capacitor／pg_bigm検索／MCP拡張／GitHub revoke）。内容は `roadmap/backlog.md` にコードと統合バックログから再構成する（§8-4）。
   - **本体が今も存在しない**もの: 引き継ぎ資料 v124・v125・v135・v167・v168・v172・v189 の本文、引き継ぎ資料 v7・v10・v11・v12・v14（欠番。v1〜v175はCのため影響小）、Project Memory Manager 設計検討 v3、`SA_oss_roadmap_v2.md`（`SA_oss_m1_audit_v1.md` が参照しているが存在しない）。`vXXX完了時.txt` の抜粋と前後の版・変更履歴アーカイブで補う。日付は前後ファイルの更新時刻から推定（v167／168 のみ 6/24〜6/28 の幅あり）。
6. **「決まったこと」と「検討の経緯」が混ざっている**。確定した判断（D1〜D80 など）は各トラック資料の中にあり、機能をまたいで探せない。
7. **リポジトリに一時レポートが溜まっている**（`docs/task12-handoff.md`、`thread-trash-phase*-report.md`、folder_name の実装報告など）。現行仕様か履歴かが区別されていない。

---

## 2. 基本方針

1. **正本はリポジトリの `docs/` に置く（確定）**。
   - Claude Code・Codexが直接読み書きでき、手順②がそのまま成立する。
   - `git diff` で手順③のチェックができる。
   - 版番号はファイル名に付けない。履歴は git が持つ。
2. **1つの事実は1か所に書く**。他の場所からはリンクするだけにする。
3. **コードと矛盾したらコードが正**。資料の記述は、コードで確認できたものだけを「現行仕様」として書く。確認できなかったものは「未確認」と明記するか、出典つきで「決定事項」の側に置く。
4. **「仕様（今どう動くか）」「判断（なぜそうしたか）」「履歴（いつ何をしたか）」を分ける**。
5. **旧資料は消さない**。旧フォルダは読み取り専用のアーカイブとして残し、新ドキュメントの各節に「出典」を残す。
6. **CLAUDE.md は「毎回読む必要があるものだけ」に絞る**。機能の詳細は `docs/features/` へ移し、CLAUDE.md には索引と横断ルールだけを残す。
7. **Claude Codeが「迷わず・必要な分だけ」読める作りにする**（§9）。コードを触るときに該当ドキュメントへたどり着けること、1ファイルを全部読まなくても要点が取れることを設計条件にする。

---

## 3. 新しい構成案

```
CLAUDE.md                  … スリム版（目安 15〜25KB）。起動・鉄則・指示フォーマット・開発ルール・横断の地雷・「どのコードを触るときにどのdocを読むか」の索引表
AGENTS.md                  … Codex用の薄いファイル。CLAUDE.mdへのポインタ＋Codex固有の共通ルール（§8-3、作成する）
.claude/
  rules/                   … パス連動ルール（任意・§9-2）。特定ディレクトリを触るときだけ該当featureの「地雷」を読ませる
docs/
  README.md                … 索引。「何を知りたいときにどれを読むか」＋「コードのパス→featureファイル」対応表
  status.md                … 現況ダッシュボード（引き継ぎ資料 v19x の後継。各機能の状態・次の着手・宿題）
  overview/
    product.md             … 目的・差別化・フェーズ・ターゲット
    architecture.md        … 全体構成、データの流れ、chat の system ブロック構成、認証境界の概要
    glossary.md            … 用語集（Lore／Memory／Project Memory／topic／revision／世界線／light／branch／昇格／Dreaming など）
  features/                … 1機能1ファイル（§4）
  operations/
    dev-workflow.md        … Claude／ChatGPT／Codex／Claude Code の役割分担、方針ドラフト→指示書→レビューの流れ、git・Windows・CRLF の注意
    environments.md        … 本番／テストDB、環境変数、Vercel（Hobby・Cron・ログ保持）、デバイス別の起動方法
    testing.md             … npm test／test:all／tsc、golden の考え方、verify-*.mjs の扱い
    runbooks/              … 手順書（Cron の実削除切替、schema cache、Googleログインループ、Supabase 法人移行 など）
  roadmap/
    backlog.md             … 統合バックログ v3 の後継（未実装機能・残件の一覧。詳細は各 feature へリンク）
  work/                    … 検討中トラックの作業資料（方針ドラフト・Codex指示書）。Projectから移す先（§9-4）。完了したら archive へ
  history/
    changelog.md           … 版番号 v1〜v194 と migration 番号の対応、主要コミット（1行ずつ）
  schema.sql / storage.sql / applied/   … 現状維持
  audit/                   … 現状維持（監査レポート）
  security/api-key-flow-inventory.md   … 現行の docs/api-key-flow-inventory.md を移動
  internal/                … **非公開の運用情報**（キー類の保管場所、内部手順メモなど）。`.gitignore` 対象・ローカルのみ（§9-6）
  archive/                 … リポジトリ内の一時レポート類（task12-handoff、thread-trash-phase2a/2b-report 等）を移す
  _reorg/                  … 再編作業用（inventory／extract／conflicts／source-map）。再編完了後に archive へ
```

---

## 4. 機能ドキュメント（`docs/features/`）

### 4-1. ファイルの分け方（コードの構成から）

| ファイル | 範囲（主なコード） | 主な出典 |
|-|-|-|
| `chat-core.md` | `/api/chat`、ストリーミング（Promise Bridge）、system ブロックと prompt cache、context window、rate limit、queryText 契約 | CLAUDE.md、チャット参照元 v10、Pinnedキャッシュ化 v1 |
| `models-and-pricing.md` | `modelRegistry`、pricing、Thinking／effort、内部モデル、`ai_usage_events`、`/stats` | 内部モデル刷新 v6、Argon v1、v176、モデル追加チケット |
| `branching-and-regenerate.md` | 分岐・世界線・再生成（light／branch）・編集再生成・分岐ツリー・新しいチャットに分岐 | 分岐履歴レールUI v1〜v7、分岐ツリー v8〜v9、PhaseA5/PhaseB 資料、codexBranchingMode 実装メモ、再生成二重発言バグ |
| `chat-ui.md` | ChatInput／ChatInputCentered、送信キー、サイドバー、スマホのレスポンシブ | スマホ対応 v166、変更履歴アーカイブ v160-v172、UIリデザイン v1〜v3 |
| `rich-conversation.md` | Web検索・出典チップ・カード記法・リッチ表示モード | リッチ会話UI 統合 v12（D1〜D80） |
| `threads.md` | スレッド・タグ・メモ・下書き・カレンダー・メッセージ操作 | 引き継ぎ資料各版 |
| `trash.md` | ゴミ箱（soft delete）・purge Cron | ゴミ箱 v3、`docs/thread-trash-*` レポート |
| `search.md` | `/api/search`、explore の検索、今後の pg_bigm／PGroonga | 統合バックログ v3 §2-8 |
| `export.md` | エクスポート（TXT／MD／CSV／ZIP）、コードブロックDL | CLAUDE.md、B1 |
| `sharing-and-explore.md` | 共有（スナップショット）・公開・フォーク・explore・いいね・通報・プロフィール | explore cursor 注入 v1、middleware/explore 対応 |
| `lore-rag.md` | Lore、batch-train、Embedding、検索計画、統合・Dreaming、temporal status | RAG 設計メモ v142以降 01〜04、RAG Temporal 版 v2、v133〜v141、lore-refactoring-notes |
| `project-memory.md` | Project・topic・revision・DL/UL・AI編集・整理・チャット注入・一括削除・Lore 昇格 | PMM v26（欠番 v1・v3）、Lore昇格 v13、チャット参照元 v2〜v10、folder_name 統一 |
| `auto-summary.md` | 初回生成（bootstrap）・差分更新・cursor | 自動要約 v15 |
| `github-integration.md` | OAuth、Pinned Files、Tool Loop | github_* 資料、GitHub連携メモ、連携トラブルシューティング |
| `mcp.md` | MCP トークン・API・別repo の MCP サーバー | codex_mcp_handover、MCP認証エラー調査メモ |
| `arena.md` | AI闘技場 | 内部モデル刷新（Arena 選択式化） |
| `image-generation.md` | 画像生成・アルバム・Storage | 画像入力対応メモ、gpt-image-2.5 の判断 |
| `novel-and-roleplay.md` | 小説Project、novel_settings、設定抽出、整合性チェック、なりきりモード | 小説執筆モード実装方針、ジャンル分類設計メモ |
| `auth-and-security.md` | 認証、`proxy.ts` の境界、`next` 復帰、CSP、BYOK、Storage ガード、アカウント削除 | 監査A対応ロードマップ（最終版）、B-05a、セキュリティ強化記録、認証改善メモ |
| `mobile.md` | Capacitor（`apps/mobile`）、PWA、モバイル未対応機能の一覧 | `docs/mobile-env-setup.md`、task12/13a、Task 14-D |
| `highlight.md`（計画中） | ハイライト（F1） | ハイライト v3（旧フォルダに v3 を追加済み） |

未実装の機能（F2・F3・F6・F9 など）は、関係する feature ファイルの「未実装・残課題」に書き、`roadmap/backlog.md` からリンクする。単独ファイルは、実装に着手した時点で作る。

### 4-2. 各ファイルの固定テンプレート（Claude Code向けに先頭を強化）

```
---
feature: <ファイル名の stem>
status: 実装済み／一部実装／計画中
verified: YYYY-MM-DD（コミット xxxxxxx）
code_paths:            # この機能の主なコード（glob可）。パス→docの対応表と存在確認に使う
  - app/api/chat/**
  - lib/chat-system-blocks.ts
---
# <機能名>

## 30秒要約            ← 先頭30行以内。挙動・主要ファイル・「触る前に知るべき地雷TOP5」だけ。ここだけ読めば着手できる粒度
## 概要（ユーザーから見た挙動）
## 主要ファイル（route／lib／component／test。行番号は書かない）
## データ（テーブル・カラム・RPC・migration 番号）
## 仕様・契約（不変条件、エラー写像、上限値とその正本の定数名）
## 既知の地雷
## 確定した判断（日付・判断者・理由・出典。D番号があれば維持）
## 未実装・残課題（backlog の ID へリンク）
## 履歴（主要コミット1行ずつ。詳細は changelog へ）
## 出典（旧資料名と節）
```

---

## 5. 執筆ルール（Codex 向け。手順②の指示書にそのまま入れる）

1. **根拠を区分する**:【コード】実ファイルで確認／【資料】旧資料の記載のみ／【実測】Rui か Codex の実環境確認の記録／【未確認】。仕様・契約の節は原則【コード】だけで書く。
2. **資料とコードが矛盾したら**、コードの内容を書き、`docs/_reorg/conflicts.md` に「資料名・記述・実際・判断」を1行追記する（本文で矛盾を解決しない）。
3. **行番号は書かない**。ファイル名・関数名・定数名で参照する。数値の上限は「値＋正本の定数名」で書く（例: 8,000字＝`PROJECT_MEMORY_CHAT_MAX_CHARS`）。
4. 日付は絶対日付。「最新」「今回」「次回」などの相対表現は使わない。
5. 1ファイルの目安は30KB以内。超える場合は機能を分割する（分割案を先に出す）。
6. **情報を落とさない**。旧資料の「確定した判断」「地雷」は、統合して消す場合も `docs/_reorg/source-map.md` に「どこへ移したか／なぜ捨てたか」を残す。
7. 旧資料の文章をそのままコピーしない。ただし数値・識別子・エラーコードは正確に写す。
8. `CLAUDE.md` は**最後に**スリム化する（feature ドキュメントが揃ってから、移した内容を消してリンクに置き換える）。
9. アプリのコード・テスト・migration には触れない（ドキュメントのみの変更）。commit・push は Rui が行う。
10. **（追加）各featureの先頭に frontmatter（`code_paths`）と「30秒要約」を必ず付ける**（§4-2）。見出し名はテンプレートどおりに固定し、勝手に変えない（grepと部分読みのため）。
11. **（追加）相対リンクは `docs/` 起点のリポジトリ内パスだけを使う**。Projectのファイル名や claude.ai のURLを本文に書かない（Claude Codeから開けない）。
12. **（追加）リポジトリは公開**。公開側の `docs/` には、APIキー・トークン・DBパスワード・service role key、非公開の内部URL、非公開の個人情報を書かない。必要な場合は `docs/internal/` に書き、公開側には「`docs/internal/…` を参照（ローカルのみ）」とだけ書く。テストDBのref（テストデータのみ）と公開メールアドレス（`admin@kabehub.com`）は書いてよい（Rui判断、2026-11-25）。
13. **（追加）機能を変更するコミットでは、該当する `docs/features/<機能>.md` を同じコミットで更新する**（§7）。再編の途中でもこの規則を適用する。

---

## 6. 進め方（①②③の詳細）

**実施場所の更新**: ①（棚卸し・抽出メモ）と③（チェック）は、リポジトリと旧資料フォルダの両方を読める**Claude Code**でやるのが自然。コードのgrep・`git diff`・ファイル存在確認がそのまま使えるため、③の精度が上がる。claude.aiのセッションでも可能だが、デバイス接続経由になり遅い。②はCodex。Claude Codeには `--add-dir` 等で旧資料フォルダ（リポジトリ外・約23MB）を読ませる想定（旧資料をリポジトリに入れると重いので入れない）。

### 手順① Claude: 棚卸しと抽出メモ

**①-1 棚卸し表**（`docs/_reorg/inventory.md`）
旧フォルダ632本（Project複製分を含む）＋リポジトリの docs を1行ずつ並べ、次の列を付ける。

| 列 | 内容 |
|-|-|
| ファイル名・期間 | |
| 種類 | 引き継ぎ／トラック資料／方針ドラフト／Codex指示書／実装報告／監査／ログ／備忘録／その他 |
| 対象機能 | §4-1 のファイル名（複数可） |
| 扱い | **A 精読**（その系列の最新版・単発の設計資料）／**B 拾い読み**（判断や地雷の有無だけ確認）／**C 読まない**（旧版・ログ・重複） |

読む量の目安（ファイル名と見出しから判断した見込み）:
- **C 読まない**: 引き継ぎ資料 v1〜v175（v176 が後継）、監査A対応ロードマップの中間版18本（最終版の B-05b完了版だけ読む）、公開準備 v2〜v5、`full-audit-*-log.txt`（9本、巨大なログ）、リポジトリと重複する `full-audit-*.md`、`(1)` が付いた重複ファイル、Project の各トラックの旧版（最新版が「統合した」と明記しているもの）
- **A 精読**: v176、v194、各トラックの最新版、`CLAUDE.md`、単発の設計・調査資料（RAG設計メモ01〜04、PhaseA5 の解決ロジックまとめ、小説執筆モード方針、ジャンル分類、Next16 アップグレード、セキュリティ強化記録、ご神託00〜02 は B 扱いで判断だけ拾う）
- 見込みでは、精読は全体の1〜2割に収まる。

**①-1b Projectの資料をローカルへ出す**（新規）
Claude Codeから読めるよう、A・Bに分類したProject資料（最新版中心、約20〜30本の見込み）を、`docs/_reorg/project-export/` などにエクスポートする。Projectの資料は `project_read` で取得できるので、claude.aiのセッションでRuiの承認のもと書き出すか、Rui側でダウンロードしてもらう。**C（旧版）は出さない**。

**①-2 機能ごとの抽出メモ**（`docs/_reorg/extract/<feature>.md`）
§4-1 の機能ごとに、A・B の資料から次の項目だけを抜き出す。
- 確定した判断（日付・判断者・出典）
- 地雷（CLAUDE.md に載っていないもの）
- 未実装・宿題
- 資料どうしの矛盾、コードと照合が要る箇所

コードとの照合は②で Codex が行う。①ではコードを網羅的に読まない（読むのは、抽出の判断に要る箇所だけ）。
1セッションで全機能を終えようとしない。目安は**1セッション4〜6機能**で、`chat-core`・`branching`・`project-memory`・`lore-rag` のような資料の多い機能から先に進める。

**①-3 Codex 指示書**
§5 のルール＋対象機能＋読むファイル（抽出メモ・コード）＋受け入れ条件を、バッチごとに作る（1バッチ3〜5機能）。

### 手順② Codex: 執筆

バッチの順番の案:
1. `docs/README.md`・`overview/`・`operations/`（横断の土台）
2. 資料の多い機能（chat-core／branching-and-regenerate／project-memory／auto-summary／lore-rag）
3. 残りの機能
4. `status.md`・`roadmap/backlog.md`・`history/changelog.md`
5. `CLAUDE.md` のスリム化（＋ `AGENTS.md`、＋任意で `.claude/rules/`）

各バッチで `inventory.md` の「扱い」と `source-map.md` を更新させる。

### 手順③ Claude: チェック

バッチごとに次を確認する。
- **仕様の正確さ**: 【コード】と書かれた記述をサンプリングして実コードと照合する（特に上限値・エラー写像・順序の契約）。
- **情報の欠落**: 抽出メモの「確定した判断」「地雷」がすべて新ドキュメントか `source-map.md` に行き着くか。
- **重複**: 同じ事実が2つのファイルに書かれていないか（`grep` で上限値・定数名を横断検索する）。
- **リンク切れ・`code_paths` の実在**: 相対リンクと、frontmatter の `code_paths` が実在するか（Claude Codeならスクリプトで機械的に確認できる）。
- **テンプレート準拠・サイズ**: 30KB 以内か、30秒要約が先頭にあるか。
- **（追加）Claude Codeでの読みテスト**: 新しいセッションで「chat の system ブロックに項目を足したい」など実際の作業を投げ、CLAUDE.md の索引から正しいdocへたどり着き、必要な地雷を拾えるかを確認する。
- `conflicts.md` の各行について、どちらを正にするかを Rui に確認する。

---

## 7. 運用ルール

- **再編の初日から適用**: コードを変えるコミットでは、該当する `docs/features/<機能>.md` を同じコミットで更新する。featureドキュメントが未作成の機能を触る場合は、その機能の抽出メモ（`docs/_reorg/extract/`）を先に作るか、触った内容を `docs/status.md` に1行残す。この規則は再編を待たず、今のCLAUDE.mdの「開発ルール」に1行で追記する。
- 版番号つきの引き継ぎ資料（v195…）は作らない。セッションの引き継ぎは `docs/status.md` の更新で済ませる。
- 検討途中の方針ドラフト・Codex 指示書は、Claude Code運用に移ったら `docs/work/` に置く（Projectに置くとClaude Codeから見えないため）。claude.ai側で作った場合も、確定時に `docs/work/` へ移す。
- 実装が終わったトラックの「確定した判断」は feature ドキュメントへ移し、`docs/work/` の作業資料は `docs/archive/` へ移す。
- **Projectの資料は再編完了後に削除する**（旧フォルダに全複製済み）。以後、Claude Code／Codexがローカルの `docs/` とGitHubを読んで更新する方式に一本化する。Projectを残す場合も指示文に「正本はリポジトリ `docs/`」と書くだけにし、写しは置かない。
- （任意・別チケット）`scripts/` に docs の機械チェック（リンク切れ・`code_paths` 実在・CLAUDE.md サイズ上限）を追加し、`npm test` に載せる。再編本体（docsのみ変更）とは分ける。

---

## 8. 決定事項（Rui確認済み、2026-11-25）

| # | 項目 | 決定 |
|-|-|-|
| 1 | 正本 | リポジトリの `docs/` |
| 2 | 公開範囲 | リポジトリは**公開**。運用寄りの非公開情報は `docs/internal/`（gitignore・ローカルのみ） |
| 3 | `AGENTS.md` | 薄く作る（CLAUDE.mdへのポインタ＋Codex固有の共通ルール） |
| 4 | 欠落資料 | 5本のロードマップはコードと統合バックログから `roadmap/backlog.md` に再構成。見つかった資料は旧フォルダへ追加済み（§1-2） |
| 5 | 未追跡レポート | `docs/thread-trash-phase2a/2b-report.md` を `docs/archive/` へ移してコミット。未追跡の `artifacts/`・`apps/.idea/` は `.gitignore` 追加を検討 |
| 6 | Project旧版 | 再編後に削除。以後はClaude Code／Codexがローカル・GitHubの資料を読んで更新 |
| 7 | ハイライト v3 | 解決済み（旧フォルダにある） |
| 8 | 開発との並行 | 並行する（Next.js 16.4.6 へ更新済みで脆弱性対応の緊急性なし）。機能を触るコミットでのfeatureドキュメント更新は再編の初日から適用（§7） |
| 9 | ①・③のClaude Code実施 | 方針どおり可（旧フォルダを追加ディレクトリとして読ませる）。実施時にRuiが設定 |
| 10 | `.claude/rules/` | 任意・再編本体の後に判断。導入前に公式仕様を確認 |

### 8-A. 残るフォローアップ（再編と並行・別チケット）
- **公開済みの運用情報（対応不要）**: テストDBのref・`admin@kabehub.com` が公開リポジトリに載っているが、前者はテストデータのみ、後者は公開メールアドレスのため、Ruiが影響なしと判断（2026-11-25）。移動・履歴書き換えはしない。ただしキー類（anon／service role／DBパスワード）が同じ場所に載っていないかは、再編の棚卸し時に1回確認する。
- **`docs/internal/` は端末間で同期されない**: ノートPCとデスクトップPCで使う場合は、手動コピーなど別の手段が要る（§9-6）。

---

## 9. Claude Code運用の設計（新設）

### 9-1. CLAUDE.md は「入口」に徹する
- Claude Codeは起動のたびに CLAUDE.md を全文読む。現状139KBは毎回のコンテキストを大きく圧迫するので、**15〜25KB**を目標にする。
- 残すもの: 起動コマンド、git鉄則、指示フォーマット（Goal／Constraints／Acceptance criteria）、開発ルール、横断の地雷（force push 禁止、新Route追加時の登録 など）、**「触るコード→読むdoc」の索引表**、docs更新の規則。
- 外すもの: 機能別の仕様・地雷・API表・テスト表・変更履歴。すべて `docs/features/` へ。
- `@docs/...` によるインポートは、起動時に展開されて結局コンテキストを消費するため**使わない**。索引から「必要なときにReadさせる」方式にする。

### 9-2. 触るコードに応じて地雷だけ自動で読ませる（任意）
- `.claude/rules/` に、機能ごとの「既知の地雷」だけを短く置き、対象パスを指定すると、そのパスのファイルを扱うときだけ読み込まれる仕組みがある（`paths` 指定のルール）。例: `app/api/chat/**` を触るときに chat-core の地雷TOP5を読ませる。
- 地雷の正本は feature ドキュメントに置き、rules側は「30秒要約の地雷TOP5」へのポインタ＋数行にとどめる（二重管理を避ける）。
- 導入前に公式ドキュメントで現行の書式・挙動を確認する（§8-10）。

### 9-3. 1ファイルを丸読みしなくても済む作り
- 各 feature の先頭に「30秒要約」と frontmatter の `code_paths` を置く（§4-2）。
- 見出し名をテンプレートで固定し、Claude Codeが `grep` と部分読み（行範囲指定）で必要な節だけ取れるようにする。
- `docs/README.md` に「コードのパス → featureファイル」の対応表を置く。CLAUDE.md の索引はこの表への1行リンクにして二重管理を避ける。

### 9-4. 作業資料の置き場（Projectからの移行）
- 今Projectに置いている「方針ドラフト・Codex指示書・トラック引き継ぎ」は、Claude Codeからは見えない。再編後は `docs/work/` に置く運用へ切り替える。
- Projectの資料は再編完了後に削除し、Claude Code／Codexがローカルの `docs/` とGitHubを読む方式に一本化する（§7・§8-6）。

### 9-5. 繰り返す手順はスキルにする（再編後・任意）
- 「モデル追加の手順」「migration の書き方と適用後の移動」「docs更新のチェック」のように毎回同じ手順になるものは、`.claude/skills/` に切り出すとClaude Codeが必要なときだけ読む。まず docs に手順を書き、頻度が高いと分かったものから後でスキル化する（再編の範囲外）。

### 9-6. 公開リポジトリとの兼ね合い（確定）
- リポジトリは公開。非公開にしたい運用知見（キー類の保管場所、内部手順メモなど）は、`.gitignore` した `docs/internal/` に置く。Claude Codeはローカルの `docs/` 全体を読めるので作業上は困らない。
- 作業の最初に `.gitignore` へ `docs/internal/` を追加する。
- **別デバイスでは同期されない**。ノートPC／デスクトップPCの両方で使う場合は、手動コピーなどの手段を決める。
- 書き方のルールは §5-12。
