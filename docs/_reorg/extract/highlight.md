# 抽出メモ: highlight（①-2）

作成: 2026-11-25／対象: ハイライト機能（Kindle 風のメッセージ本文の範囲選択＋任意メモ）。**未実装の検討中の機能**。実装済みなのは Phase 0（`liked_ai` の新規作成口の撤去）だけで、Phase 1 以降の記述はすべて「案」（`message_highlights` テーブル・API・UI はコードにも `docs/schema.sql` にも存在しない。`grep` で `message_highlights`・`CSS.highlights`・`::highlight` は0件）。
タグ: 【資料】／【コード】（実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。
略称: v3＝ハイライト機能 検討 引き継ぎ資料 v3（2026-11-01。v1・v2 は C。v2 と食い違う箇所は v3 が正）、調査＝ハイライト機能 Codex 読み取り調査指示書 v1（2026-11-01。調査の指示書で、結果は v3 に反映済み）。

## 確定した判断

1. **Rui の確定判断（2026-11-01）**: ①**Phase 1 は Web 版のみ**（D1。モバイル `apps/mobile` は別実装で `MarkdownRenderer` も別、自動反映されず、実機の WebView 対応も未確認）②**マスク（`[[text]]`）範囲はハイライト禁止**（D2。共有側の漏洩リスク（P0）を入口で閉じる）③**`liked_ai` は、まず「👍 記憶に追加」ボタンと `/api/lore/like` route の削除のみ**（D3。クリーニング・保護 RPC・既存行は触らない）。出典: v3 §0・§1。判断者: Rui。【資料】【コード】（D3 は実施済み、下記）
2. **D4（案・未承認）**: Phase 1 の対象は Web 版の通常 Bubble（assistant＋YOU）のみ。roleplay・共有ページ・Arena・メモ（`isMemo`）・生成中のストリーミング本文・画像生成メッセージは対象外。D1 の確認時に提案し Rui は「OK」としたが、個別項目の異論の確認は未了。出典: v3 §1。【資料】
3. **Phase 0 実施（コミット `2f2abb4`、main へ push 済み、実機確認済み）**: `MessageBubble.tsx` の `likeStatus`・`handleLike`・「👍 記憶に追加」ボタン、`apiKeyStore` prop と未使用 import、`app/api/lore/like/route.ts`、`lib/proxy-paths.ts` の like の bearer POST、関連テストを削除。13ファイル +16／−356、DB migration・`docs/schema.sql` の変更なし。`npm test` 1840→**1827件**（全件成功、13件減。事前見積りの12件減は誤りで、`proxy-paths.test.cjs` が独自 `test` 関数のため TAP 上は1件のまま、回帰テストを足しても増えない）、`scripts/*.test.cjs` は148→147本。出典: v3 §5-1〜§5-3。【資料】【コード】（`git log` で `2f2abb4` を確認、`app/api/lore/like` は存在しない）
4. **Phase 0 で残したもの**: `cleanLikedAiRecords`／`LIKED_AI_CLEANING_PROMPT`（既存の未処理 `liked_ai` は今後も `liked_ai_cleaned` へ変換される）、保護条件を持つ `_by_project` 系 RPC 4本（`find_similar_lore_pairs_by_project`・`find_similar_lore_pairs_v2_by_project`・`consolidate_dreaming_batch_by_project`・`consolidate_dreaming_batch_multi_by_project`）、`lib/lore/consolidation.ts` と `packages/shared/src/lore/consolidation.ts` の保護判定、`LIKED_AI_DEFAULTS`、既存の `liked_ai`／`liked_ai_cleaned` 行、`/memory` の表示、`/api/threads/[id]/likes`（スレッドの通常いいね。Lore 記憶化とは別機能）、モバイル。出典: v3 §5-4。【資料】【コード】（CC に Phase 0 の撤去と liked_ai の残存が記載）
5. **技術方針（案）**: 位置の保存は文字オフセットでなく Web Annotation 方式の `quote`＋`prefix`＋`suffix`（各約30文字）で保存し、描画後テキストから探し直す（画面テキストと `content` の位置はずれるため）。描画は CSS Custom Highlight API（`CSS.highlights.set`、DOM を変更しないので react-markdown の再描画と衝突しない）、実行時に `'highlights' in CSS` で機能検出し非対応環境は一覧のみ表示。本文だけを囲む境界要素（例: `data-highlight-root`＋message ID）を新設し、コードブロックのヘッダー・`KabeCardView` の badge／meta・出典チップ・メモ UI を対象外にする。出典: v3 §4-1〜§4-3。【資料】
6. **マスク範囲の禁止の実装方針（案）**: 作成時、選択範囲が `content` 中の `[[…]]`（および未閉鎖の `[[` 以降）に重なる場合は保存しない。判定は `maskSecretNotation` と同じ解釈（`packages/shared/src/stringUtils.ts` の正規表現を流用し二重定義にしない）。出典: v3 §4-4。【資料】
7. **`message_highlights` テーブル案**: `id`／`user_id`／`thread_id`（FK cascade）／`message_id`（FK cascade）／`quote`／`prefix`／`suffix`／`content_hash`／`note`／`kind`（色・種別）／`source`（`user`|`ai`）／`visibility`（`private`|`public`）／`provider`／`model_id`／`created_at`／`updated_at`。`kind`・`source`・`visibility`・`provider`・`model_id` を Phase 1 から持つかは**未決**（§8-3）。RLS は `auth.uid() = user_id` かつ `message_id` が `thread_id`／`user_id` の message であることを検証（`message_notes` の穴を引き継がない）、`updated_at` トリガー、v207 の共通関数 `guard_thread_not_trashed` を使う6本目の INSERT ガード。API は thread 配下の個別 route（PATCH＝メモ・色変更が必要なため。factory 拡張は既存利用先の回帰確認が増えるので個別 route が優勢）、GET／POST／PATCH／DELETE すべてで親 thread のゴミ箱確認・message 所属確認・許可フィールド制限、`lib/proxy-paths.ts` に bearer で登録。出典: v3 §4-5。【資料】
8. **Phase 計画（案、すべて未確定）**: Phase 0 完了／Phase 1＝Web 版の通常 Bubble で選択→フローティングツールバー（ハイライト／メモ）→保存→CSS Custom Highlight で描画→スレッド内一覧（マスク範囲は禁止）／Phase 2＝`/highlights` 横断ページ（検索・タグ）、エクスポート（`exportUtils` 流用）／Phase 3＝ハイライト→Lore（新しい `extraction_version`、保護範囲の決定）・根拠リンク・「この箇所について聞く」・文脈から落とさない／Phase 4 以降＝公開ハイライト、AI 提案、フラッシュカード等。Phase 1 の受け入れ条件案: 選択→保存→再読み込み後も同じ箇所に描画、マスク範囲は保存不可、light 上書き再生成後に再特定不能なら「原文が変更された」として一覧に残る、ゴミ箱スレッドでは作成・更新・削除ができない、他ユーザーの message に紐づけられない。出典: v3 §6。【資料】
9. **ハイライトからの学習（Lore）は Phase 3 で設計**: Phase 0 により新規の `liked_ai` は作られない。ハイライト由来の Lore は、新しい `extraction_version`（例 `highlight`）を設計する際に、保護範囲（自動統合のみか、時制更新・ユーザー統合も含むか）とあわせて決める。現行の Lore Book・Memory 検索は `source_type`／`extraction_version` で絞らないため、ハイライト由来の Lore は作れば自然に検索対象になる一方、Dreaming・統合候補から隔離するには保護リストへの追加（RPC 4本の migration）が必要。出典: v3 §5-5。【資料】

## 地雷（CLAUDE.mdに載っていないもの）

1. **既存 `message_notes` の RLS の穴**: `message_id` が指す message と `thread_id`／`user_id` の組が一致するかを検証していない。新表では検証する。`threadResourceCrud`（`lib/threadResourceCrud.ts`）は **GET／POST／DELETE のみで PATCH がない**。message-notes の `buildInsert` は型・長さ・message 所属を検証せず、DELETE は URL の thread ID で対象を絞っていない。v207 の INSERT ガードは INSERT のみで、PATCH／DELETE の親ゴミ箱確認は API 側が必要（factory は POST／DELETE で実施済み）。出典: v3 §3-4。【資料】【コード】（`lib/threadResourceCrud.ts:92` が `return { GET, POST, DELETE }`）
2. **本文が変わる経路と再特定が必要な契機**: light 再生成の成功（ID 維持・本文更新）、light 再生成の**開始前エラー**（ID 維持・エラー文で上書き。`app/api/chat/route.ts:1625-1640`）、light 編集の user 本文、単体 PATCH／マスク編集 UI（`app/api/messages/[id]/route.ts`）は、ID を保ったまま本文が変わるため、位置の再特定が必要。`apply_branch_edit`（元は ID・content 維持で非 active 化）と通常の分岐再生成（新 assistant ID）、thread copy／branch-to／share fork（新 ID、ハイライトは引き継がれない）は元が不変。削除はすべて FK cascade で、ゴミ箱（soft delete）では行が残る。出典: v3 §3-5。【資料】【未確認】（行番号は基準コミット `157ea34` 時点）
3. **共有でのマスク前の漏洩（P0）**: 共有 API は `is_hidden=false`・非 memo・`created_at <= shared_at` で絞り、本文をサーバーで `maskSecretNotation`（`[redacted]`）に置換する。マスク前の `quote`／`prefix`／`suffix`／メモが共有等に漏れるのが P0 リスク。hidden／memo／`shared_at` 外の message の注釈除外、`shared_at` 以降の注釈の扱いは未決。出典: v3 §7・§9。【資料】【未確認】
4. **Custom Highlight API の対応範囲**: TypeScript 5.9.3 の `lib.dom.d.ts` に型があり追加不要。`::highlight()` は CSS ルール指定なので `app/globals.css` に追加（React の要素 style では表せない）。CSP（`style-src 'self' 'unsafe-inline'`）に妨げられる箇所は見つからず、実配信ヘッダー・実端末は未確認。Android の `minSdkVersion=24`・Capacitor 既定の最小 WebView 60（Custom Highlight API は Chromium 105 世代）では対応を保証しない。出典: v3 §3-3。【資料】【未確認】
5. **描画構造の注意**: `MarkdownRenderer` の `CodeBlock` の `textContent` には言語名とコピーボタンの文言（「📋 コピー」「✓ コピー済み」）が混ざる。`SourceChips` は `MarkdownRenderer` の外。メッセージ ID 属性は `id="msg-${msg.id}"` が Bubble 全体の外枠に付くだけで、`data-message-id` は未実装、本文だけを囲む境界要素はない。通常の YOU も Markdown を通らずプレーンテキスト（`pre-wrap`、折り畳みあり）。出典: v3 §2・§3-1。【資料】【未確認】
6. **既存の選択・クリック処理との衝突**: `onMouseUp`／`onPointerUp`／`onContextMenu`／`selectionchange` の使用はなし。本文クリックでメモ入力欄を開く既存動作には選択中ガード（`window.getSelection()` が非折りたたみなら何もしない）あり。調整が必要なもの: コードコピーのフォールバック（textarea を作り `focus()`／`select()`）、⋮メニュー（`position: fixed`、`zIndex: 9999`）、document の `mousedown`／`pointerdown` 外クリック処理、YOU の折り畳み。ネイティブ選択メニュー・タッチ選択ハンドルとの実機での相互作用は未確認。出典: v3 §3-2。【資料】【未確認】
7. **`source_refs` に `highlight` を足すときは配列の末尾に追加する**。自動要約の provenance 判定は配列の先頭要素のみを見る（`classifyRevisionOrigin`→`firstRef(refs)`）ため、先頭に入れると origin 分類が変わる。出典: v3 §7「根拠リンク」。【資料】【コード】（`lib/project-memory/auto-summary-update.ts:25-28`）
8. **新表の登録漏れを検出する汎用テストはない**（v207 の「5本」は過去 migration 自体の検証）ため、新表分の INSERT ガードのテストを追加する。`lib/proxy-paths.ts` への登録は全 method 一致で必須（`scripts/proxy-paths.test.cjs` が検出）。出典: v3 §3-4・§4-5。【資料】
9. **Phase 0 の運用知見**: Codex 指示書の削除範囲は `require` 行だけでなく、その識別子を使う箇所まで grep してから確定する（`thread-trash-resources.test.cjs` の6ケースを ChatGPT が指摘）。prop の撤去は子コンポーネントだけでなく呼び出し元（`ChatPanel.tsx`）まで含める。テスト件数の見積りは、テスト関数の実装（独自ヘルパーの有無）まで確認してから基準にする。出典: v3 §5-5。【資料】
10. **`PATCH /api/lore/like` は現在、汎用の `/api/lore/[id]` に渡り `id="like"` として検索される**。UUID 列への不正値が 404 でなく 500 になる可能性があるが、実際の応答は未検証。出典: v3 §5-5。【資料】【未確認】
11. **Codex／Claude の実行環境**: Codex（Windows）のサンドボックス内では `spawn EPERM`・`rg` の起動失敗等が出ることがあり、`npm test`・`npm run build`・`tsc` は制限外（承認つき）の再実行で通る。Claude 側（Linux）からは `@kabehub/shared`（npm workspaces のリンク）が解決できず一部テストが失敗する（リポジトリの問題ではない）。Codex は作業フォルダ内で Project の引き継ぎ資料を見つけられないため、指示書は本文自己完結にする。出典: v3 §10。【資料】

CLAUDE.mdに既出: 4項目（`/api/lore/like` と「記憶に追加」ボタンの撤去、extraction_version／liked_ai 保護、`proxy-paths` 登録必須、`proxy-paths.test.cjs` の TAP 集計の特性）。

## 未実装・宿題

1. **Phase 1 の方針ドラフト v1**（v3 §11 の次アクション）。最初に決めるのは未決1（本文内ターゲット）。出典: v3 §11。【資料】
2. **v3 §8 の未決事項（Phase 1 方針ドラフトで決める）**: ①Phase 1 の本文内ターゲット（コードブロック本文・表・カード本文・画像またぎ・複数 message またぎを許すか。最小案は同一 message 内・段落テキストのみ）②マスクとの関係の詳細（選択の `content` 上位置への写像方法、後からマスクされた場合の扱い、通常画面での `[[ ]]` の見え方）③テーブル列（`kind`／`source`／`visibility`／`provider`／`model_id`／`content_hash` を Phase 1 から持つか）④API 方式（個別 route か factory 拡張か）⑤タグの持ち方（別表か配列列か）⑥ツールバーの UX（表示位置、`selectionchange` の debounce、既存のメモクリック・⋮メニュー・コピーとの調整、ネイティブ選択メニューとの共存）⑦ハイライト由来 Lore の保護範囲（Phase 3）⑧13項目の Phase 配置と優先順位⑨マネタイズ（AI を呼ぶ拡張をおまかせプランのクレジット消費先にするか）。出典: v3 §8。【資料】
3. **拡張機能 13+1 項目（すべて Phase 配置は未確定）と接続上の注意**: 今日のハイライト／色の意味づけ（`kind`、色覚配慮で色以外の識別子も併用）／根拠リンク（地雷7）／決定ログ／似ているハイライト（`find_similar_lore_pairs_v2_by_project` は `source_type` 条件なしで通常 Lore とのペアも候補になる。専用テーブル／専用 RPC の要否は未決）／文脈から落とさない（`trimContextToWindow` の入力 `ContextMessage` は `role`／`content` のみで message ID がない。呼び出しは `app/api/chat/route.ts` の1か所、cache marker は最大構成で空きなし）／範囲にぶら下がる分岐（`branch-to` の入力は `anchorMessageId` のみ、notes／tags の複製なし）／AI のハイライト提案（Lv2 カード記法との役割重複を要確認）／好み統計（`/api/stats` の正本は `ai_usage_events`、light 再生成で `model_id` が変わるため、ハイライト時点のモデルを列に保存）／設定への昇格（`extract-settings` は種類別の一括 upsert で1項目だけ追記する API はない）／注釈付きの共有（地雷3）／MCP ツール（別 repo、Phase 1 対象外）／Kindle 取り込み（スレッドに紐づかないため別ソース種別・別表が必要）／各種エクスポート（`buildExportContent`。単一 thread の UI export は `visibleMessages`、一括 export は `is_active` 絞りなし）。出典: v3 §7。【資料】【未確認】
4. **Phase 0 後の任意作業**: CLAUDE.md に Phase 0 のコミットハッシュ `2f2abb4` を反映する小コミット（任意）。`PATCH /api/lore/like` の実際の応答の確認（地雷10）。`LIKED_AI_DEFAULTS` の削除（別チケット）。出典: v3 §5-4・§10・§11。【資料】
5. **実装時リスクの継続監視（Codex 評価）**: P0＝マスク前データの露出、`message_id`／`thread_id`／`user_id` の対応検証不足・RLS／ゴミ箱ガードの登録漏れ。P1＝raw Markdown 位置と描画テキスト位置の混同、同 ID 上書き・重複引用・本文変更での再特定誤り、コード操作ヘッダー・出典・カード metadata が対象文字列に混ざる、分岐切替・折り畳み・生成完了・画面切替後の古い Range／Highlight 登録、古い WebView で保存できても描画できない、新 `source_type` だけで Dreaming・検索から隔離できると誤解する。P2＝既存のメモクリック・コピー・固定メニュー・ネイティブ選択 UI との競合、`source_refs` 先頭追加の影響、system 追加分の token 見積り漏れ・cache marker 上限超過、現在の message モデルを使った好み統計の誤集計。出典: v3 §9。【資料】

## 矛盾・要照合

1. **v3 の行番号は基準コミット `157ea34` 時点で、Phase 0（`2f2abb4`）後に変動している**（`MessageBubble.tsx` の325行目以降は約70行前にずれた）。v3 自身が「Phase 1 の指示書では内容で位置を特定すること」と注記。現行コードの行番号とは合わないので参照しない。【資料】【未確認】
2. **CLAUDE.md の機能表との関係**: CC にはハイライトの記載がなく（Phase 0 の撤去のみ）、実装済み機能表にも Phase 0 の行がない。CC の最終更新行は「ハイライトPhase 0」を挙げる。claude-md-corrections.md への追記は必要としなかった（既出の撤去記述が正しいため）。【コード】
3. **方針書 §4-1 の「ハイライト v2」**: 訂正済み（v3）。v3 §7 は「v1 引継ぎ §4 の13項目」に追記した形で、v1 の本文は C のため未読。13項目の元の定義は v3 §7 の表の項目名から推定するしかない。【資料】【未確認】
4. **調査指示書（B）の「回答」は v3 に反映済みで、別途の回答資料は旧フォルダにない**。指示書の項目（A〜G）の調査結果は v3 §2・§3 に集約されているとみられるが、すべてが反映されているかは確認していない。inventory.md の分類（B）は妥当で、②では読まなくてよい。【資料】【未確認】
5. **「`liked_ai` の保護リストにハイライト由来の `extraction_version` を足す」と「`liked_ai` 自体の廃止」の関係**: v3 §5-5 は新規作成を止めたが保護・クリーニングは残したまま。将来 `liked_ai` を完全に廃止する判断は未決（v3「クリーニング・保護 RPC・既存行は後で別途判断」）。【資料】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_ハイライト機能_検討_引き継ぎ資料_v3.md | A | 全文（34KB。§0〜§11、付録は未読） |
| KabeHub_ハイライト機能_Codex読み取り調査指示書_v1.md | B | 見出し一覧＋§0・§1（調査の目的）。調査項目 A〜G の詳細・回答形式・Out of scope は v3 に反映済みのため未読 |
| CLAUDE.md・`lib/threadResourceCrud.ts`・`lib/project-memory/auto-summary-update.ts`・`docs/schema.sql` | — | 既出判定・突合のための grep のみ |

読めなかった A 資料: なし（v3 の付録「参照した主な根拠」のみ未読）。
