# 抽出メモ: chat-ui（①-2）

作成: 2026-11-25／対象: チャット画面の見た目・配色・ヘッダー、入力欄（送信キー）、サイドバー、モバイル表示、フォントサイズ、外部 AI によるコードレビュー（過去 Fable 回答）。
タグ: 【資料】／【コード】（実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。
略称: UI v3＝UIリデザイン引き継ぎ v3（2026-04-08。v1 は 04-07）、スマホ v166＝スマホレスポンシブ対応 引き継ぎ 20260624_v166（2026-06-24。無印〜(1)付きは C）、Fable1／Fable2＝過去Fable回答その1／その2（外部 AI のコードレビュー回答。日付は資料にない）。
**注**: スマホ v166 は mobile（Capacitor／モバイル専用実装）にも紐づく。本ファイルでは Web のスマホ表示（chat-ui 側）だけを扱い、アプリ化の技術比較・ロードマップ（資料の「将来のスマホアプリ化」）は mobile の抽出で扱うため読んでいない。Fable1 の指摘はほぼ `app/api/chat/route.ts`（chat-core／auth-and-security）で、chat-core.md・後続の auth-and-security で扱う。

## 確定した判断

1. **UI の目標**: Claude.ai のデフォルト感を脱却し KabeHub 独自のアイデンティティを確立する。参考は Notion（ミニマル・白・落ち着いた）。最優先はチャット画面（バブル→ブロック形式）とサイドバー配色。アクセント `#c4622d`（オレンジ）・`MarkdownRenderer.tsx`・フォント（Lora／DM Sans／JetBrains Mono）は変更しない（紫 `#7c3aed` はサイドバーのアクセントのみ）。出典: UI v3「デザイン方針」「変更しないもの」。【資料】
2. **サイドバーは E 案（ライトモード・ピュアホワイト）で確定**（当初のダーク紫の案A は不採用）。サイドバーとチャットエリアが同じ白で、境界線1本で区切る。CSS 変数（`app/globals.css`）: `--paper`／`--sidebar-bg`＝#ffffff、`--sidebar-border-color`＝#ebebeb、`--sidebar-active-bg`＝#f3f0ff、`--sidebar-active-border`＝#7c3aed、`--sidebar-active-color`＝#5b21b6、`--sidebar-muted-color`＝#888888、`--sidebar-btn-bg`＝#f7f7f7、`--sidebar-btn-border`＝#e8e8e8、`--chat-bg`＝#ffffff、`--border`＝#e8e8e8。アクティブスレッドは薄紫背景＋紫の左ボーダー＋濃紫のタイトル色、ホバー背景 `#f7f7f7`、`boxShadow` なし。出典: UI v3「サイドバー」。【資料】【コード】（`app/globals.css:212-213` に `--sidebar-border-color`／`--sidebar-active-bg`）
3. **メッセージはバブル形式からドキュメント型ブロック形式へ**: 外側 div の `alignItems` を `flex-start` に統一（左右振り分けを廃止、`alignRight` を削除）、バブルは `width:100%`・`maxWidth:720px`・`borderRadius:8px`・`boxShadow:none`。You は `#f7f7f5`＋`1px solid var(--border)`＋`borderLeft: 4px solid var(--accent)`＋`paddingLeft: 14px`（オレンジの左ボーダーで視覚的に区別）、AI は `#ffffff`＋`1px solid var(--border)`、メモは `#fefce8`＋`1px solid #fde68a`（黄色を維持）。ロールラベルは左揃え。`MessageBubble` の `React.memo` は維持。出典: UI v3「チャット画面」。【資料】【コード】（`components/MessageBubble.tsx:462,510,516` に `maxWidth: "720px"` と `#f7f7f5`、`:1370` に `export default memo(MessageBubble)`）
4. **ヘッダーのボタンは常時4つに絞り、残りは「···」ポップオーバーへ**: 常時表示は「🌐公開中／🔒非公開」「🤖プロンプト」「📝メモ」「···」。ポップオーバーに当時入れたのは、この会話をコピー・タイトル編集・APIキー・TXT／MD／CSV・一時モード（アクティブ時は黄色背景で「⚡ 一時モード中 ✓」）・下書き。外クリックで閉じるオーバーレイは `position: fixed; inset: 0`（`absolute` ではなく `fixed`＝スクロール位置に関わらず全画面を覆う）。`showMoreMenu` state を `ChatPanel.tsx` に持つ。出典: UI v3「ヘッダーボタン群の整理」。【資料】【未確認】（現行のメニュー項目は増えており、構成は未突合）
5. **スマホ表示（v160〜v166、2026-06-24）の確定仕様**: v160 は `app/layout.tsx` に viewport 設定を追加（iPhone Safari が980px 仮想ビューポートでレンダリング後にズームアウトする挙動への対処）。v161 はスマホ（768px 未満）でサイドバーをドロワー化（デフォルト非表示・☰＋半透明オーバーレイ・`isMobileOverlay` props・幅280px・スライドイン）。v162 はヘッダーレイアウト修正、v164 はモデルボタンの横スクロール化とファイル・GitHub を「＋」ドロップアップに集約、v165 はプロバイダータップでモデルのドロップダウン（案B）＋送信ボタン拡大（1.3倍、改行ボタン削除）、v166 はフォントサイズ調整と会話履歴ドロワー。判断者: 資料は Rui の確認と読めるが明記なし。出典: スマホ v166 §「実装済み内容」。【資料】【コード】（CC の「スマホ対応関連」に 768px・matchMedia フォールバック・排他制御が既出）
6. **送信キー設定（v163）**: PC は `enterMode=send`（既定）で Enter 送信／Shift+Enter 改行、`newline` で Enter 改行／Ctrl・⌘+Enter 送信。**スマホは設定に関わらず Enter は常に改行**（誤送信防止）。編集再生成モーダルは Ctrl／Cmd+Enter 固定で設定に依存しない。LocalStorage `kabehub_enter_mode`（`"send"`／`"newline"`、初期値 `"send"`）。`app/arena/page.tsx` の人間ターン入力は対象外（Enter 送信のまま）。出典: スマホ v166 v163 節。【資料】【コード】（`components/ChatInput.tsx:322`、`lib/inputUtils.ts`。CC に既出）
7. **フォントサイズ調整（v166）**: `app/globals.css` に `--font-scale` を追加し `.prose-custom`／`.prose`／`.animate-message`／`textarea` に適用。LocalStorage `kabehub_font_scale`（値 0.8〜1.5、初期値 1）。`app/layout.tsx` の `<head>` に初期化スクリプト（try/catch・0.8〜1.5 の clamp 付き）、`app/settings/page.tsx` にスライダーと「標準に戻す」。**適用範囲はチャット本文・Markdown 本文・textarea のみで、`px` 固定のヘッダーボタン等には効かない**（意図的な割り切り）。ユーザー発言バブルは `calc(14px * var(--font-scale, 1))`。出典: スマホ v166「v166」節。【資料】【コード】（`app/globals.css:223,249`、`app/layout.tsx:39` に `kabehub_font_scale`）
8. **スマホの会話履歴ドロワー**: 「···」メニューの「📖 会話履歴」でスマホ時は右側ドロワー（PC は従来の `navExpanded` トグル）。`dotPositions`／`orderedMessages`／`branchBlocksByAnchor` を流用し、👤／🤖アイコン付き、項目タップでスクロール＆自動クローズ。z-index は オーバーレイ 200／ドロワー 201（`showMoreMenu` の 20 より大きい）。出典: スマホ v166「v166」節。【資料】【未確認】
9. **外部 AI レビュー（Fable2）の推奨優先順位**（ChatInput／ChatPanel）: ①IME 変換確定の Enter による誤送信（1行で直る）②`thread` prop の直接ミューテーション（`handleSaveShare`／`handleSaveSystemPrompt`／`handleSaveRoleplay`）＋スレッドリセット `useEffect` の依存が `thread?.id` のみ（メモ化の前提）③`isDeepThinking` が非対応モデル切替後も true のまま送信される④ObjectURL のリーク／Esc 競合⑤`React.memo` 化（`searchMatchIds = []` のデフォルト引数は毎レンダリング新配列になり memo を破るため、モジュールスコープの定数に置き換える）。出典: Fable2「優先対応のおすすめ順」。判断者: 提案であり採否の記録は資料にない。【資料】
10. **Fable2 の指摘の現状（コードで確認）**: ①IME ガードは実装済み（`ChatInput.tsx:322`・`ChatInputCentered.tsx:411` が `e.nativeEvent.isComposing || e.key === "Process"` で return）③`isDeepThinking` は送信時に `effectiveDeepThinking = isDeepThinking && canUseDeepThinking(provider, selectedModel)` で二重ガード（`ChatInput.tsx:650`）④ObjectURL はアンマウント時に revoke（`:243`）、タグ入力・タイトルダイアログの Escape は `stopPropagation`（`ChatPanel.tsx:1494,2907`）⑤`MessageBubble`／`RoleplayBubble` は `memo` 済み。②の `thread.is_public = …` 形のミューテーションは現行 `ChatPanel.tsx` に見当たらない（解消とみられる）。出典: Fable2 §1〜§9、上記ファイル。【コード】

## 地雷（CLAUDE.mdに載っていないもの）

1. **`isDesktop`（`window.innerWidth >= 1280`）と `isMobileViewport`（768px 境界）は別の判定**。混同しない。スマホで `navExpanded=true` になっても、`{isDesktop && navExpanded && …}` のガードで PC の履歴サイドペインは出ない（意図的）。CC に `isDesktop`・`navExpanded`・1280 の記述なし。出典: スマホ v166「v166 地雷メモ」。【資料】【コード】（`components/ChatPanel.tsx:157,1389` に `isDesktop`）
2. **フォントサイズ調整の適用範囲はチャット本文・Markdown 本文・textarea のみ**。`px` 固定のヘッダーボタン等には効かない。LocalStorage キー `kabehub_font_scale`（0.8〜1.5）。CC は `--font-scale` の言及が1箇所あるが、キー名・範囲・適用範囲の記述なし。出典: スマホ v166。【資料】【コード】（`app/layout.tsx:39`）
3. **CSS 変数の命名**: `--sidebar-border` ではなく `--sidebar-border-color` を使う（既存の `--border` と混在しないように）。You のブロックは `border` と `borderLeft` を**両方**指定する（`border` だけだと `borderLeft` が上書きされる）、`borderLeft: 4px` に合わせて `paddingLeft: 14px`（通常は 16px）。出典: UI v3「注意点・実装時の Tips」。【資料】【コード】（`--sidebar-border-color` は `app/globals.css:212`）
4. **ポップオーバーの外クリック用オーバーレイは `position: fixed`**（`absolute` だとスクロール位置に依存して全画面を覆えない）。「···」メニューの項目配列に `active?: boolean` を持たせ `.map()` 内でスタイル分岐（型定義の明示は不要）。ホバーボタン（コピー・🔒・✏️）はブロック形式移行後も `position: absolute; top: -10px; right: -8px` で動作確認済み。出典: UI v3。【資料】【未確認】
5. **スマホのドロワーのオーバーレイ・ドロワーの z-index は 200／201**（`showMoreMenu` は 20）。新しい重ね順を足すときはこの2つとの順序を確認する。モデルドロップダウン・「＋」ドロップアップ・会話履歴ドロワーのソフトキーボード時の位置は iPhone で要確認（CC に iPhone 実機確認は完了と記載）。出典: スマホ v166。【資料】
6. **Codex は絵文字（👤／🤖）を空文字に化けさせやすい**。会話履歴ドロワー等の差分確認時にチェックする。出典: スマホ v166 地雷メモ。【資料】
7. **iOS Safari では `height: 100vh` がアドレスバーの表示／非表示で変動する**。入力欄が隠れる問題が出たら `height: 100dvh`（dynamic viewport height）を検討。`position: fixed` はソフトキーボード表示時に意図しない位置に動くことがある。出典: スマホ v166「iOS Safari 固有の注意点」。【資料】【コード】（現行 CSS・`app/page.tsx`・`components/*.tsx` に `dvh` の使用なし）
8. **ブレークポイントを変える場合は、`app/page.tsx` の `matchMedia("(max-width: 767px)")`、`ChatInput.tsx`／`ChatInputCentered.tsx` が共有する `isMobileViewport()`、`Sidebar.tsx` の `isMobileOverlay` props の全箇所を揃える**。CC は768pxの統一と `lib/inputUtils.ts` を記載（既出）、4箇所列挙はなし。出典: スマホ v166「ブレークポイント統一」。【資料】【コード】

CLAUDE.mdに既出: 5項目（768px のブレークポイント統一・`matchMedia.addListener` フォールバックの維持・`lib/inputUtils.ts` への共通化・`isToolMenuOpen` と `openModelProvider` の排他・iPhone 実機確認は完了済み）。

## 未実装・宿題

1. **UI v3 の未実装**: `share/[token]/page.tsx` の `ReadOnlyBubble`（バブル形式のまま、優先度低）、`ArenaTimeline.tsx`（既存スタイルのまま、優先度低）、入力エリアの上段メタボタンの整理（下段のみ）。出典: UI v3「未実装・次回対応」。【資料】【コード】（`app/share/[token]/page.tsx:30` に `ReadOnlyBubble` が現存、見た目の現状は未確認）
2. **サイドバー折り畳みの `ResizeObserver`（幅変化時の textarea 高さ再計算）未実装**（CC の既知課題に既出）。Fable2 #14 はナビドットの位置がコンテンツ高の変化（画像の遅延ロード・ストリーミング）に追従しない点も指摘（`el` 自身のボックスサイズしか見ない）。出典: Fable2 #14。【資料】【未確認】
3. **Fable2 のうち現行コードで未確認／未解消とみられるもの**: #10 タグ追加の Enter＋`onBlur` で `handleAddTag` が二重 POST（現行 `ChatPanel.tsx:1493,1496` は Enter で `handleAddTag`、`onBlur={handleAddTag}` が残っており、API の `duplicate` 判定に頼る構成。二重呼び出しを防ぐ送信中フラグは未確認）／#12 `processFiles` の枚数カウントが並行呼び出し（ドロップとペースト）でズレる／#13 トースト系 `setTimeout`（`setShareCopied`・`setPushSaved`・`setApiKeySaved`）の未クリーンアップ（実害は軽微）／#15 中断時の表示フリッカー（`isLoading && streamingContent` の条件、`page.tsx` 側の暫定メッセージ化）／#6 `handleSubmit` で `onSubmit` 直後に `previewUrl` を revoke して楽観的 UI と競合しうる／#9 ストリーミング中のチャンク毎の全再レンダリング（`memo` 化は済み。`searchMatchIds = []` のデフォルト引数の件は未確認）。出典: Fable2。【資料】【コード】（#10 の該当行のみ grep）
4. **将来の拡張**: 入力欄の整理（上段メタボタン）、`app/arena/page.tsx` の人間ターン入力を送信キー設定に統一（CC の「低優先・後回し」に既出）。出典: スマホ v166。【資料】

## 矛盾・要照合

1. **スマホ v166 の「未対応: P1 iPhone 実機確認」**: CC は「iPhone 実機での動作確認は完了済み（Rui 確認、2026-11-17）」と記載。資料側が古い（修正対象は資料）。【資料】
2. **スマホ v166 の「`loadEnterMode()`／`isMobileViewport()` の重複」**: 現在は `lib/inputUtils.ts` に共通化済み（CC）。資料側が古い。【コード】
3. **UI v3 の「`···` ポップオーバーの内容」と現行**: 資料は「この会話をコピー・タイトル編集・APIキー・TXT／MD／CSV・一時モード・下書き」。現行は「ゴミ箱」「分岐ツリー」「会話履歴」等が増えている（`app/threads/[id]/tree/page.tsx` へのリンク等）。CC は `ChatPanel.tsx` を「メイン」とのみ記載で、メニュー構成の正本がない。【コード】【未確認】
4. **inventory.md の分類の確認事項**: `過去Fable回答その1.txt`（chat-ui との共有）は、実際は `app/api/chat/route.ts` と `lib/context-window.ts`・`lib/lore.ts` のレビューで、chat-ui の内容を含まない。chat-core／auth-and-security の資料。その2 は ChatInput／ChatPanel のレビューで chat-ui。直していない。【資料】
5. **inventory.md の分類の確認事項**: `スマホレスポンシブ対応_v166` は feats が「mobile／chat-ui」の A。内容の大半は Web のスマホ表示（chat-ui）と「将来のスマホアプリ化」（mobile）。mobile の抽出では、アプリ化の比較表・ロードマップ・Capacitor 導入時の注意（資料の末尾）を読む必要がある（今回は未読）。【資料】
6. **Fable2 の対象行番号**（`ChatInput.tsx` L277-282・L221・L228、`ChatPanel.tsx` L438-442・L936-940 など）は当時のもので、現行コードと一致しない。【資料】【未確認】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_UIリデザイン引き継ぎ_v3.md | A | 全文（8KB） |
| KabeHub_スマホレスポンシブ対応_引き継ぎ_20260624_v166.md | A | 見出し一覧＋v161・v163・v166・ブレークポイント統一・現状評価・実装時の共通注意事項（アプリ化の比較表・ロードマップ（資料の「将来のスマホアプリ化」）は mobile で扱うため未読） |
| 過去Fable回答その2.txt | B | 全文（約11KB） |
| 過去Fable回答その1.txt | B | 全文のうち先頭〜#12 と表（`route.ts`／`lore.ts` のレビュー。chat-core に関する指摘が中心で、chat-ui の判断なし） |
| CLAUDE.md・`app/globals.css`・`app/layout.tsx`・`components/ChatInput.tsx`・`ChatPanel.tsx`・`MessageBubble.tsx`・`lib/inputUtils.ts` | — | 既出判定・突合のための grep のみ |

読めなかった A 資料: なし（スマホ v166 の「将来のスマホアプリ化」節は mobile の抽出で扱う）。
