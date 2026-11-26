# 抽出メモ: cross-overview-roadmap（overview／roadmap・backlog の素材）（①-2）

作成: 2026-11-26／担当: B10-3／対象: プロダクト概要・差別化・初期の設計判断（壁打ちエディタ設計資料 v2、設計指示書、壁打ち引き継ぎ）、Phase 4 マネタイズ、統合バックログ v3（A、2026-11-17）、`未実装機能.txt`、個別ロードマップ5本（CSP 運用・PWA／Capacitor・pg_bigm・MCP 拡張・GitHub revoke）の断片。出力先の想定は `docs/overview/product.md`・`docs/roadmap/backlog.md`。現在地・日付つき項目は `cross-history.md`、運用は `cross-operations.md`、公開準備（法人・規約・LICENSE）は `auth-and-security-3.md` 判断27、BYOK の将来案は `auth-and-security-3.md` 判断11〜19、モバイルは `mobile.md` を参照し、ここでは繰り返さない。
タグ: 【資料】【コード】（grep で確認）【未確認】。BL3＝統合バックログ v3、CC＝CLAUDE.md。ID は「BL3: F6」のように前置する。
**5つの個別ロードマップは作られたことがない**（inventory §5）。新規に設計せず、資料に残った断片だけを下の「個別ロードマップ断片」に集めた。
**公開リポジトリ向けの注意**: 実値は書かない。所在は `docs/internal/internal-notes-cross-1.md`。

## 確定した判断

判断者は、資料に「Rui 氏決定」とあるものだけ「Rui」。それ以外は「不明」または「提案」。

### プロダクト概要・差別化

1. **コンセプト**: 「思考のログが絶対に消えないAIチャットUI」。AI との対話を1ターンごとに自動保存し、ブラウザを閉じても復元できる個人用の壁打ちツールから始め、将来ビジョンを「思考の GitHub」（個人の壁打ちログを公開・フォーク・評価できるオープンプラットフォーム）とする。完成した知識でなく「考えている途中のプロセス」を共有・引き継ぐ文化を作る。想定用途は小説執筆・論理シミュレーション・アイデア整理。判断者: Rui（2026-03-28、設計資料）。【資料】
2. **差別化**: TypingMind と違い、複数 AI の履歴共有・引き継ぎ（同一スレッドで Claude と Gemini の履歴を共有し再生成で純粋比較）・メモモード・公開スレッド一覧がある／小説執筆特化（プロジェクトモード・キャラ DB・整合性チェック）で作家ユーザーを狙う／出典チップとカード表示で共有された壁打ちログの読みやすさを上げる（Web は実装済み、共有ページでのカード実表示は Rui の確認待ち）。出典: v194。【資料】【コード】（CC に差別化節あり）
3. **ビジネスモデルの原型（2026-03）**: GitHub と同じ構造＝公開は無料、非公開・チーム機能を有料。現在の Phase 4 は別構想で、「おまかせプラン」（クレジット制・月額500〜1,000円）と Stripe 連携、クレジット残量チェック・上限到達時のセルフプラン誘導 UI。土台の `ai_usage_events` は完成済み。**優先度は低めで確定、CC に反映済み**。判断者: Rui（2026-11-17）。Hobby プランは規約上非商用向けのため、課金開始時にプランの話が再燃する。【資料】【コード】（`ai_usage_events` は migration v181）
4. **初期ロードマップ（設計資料 v2、2026-03-28）と現状**: Phase 2（Google ログイン、公開／非公開、システムプロンプト、Markdown エクスポート）、Phase 3（フォーク、いいね、スレッド検索、モデル選択、Vercel デプロイ）、Phase 4（有料プラン、プロフィール、フォルダ整理、画像添付）。**有料プラン以外は実装済み**（`app/` に share・explore・`[handle]`・settings・image 等が存在）。「個人用 MVP から始め、一般公開機能は後」という分割が初期の判断。【資料】【コード】
5. **iOS はグレー**: 「ユーザーが API キーを自分で入力する」設計は App Store 審査で外部サービスへの有料アクセスの迂回と見なされる可能性があり、Android 先行（Google Play $25 一回払い、iOS は $99／年）。対策は「おまかせプラン」の先行実装（mobile.md 判断1）。判断者: Rui（Android 優先）。【資料】

### バックログの決定済み事項（BL3 §6）

6. **F6 再生成の統一（方針決定済み）**: 「上書き再生成」「Claude／ChatGPT で再生成」「⋮メニューの再生成」を、モデルを選べる「再生成」1つの入口に統一する。**同じモデルかつ最後の回答なら上書き（分岐しない、`light`）、それ以外は分岐**。同じモデルの途中の回答は分岐（上書きすると後続が宙に浮く）。「編集して再生成」は従来どおり分岐（`apply_branch_edit`）。クライアントが対象メッセージの provider＋`model_id` と選択モデルの比較で `mode` を決める形なら、サーバー（`isLightRegenerate`）は変えずに済む見込み。モーダルに「上書きします（元の回答は消えます）」／「世界線を分けます（元の回答は残ります）」を明示する。判断者: Rui（2026-11-17）。【資料】【コード】（`app/page.tsx` の `handleRegenerate`、`isLightRegenerate`）
7. **F3 他ツールのメモリ取り込み**: 範囲は他社ツールの**メモリ**のみ（会話履歴の取り込みは F3b として別途検討）。判断者: Rui。【資料】
8. **F4 管理者からも会話を見られないようにする**: 実装時に再検討（今は着手しない）。案は A 運用・規約で縛る／B サーバー側暗号化（KMS 等、運営は復号できる）／C 端末側暗号化の「秘密スレッド」（検索・RAG・自動要約・Dreaming・共有・MCP 等と衝突し、鍵紛失で復元不能）／D サーバー保存しないローカル専用スレッド。どの案でも生成時に `/api/chat` を平文が通る点は変わらない。着手が遅れるほど既存機能との衝突が増える。判断者: Rui。【資料】
9. **Web 検索のソース除外（F2）の骨子**: ①API に除外を渡す＋②サーバーの `normalizeSources` 相当でチップから落とす二段構え。API の除外は実効性が保証されない（OpenAI の `blocked_domains` が一部効かないという報告）。本文のインラインリンクは無改変の方針（D14・D42）で、チップに限るか本文も対象にするかは未決。**API 側の除外だけを信用しない**。判断者: 提案（骨子）。【資料】【コード】（現行は `web_search_20250305` と `{type:"web_search"}` にドメイン指定なし）

### 優先度の考え方

10. **着手順は「後回しにするとリスクが増すもの優先」を軸にする**（PMM post-MVP バックログ v7 で採用）: F6 は先送りするほど `light` 前提のコード（F1 の再特定等）が増えるため早い方がよい。監査由来の優先度ラベル（監査原文の高／中／低）と製品判断としての着手順位は別軸で、「既存機能の欠陥修正（乖離）」と「純粋な新機能（情報のみ）」の性質で判断する（運用A・v194）。提案順（BL3 §5）は S3 観測／S2 の 12/2 確認／F5 と F2／F6／F1 Phase 1／F8・F7 の軽いもの／F9・F3／F4。Rui の承認は未受領。【資料】

CLAUDE.mdに既出: 4項目（コンセプトと本番 URL・現フェーズ、Phase 4 マネタイズ3項目、「低優先・後回し」の一覧、差別化ポイント3項目）。

## 地雷（CLAUDE.mdに載っていないもの）

1. **「前提となる機能が既にある」と思い込まない**: リッチ会話UIの検討で Web 検索機能が存在しないことが実コードの横断 grep で判明し、Lv1 の規模見積もりが変わった。バックログ項目の規模見積もりは実コードの存在確認から始める（v194 運用知見）。【資料】
2. **統合バックログの「正本」列は専用資料**: BL3 は索引で、各トラックの確定仕様は各専用資料（ハイライト v3・リッチ会話UI v12・ゴミ箱 v3・自動要約 v15・Argon v1・モデル刷新 v6）が正本。再編後は各 feature の「未実装・残課題」に移し、backlog.md は索引にする（方針書 §4-1）。【資料】
3. **F6 の副作用**: 違うモデルでの再生成のたびに世界線が増え、既知の「世界線0が複数表示される」（`branch_index` のローカル番号）と Phase B その3（④'''がツリーに出ない・原因未調査）が目につきやすくなる。同時に手当てするか要判断。F1 のハイライトは位置の再特定が必要で、`light`（同じモデルの上書き）・`light` user 編集・単体 PATCH（マスク編集）の3契機が残る。【資料】
4. **F9（複数モデル同時問い合わせ）の難所**: 1スレッド1生成が前提／N 本の `/api/chat` では RAG 検索・embedding が N 回走る／`branch_root_id`・`branch_index`・`message_number` の採番の競合／BYOK で選んだ全 provider のキーが必要／Web 検索・Deep Thinking・リッチ表示が provider ごとに違う。「違うモデルでの再生成＝必ず分岐」（F6）の自然な拡張として、同じ user 発言への兄弟の世界線で持てば新テーブルは不要の見込み。【資料】
5. **F8 は仕様書の前提が古い**: pg_trgm 仕様書は「メッセージ本文検索は将来」とするが、`/api/search` は既に `messages.content` に `ilike` している。3文字未満（日本語の2文字語）に pg_trgm は効きにくく、`messages.content` への GIN はサイズが大きい。方式（pg_trgm／pg_bigm／PGroonga）が仕様書と CC の H-24（pg_bigm）で並立し未決。Supabase での pg_bigm・PGroonga の対応状況は未確認（`search.md` 参照）。【資料】【コード】（`docs/schema.sql` に trgm／bigm の記述なし）
6. **F3 で `extraction_version` を増やすなら**: Dreaming の保護4値（`user_edited`・`user_created`・`liked_ai`・…）の RPC 4本の migration が要る（ハイライト Phase 3 と同じ論点）。取り込み分を区別しないなら新値は不要。【資料】
7. **effort（F7 #4）の注意**: Claude の `output_config.effort` は値を変えるとキャッシュのブレークポイントが無効になる（省略とモデル既定値の明示は同じ扱いでキャッシュは壊れない）。既定値と同じなら body にキー自体を付けない設計なら request body が現行とバイト一致し golden が回帰ガードになる。`max_tokens` 16,000 固定で高 effort は打ち切りリスクが上がる。Gemini 4 は公式が `thinkingLevel` を必須とするが KabeHub は Argon に送らず動いている（実測で確認が要る）。現行コードに `output_config`・`thinkingLevel` の送信はない。【資料】【コード】
8. **料金・モデルの一次情報は二次情報で決め打ちしない**: モデル追加は公式 pricing（Gemini は Standard 表）を直接確認し、lib と shared の2ファイルを同一に保つ。BL3 の Carbon／Hydrogen／GPT-6.1 Terra／GPT-Image-2.6 の価格・ID は二次情報（公式未確認）。【資料】【コード】（これらの ID は `lib/modelRegistry.ts` に無い）

## 未実装・宿題

### バックログ表（roadmap/backlog.md の素材）

状態: 未着手／検討中／別トラック／完了。優先度はバックログ時点の記載（【提案】は Rui の承認なし）。コード確認は 2026-11-26 の grep。

| ID（出典） | 項目 | 状態 | 優先度 | 正本 | コードの有無 |
|-|-|-|-|-|-|
| BL3: F1 | Kindle 的ハイライト | Phase 0 完了、Phase 1 は方針ドラフト未作成（未決1〜6） | 提案: F6 の後 | ハイライト v3（`highlight.md`） | 【コード】`/highlights` ページなし、`app` に「記憶に追加」・`liked_ai` の参照なし（`lib/lore/dreaming.ts` の変換のみ） |
| BL3: F2 | Web 検索のソース除外 | 未着手（設計の骨子のみ） | 小〜中、提案: 早め | 本書 判断9 | 【コード】ドメイン指定なし |
| BL3: F3 | 他ツールのメモリ取り込み | 未着手、範囲決定済み | 中 | 本書 判断7 | 【コード】取り込み UI なし（`app/memory/page.tsx` に取り込みの記述なし） |
| BL3: F3b | 他ツールの会話履歴取り込み | 未検討 | 大、F3 の後 | — | なし |
| BL3: F4 | 管理者不可視（暗号化／ローカル専用） | 実装時に再検討 | 特大 | 本書 判断8 | 【コード】会話は平文保存（暗号化は GitHub トークンと MCP トークンの hash のみ） |
| BL3: F5 | 未実装モデルの追加 | 未着手（5モデルが台帳に未登録）。Claude Fable 5.2（`claude-fable-5-2`、2026-11-09、入力8／出力40）、Gemini 4 Carbon（11-10、12/1から倍額、公式未確認）、Gemini 4 Hydrogen（11-12、1.50／7.50、既定 `gemini-3.8-flash` の候補）、GPT-6.1 Terra（要確認）、GPT-Image-2.6 Sunburst／Flare（11-04） | 小（1モデル1チケット）、12/1 前に Carbon の時限 rule を入れると楽 | 内部モデル刷新 v6（`models-and-pricing.md`） | 【コード】5モデルとも未登録（`lib/modelRegistry.ts`）。`modelRegistry.ts` の `provider:` 行は Claude 15・Gemini 11・OpenAI 15（画像モデル13件・deprecated・hidden を含む。BL3 の13／9／12／画像7と数え方が違う） |
| BL3: F6 | 再生成の統一 | 方針決定済み、実装は事前調査（モバイルの `light` 使用有無、前提テストの本数、golden への影響、`handleRegenerate` の呼び出し元全一覧）から | 中、F1・F9 の前提で早い方が良い | 本書 判断6 | 【コード】`light` 経路は `app/page.tsx`・`app/api/chat/route.ts`・`MessageBubble.tsx`・`RoleplayBubble.tsx` ほか |
| BL3: F7 | 他 API 機能（10候補） | 未着手。軽いのは構造化出力（`extract-settings`）と effort | 項目ごと | 本書 地雷7 | 【コード】構造化出力・`output_config`・`thinkingLevel` の使用なし。`anthropic-beta: prompt-caching-2024-07-31` は送信中 |
| BL3: F8 | 検索機能改善 | 未実施（H-24 と同一） | 小（DB のみ）〜中。「体感で遅くなったら or スレッド1,000件超」 | 本書 地雷5・`search.md` | 【コード】インデックス未作成 |
| BL3: F9 | 複数モデル同時問い合わせ | 未着手 | 大、F6 の後 | 本書 地雷4 | なし |
| BL3: S1・S1b | Next.js 16.4.6 更新と `npm audit fix` | 完了（2026-11-17） | — | — | 【コード】`next 16.4.6` |
| BL3: S2 | Argon の 12/1 料金切替 | コード対応不要、12/2 に実測確認（Rui） | 期限あり | cross-history.md | 【コード】epoch あり |
| BL3: S3 | ゴミ箱 Cron の dry-run 観測→実削除切替 | 観測待ち（期限が過ぎている） | 期限あり | `trash.md` | 【コード】`vercel.json` に Cron あり |
| BL3: S4 | Capacitor の critical 脆弱性2件（→8.5.1 以上） | 未対応、Android 公開前に必須 | 公開前必須 | `mobile.md` | 【コード】`8.5.0` のまま |
| BL3: M1 | リッチ会話UIのモバイル展開（Phase 4） | 未着手 | 低〜中 | リッチ会話UI v12（`rich-conversation.md`） | 【コード】`apps/mobile` に `kabeCard`・出典チップなし |
| BL3: M2 | ゴミ箱 Phase 3C（モバイル） | 未着手。モバイルの×削除も soft delete になるが復元は Web のみ | 中 | `trash.md` | 同上 |
| BL3: M3 | Capacitor の続き | 状態要確認。実際はタスク14 まで完了、Phase 2〜4 が未着手 | — | `mobile.md` | 【コード】 |
| BL3: M4 | `apps/mobile` の Tailwind 警告 | 未対応 | 低 | 統合バックログ | — |
| BL3: O1 | Next.js 月次セキュリティ確認の運用化 | 【提案】、Rui 判断待ち | — | `cross-operations.md` | — |
| BL3: P1 | Phase 4 マネタイズ | 未着手 | 低（Rui 判断済み） | 本書 判断3 | なし（`ai_usage_events` のみ） |
| BL3: P2 | Project Memory Manager 残り（A-1 `folder_name` 残3系統、A-2 structural consolidation、A-3 「＋New Project」UI、A-4 `current_state` topic 作成、C-2〜C-9 Project Home・Sidebar の project 中心化ほか） | 未着手（2026-10-05 時点の記載。以後の変化は未確認）。未決の設計論点: Project Knowledge と Project Memory の検索優先順位、Human edit 後の AI 再整理ルール、Raw Chat RAG の chunk 設計 | 後回しのリスク軸で順位付け | PMM v7（`project-memory.md`） | 【未確認】（folder_name 統一は Phase 5C 完了、threads／project_settings／novel_settings の `folder_name` は残存と v194） |
| BL3: P3 | 自動要約の任意フォローアップ（v15 §6 a〜j） | 任意・低優先 | 低 | `auto-summary.md` | — |
| BL3: L1 | 低優先: 口述筆記（Whisper）、非同期整合性チェック（Responses の Background mode）、世界線ラベルの連番化（F6 で優先度上昇）、Phase B その3、`visibleMessages` の `useMemo`、`parseGithubBlobUrl` のブランチ制限緩和、Arena 人間ターンの送信キー統一、Embedding モデル差し替え、hidden 画像モデルの label、`ResizeObserver`、`ProfilePage.tsx` の英語化文言 | 後回し | 低 | CC の「低優先・後回し」 | 一部は CC に既出（宿題欄） |
| v194 | 小説設定抽出の `max_tokens` 打ち切りの実機確認（現行の Sonnet 5.5＋切り詰め拒否に対して） | 未実施 | 低 | `novel-and-roleplay.md` | 【コード】`da62dd0` の拒否実装（models-and-pricing.md 参照） |
| v194 | 画像生成 Tech Debt（sharp 圧縮・自動削除・Save ボタン・既定 provider 選択 UI）／画像編集（img2img、保留） | 保留 | 低 | `image-generation.md` | — |
| v194 | リッチ会話UIの宿題: 共有ページでのカード実表示の確認（Rui）、Gemini ToS 原文の確認（Rui）、カード本文の見出し・表の頻度実測、要約切り詰めのコードポイント化、CSV export の整形、共有・export への出典、検索の課金・回数表示、provider 別トグル、ストリーミング中のカード描画、一時モードの部分本文喪失 | 未着手・宿題未受領 | 低 | `rich-conversation.md` | — |

### 個別ロードマップ断片（5本は未作成。資料に残った事実だけを集約）

| 名称（CC） | 資料に残る断片 | 状態の判断材料 |
|-|-|-|
| CSP Enforce 切替・運用（H-01） | 切替は完了（B7・B8 参照: 2026-08-10〜13、本番ヘッダーで 2026-11-17 に確認）。BL3 §6#9 は「資料本体がプロジェクトにないため残作業の有無は未確認」。未決: `style-src` の `'unsafe-inline'` 除去（B05a 指示書で別チケット）、CSP レポートの永続化、`Cache-Control`／CDN 検証（`auth-and-security-3.md` 宿題6） | 運用の残作業は未定義 |
| PWA・Capacitor（H-23） | PWA は v185 で実装済み（manifest・アイコン・safe-area）。Android は Capacitor で Google Play 配信が先、iOS は後（審査の BYOK リスク）、`apps/mobile` はタスク14 まで完了（mobile.md）。Android TWA の選択肢が v194 に書かれているが検討の記録はない | `mobile.md` が現状。release 署名・Play 配信は未決 |
| pg_bigm 検索（H-24） | pg_trgm 仕様書（2026-05-30）が近い。方式が未決（本書 地雷5）。バックログ側で優先度「高」維持（B7 判断19） | 方式選定が先 |
| MCP 拡張ツール（H-45） | 現行ツールは `create_thread`・`add_message`・`list_threads` の3つ。後回し項目に `publish_thread`／`add_tag`／`bulk_add_messages` が挙がるのみ（v194 低優先） | 設計の記録なし（`mcp.md` 宿題5） |
| GitHub 側 revoke（H-46） | v178（デスクトップ系統）で個別実装済み、本番・実機確認まで完了。ただし CC は未更新（`github-integration.md` 矛盾1）。残るのは「テスト・本番で同一 OAuth App を共用すると本番の連携も失効する」ため実機検証前に OAuth App を分離する運用 | 実装済み。CC の記述が古い |
| （H-33） Pinned Files 失敗時の UI 通知 | 未実装（console 出力のみ、development 限定） | 低優先 |

## 矛盾・要照合

1. **BL3 の「台帳の件数」と現行**: BL3 は「Claude 13・Gemini 9・OpenAI 12・画像7」、CC の技術スタック表は Claude 12 系列・Gemini 9・OpenAI 11 系列（表記ゆれ）。`lib/modelRegistry.ts` の `provider:` 行の集計は Claude 15・Gemini 11・OpenAI 15（画像13件・hidden・deprecated を含む）で、数え方が資料ごとに違う。changelog／backlog では「台帳の件数」を書かず `modelRegistry.ts` を参照する。【コード】【未確認】
2. **BL3: M3「Task 14-D 以降は状態要確認」**: コードと mobile.md では 14-D まで完了（`ee8c242`＋`9165330`）。BL3 の記述は更新されていない。【コード】
3. **v194「次に実装予定」の `output: "export"` 記述**: Capacitor 導入時の注意として書かれているが、現行 `apps/mobile/next.config.js` は既に `output: "export"`。資料が将来形で書かれたまま。【コード】
4. **BL3 §2-7 #9 と CC のファイル DL の記述**: BL3 は csv／txt の DL を実装済みとし、CC・コードも一致。「まとめ2」は「ファイル DL は未実装」としたまま（BL3 §4#4 が既知の不一致として記録）。【資料】【コード】
5. **`未実装機能.txt` の9項目と BL3 の F1〜F9**: 9項目はそのまま F1〜F9（ハイライト／ソース除外／メモリ移行／管理者不可視／未実装 API「Gemini 4 等」／再生成の統一／他 API 機能／検索改善／同時問い合わせ）。メモの「未実装のAPIの追加（Gemini4等）」は BL3 では F5（Gemini 4 Argon は台帳に登録済みで、Carbon・Hydrogen が未登録）に分解されている。【資料】【コード】
6. **「Hydrogen を既定にするか」と既定モデル**: BL3 は既定を `gemini-3.8-flash` とするが、`getDefaultModel`／Gemini の既定が実際に何かは本メモでは未確認（models-and-pricing.md が正）。【未確認】
7. **inventory の分類（直さない）**: `ご神託_00_コンテキスト共有用`（B、overview）は2026-07 の ChatGPT／Fable との脅威モデル整理で、本文の資産・攻撃者・アルファ版の境界（冒頭と見出しのみ読了）は `auth-and-security-3.md` の BYOK 脅威モデルと重なる。`Fable5_KabeHub_質問リスト_v2`（B）は Fable 5 に聞く項目リストで、バックログの前身。`README.md`（旧、B）は Next.js 14 時代で現行 README との差分が大きい。いずれも backlog の出典としては BL3 に統合済み。

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| 統合バックログ v3 | A | 全文（約53KB） |
| 壁打ちエディタ_設計資料_v2 | A | 全文（ディレクトリ構成・DB・初期ロードマップ・ビジネスモデル） |
| 設計指示書.txt | B | 冒頭（目的・技術・コア機能・スキーマ）のみ |
| 未実装機能.txt | B | 全文（9行） |
| 引き継ぎ資料 v194（差別化・次に実装予定・低優先・トラック別現況） | A | 該当節を読了 |
| ご神託_00／Fable5 質問リスト v2 | B | 先頭2.5KB・見出し一覧のみ |
| 統合バックログ v1・v2 | C | 題名のみ（v3 が置き換え） |
| 壁打ち引き継ぎ資料_20260328／README.md（旧） | B | **未読**（題名のみ。設計資料 v2 と重なる） |
| リポジトリ実ファイル | — | `lib/modelRegistry.ts`（件数・未登録 ID）、`app/` の構成、`app/page.tsx`・`app/api/chat/route.ts` の `light`、`lib/openai-web-search.ts`、`apps/mobile/package.json`、`public/` の構成 |

読めなかった A 資料はない。PMM 残り（P2）は 2026-10-05 時点の記述のため、現状は `project-memory.md` と `auto-summary.md` で再確認が要る。30KB に収めるため削った項目: BL3 §2-7 の効果的な使いどころの表（10候補）の個別注意、F5 の対象外モデルの列挙、付録の外部情報の出典 URL（再編時に旧資料を参照）。
