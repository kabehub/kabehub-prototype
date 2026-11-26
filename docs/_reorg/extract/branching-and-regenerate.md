# 抽出メモ: branching-and-regenerate（①-2）

作成: 2026-11-25／対象: 分岐・世界線・再生成（light／branch）・編集再生成・分岐ツリー・新しいチャットに分岐。
タグ: 【資料】／【コード】（実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。
略称: matome＝PhaseA5_kaiketsu_logic_matome（A）、v9＝分岐ツリー可視化 v9（A、2026-06-15）、未解決＝PhaseA5実装後_未解決事項（2026-06-13）、入れ子＝入れ子分岐branch_root_idバグ（2026-06-13）、A5-3＝PhaseA5-3 詳細検討（2026-06-14）、PB指示＝PhaseB 分岐ツリー実装指示、PBまとめ＝PhaseB 実装まとめ・既知バグ、二重発言＝再生成二重発言バグ（2026-06-14）、スケジュール＝BranchingMode_RAG 実装スケジュール案 v2（2026-06-07）。

## 確定した判断

1. **Branching は RAG の後に本格整備する**（RAG MVP 先行→Branching→Temporal/Dreaming）。ただし DB の地ならし（`is_active`／`branch_id`／`parent_id` の確認、`message_number` 永続化）は先に入れる。出典: スケジュール §1・§15（2026-06-07）。【資料】
2. **編集は上書きでなく新規メッセージとして保存する**（元 user は `is_active=false`、編集後 user は `parent_id=元user.id`・新 branch・`is_active=true`）。v122 の「編集して再生成②」は user の content を DB 上書きするMVPで、Branching 本格対応で置き換える方針。出典: スケジュール §10 v131。【資料】【コード】（現行は `apply_branch_edit` RPC。`app/api/chat/route.ts:1008`、v179）
3. **`branch_root_id` は編集対象メッセージ自身の id を常に使う**（`baseUser.branch_root_id ?? baseUser.id` を `baseUser.id` に変更）。継承すると2回目以降の編集がすべて最初の分岐点の兄弟になる。コミット `4bae3f8`、v148。step2 の退避 UPDATE は `branch_index=0` 固定。出典: 入れ子 §3・§4-1、未解決 §1。【資料】
4. **レールUIの分岐解決は `is_active` の組み合わせ別パッチをやめ、`parent_id` チェーンによる編集チェーン単位の再構築に統一**。`branch_root_id` は branchEdit で上書きされるが `parent_id` は上書きされないため。出典: matome §1・§2、A5-3 §4・§5-1（完全置き換えを推奨）。【資料】【コード】（`lib/branching.ts` と `ChatPanel.tsx` に `chainBlocksByRootAnchor`／`visibleMessages` を確認）
   - 「自分自身が root」のメッセージ（`branch_root_id===id` の user）から `parent_id` を遡り、同じチェーンの `branchRootId` を Set に集約。【資料】
   - **現在レーン（`currentLaneKey`）** ＝ チェーン配下の `is_active!==false` の user（memo 除く）のうち `message_number` 最大のもの。root メンバーに限定しない（状態③対応の核心）。【資料】
5. **`BranchLane.isActive` を `isCurrent`（チェーン内で必ず1つ、「▶表示中」）と `isOnPath`（DB 上 active の祖先も含む）に分離**。`isOnPath && !isCurrent` のレーンもクリックで戻れる。A5-3 §5-3 の選択肢1〜3のうち、結果として「現在地のみ表示中・他はクリック可能」に落ち着いた。出典: matome §3。【資料】
6. **本文の重複表示は `dbActiveMessages`（is_active のみ）と `visibleMessages`（現在の世界線のみ）の分離で解決**。`visibleMessages` は採番（#1,#2…）・`lastAssistant`・編集再生成・ドット・エクスポートに使い、`branchGroupsByAnchor`／`inactiveBranchGroupsByAnchor`／ボツ案の `BranchBubble` は `dbActiveMessages` のまま。DB スキーマ・API 変更なし。共通部分（`branch_root_id` や `branch_index` が無い）は常に残し、チェーン未解決時も残す（フェイルセーフ）。出典: matome §4。【資料】
7. **`resolveCurrentLaneKey`（現在レーン決定）と `resolveBranchBlockAnchor`（分岐ブロックの挿入位置）は別の問いとして分離**。アンカーは「`visibleMessages` 内で currentLaneKey に該当する最初（`message_number` 最小）の user」。レーン内で一番後ろのメッセージをアンカーにすると、分岐ブロックが ③ でなく ④ の直後に出る。出典: matome §5。【資料】
8. **実機検証（新規スレッドで ①②③④→編集→③'④'→編集→③''④''）で3パターン全て OK**：A:0（③に戻す）→#5直後、B:0（③'）→#9直後、B:1（③''）→#13直後。分岐ブロックに3レーン、本文の重複なし。出典: matome §7。【資料】
9. **Phase A は「フロントのみ・楽観更新なし」で開始**。`messages` state は `app/page.tsx` 側にあり `ChatPanel` から直接 `setMessages` できないため、レーンクリック→`onRestoreBranch`→PATCH→GET→`setMessages`。入れ子分岐の孤児 active を懸念し、必要なら restore-branch を RPC 化する（Phase A.5）。ChatGPT の指摘を採用。出典: ChatGPTさんのご意見 §1・§2。【資料】【コード】（現行 `restore-branch` は `restore_message_branch` RPC。`route.ts:33`、v178）
10. **分岐ツリー（Phase B）は独立・読み取り専用ページ**。7ステップ: ①`GET /api/threads/[id]/messages` に認証＋`user_id`（無関係に最優先のセキュリティ修正）②`ChatPanel` の分岐ロジックを `lib/branching.ts` へ切り出し（挙動不変）③`lib/branchTree.ts`（純関数）④`components/BranchTree.tsx`（SVG＋HTML）⑤`app/threads/[id]/tree/page.tsx` ⑥ChatPanel「···」メニューにリンク ⑦`scripts/branchTree.test.cjs`。出典: PB指示、PBまとめ。【資料】【コード】（ファイルの存在を確認）
    - 兄弟タイル型（③・③'・③''が②の子として横並び）。現在表示中レーン＝青、共通幹と非選択レーン＝グレー。ノードクリックは `/?thread=…&msg=…` へ遷移し、`restore-branch` は呼ばない。【資料】
    - **`lib/branching.ts` と `lib/branchTree.ts` の分岐解釈ロジックは一本化する**（ChatPanel と BranchTree が別々に再計算しない）。【資料】
    - 例外処理は初期版から必須: 合成ルート `SYNTHETIC_ROOT_ID`（`"__root__"`、`parent_id` 欠落・参照先なしの親）、循環参照ガード（`visited: Set`）、`provider==="memo"` はツリー対象外。【資料】【コード】（`lib/branchTree.ts:8,35,37`）
11. **ツリーの「マングローブ林」対策**: `parent_id` が null の通常メッセージが各々独立ルートになる。`message_number` が1つ小さい同レーンのメッセージを親とみなすフォールバックを `buildDisplayParentIdMap` に入れ、レーン先頭だけ `attachPointId` へ付け替える（1パス目）。さらに兄弟 ③'・③'' は「`laneHead.parent_id === laneHead.branch_root_id && laneHead.branch_root_id !== laneHead.id`」のとき `branch_root_id` の表示親へ付け替える（2パス目、v8）。ノードラベルは1行 ellipsis。出典: PBまとめ、v9。【資料】【コード】（`normalizeParentId`、`message_number === 1` と prior 無しの扱いを確認）
12. **再生成には「分岐として再生成」(`mode:"branch"`)と「上書き再生成」(`mode:"light"`)があり、編集再生成を user バブル側からも開ける**（最後の assistant と、その直前の非 memo user のみ。`canEditAndRegenerateFromUser`／`editRegenAssistantMsg`）。モーダルは `MODEL_CONFIG` ベースのモデル選択。出典: codex実装メモ（v122〜v123 のCodex実行ログ、コミット `96f7012`）。【資料】
13. **LibreChat の分岐ロジック調査から、KabeHub の将来案として4点が挙がった（採用は未確定）**: ①フォーク時の選別3種（`DIRECT_PATH`／`INCLUDE_BRANCHES`／`TARGET_LEVEL`）②`splitAtTargetLevel`（対象メッセージを新しい最初の発言にして別チャット化。→「新しいチャットに分岐」`branch-to` に相当）③ツリー複製時の ID マッピング表で `parent_id` を書き換え ④親より1ms遅らせる `created_at` 補正。出典: 引継ぎUIその1。【資料】【コード】（`app/api/threads/[id]/branch-to/route.ts` は存在。③④の採用有無は未確認）
14. **全世界線を常時並走させる「地下鉄路線図型」は不採用**（入れ子で横幅が爆発し、180px前後のサイドペインに収まらない）。共通部分は1列、分岐点だけ膨らむ「レール＋分岐ブロック」にする。「ドラッグで世界線を入れ替える」案も不採用（切替に必要な情報は `branchIndex` 1つで、既存 restore-branch のワンクリック呼び出しで足りる）。出典: 分岐履歴レールUI v7 §0。【資料】
15. **Phase A-1 の仕様**: 変更は `components/ChatPanel.tsx` 1ファイル（+159/−32行）、新規ファイル・API 変更なし。分岐ブロックのヘッダーは「分岐点 #N — X個の世界線」（N は表示番号で raw の `message_number` ではない）。レーン表記は「▶ 表示中: {要約}」（active、`var(--accent)` 背景・白文字）／「世界線{branchIndex}: {要約}」（inactive、控えめ）。inactive レーンのクリックは確認なしで切替。**楽観更新は採用せず**、`onRestoreBranch` を `Promise<void>` 化して `await` 後に `scrollToMessage(anchorMessageId)`。入れ子分岐は「アクティブパス上に分岐ブロックが複数現れる」だけで表現。出典: v7 §0・§2-1。【資料】
16. **当初案（`activeMembers`＝`is_active!==false` の root メンバーから `message_number` 最大でアンカー決定）は2点の問題で変更**: ①`branch_index>=1` の枝が active のとき、その枝の root メンバー（`branch_root_id===id`）自身が存在せず `activeMembers` が空になる ②チェーン全体の `is_active!==false` の user から最大を選ぶと、レーン判定は正しくてもアンカーが現在レーン内の最後尾になる。①への対応が Phase A.5-4、②への対応が A.5-5（判断4・7参照）。出典: v7 §9-6。【資料】
17. **Phase B 着手条件（v7 時点）**: ①レールUIで分岐点と世界線が把握できる ②A.5 本体（branchEdit の `branch_root_id` 決定）完了 ③A.5-3〜A.5-5 完了 — いずれも ✅。④「既存の汚染データへの対応方針」は**未決定**のままツリー描画ロジックを決める、という扱い。出典: v7 §5-5。【資料】

## 地雷（CLAUDE.mdに載っていないもの）

1. **`branch_root_id`/`branch_index` は1組しか持てない**ため、1メッセージが「親分岐と子分岐の両方に属する」状態を表現できない。branchEdit が `branch_root_id` を上書きするたび、上書き前の所属は DB から失われる（`parent_id` だけが残る）。レール UI で「最初の分岐の選択肢が消える」原因はこれで、`parent_id` チェーンで復元する。設計限界であり、補助テーブル案（`branches` 等／`prev_branch_*` 列）は将来の課題。出典: 未解決 §3-3・§4-2。【資料】
2. **`branch_index` は `branch_root_id` ごとのローカル番号**。チェーン内の複数 root が同じ `branch_index` を持つため、レーン名「世界線0」が複数出る（CC に既出）。さらに `is_active` の3状態（③のみ active／③''のみ active／③と③'が両方 active）が操作ごとに変わる。状態③では ③・③'・③'' の `isOnPath` が複数 true になり、`is_active` だけを見るロジックは必ず漏れる。出典: matome §1・§3。【資料】
3. **`activeMessages`（`is_active` 単独）を表示に使うと、入れ子分岐で ③④③'④' が連続表示される**。採番・エクスポート・編集再生成・ドット・`lastAssistant` はすべて `visibleMessages` を使うこと。逆に、ボツ案の `BranchBubble` と `branchGroupsByAnchor` は `dbActiveMessages` のまま変えない。出典: matome §4-3。【資料】
4. **分岐ブロックのアンカーは現在レーンの最後尾でなく先頭**。`currentLaneKey` の算出に使った最大 `message_number` のメッセージをそのままアンカーにすると、ブロックが ④ の直後にずれる。出典: matome §5。【資料】
5. **ユーザーに見せる番号は `visibleMessages` を再カウントした 1,2,3…**（memo 除く）で、生の `message_number` は編集で後から増えて 15 などになる。表示順の内部ソートのみ `message_number` 優先。ツリーやレールで番号を出すときは表示番号と内部番号を取り違えない。出典: ChatGPTさんのご意見 §3。【資料】
6. **restore-branch の旧実装は同一 `branch_root_id` のグループしか切り替えない**。別 root の子孫分岐が active のまま残る「孤児 active」が起こりうる。また旧実装は deactivate 後に activate が失敗すると非アクティブ化だけが確定する部分状態が起きた。現在は RPC 化済み。出典: ChatGPTさんのご意見 §2、実装方針資料。【資料】【コード】（`restore_message_branch` RPC を確認、migration は `docs/applied/` で v178 とされる）
7. **旧 branchEdit の DB 状態を直す手段はコード修正だけでは足りない**: `branch_root_id` が全行に汚染された既存スレッドはそのまま。対応は (a)マイグレーション (b)個別手修正 (c)放置のどれか。当時は(c)で新規発生だけ止める方針。出典: 入れ子 §4-2。【資料】【未確認】（その後 (a)/(b) をしたかは不明）
8. **分岐ツリーのデバッグ手順**: `treeMessages` を `num／id／parent／branchRoot／branchIndex` で console.log し、`/api/threads/[id]/messages` の応答と `provider!=="memo"` フィルタを順に疑う。④''' 未表示の調査項目5つ（レスポンスに含まれるか／`getTreeMessages` で落ちていないか／`displayParentIdById` の値／`laneHead` 判定に合うか／3パス目の要否）が v9 に残っている。出典: v9「調査方針」。【資料】
9. **旧 `PhaseA5` 時点では `useMemo` 化していない**（`visibleMessages`／`chainBlocksByRootAnchor`／`currentLaneKeyByBranchRootId`）。現行 `ChatPanel.tsx` では `useMemo` 済みで、matome §8 のこの記述は陳腐化。出典: matome §8。【資料】【コード】（`ChatPanel.tsx:238-256`）
10. **`tsconfig.tsbuildinfo` を `git add` に含めない**。`npx tsc --noEmit` 後に差分が出たら `git checkout -- tsconfig.tsbuildinfo` で戻す。Windows の予約名ファイル（`nul`）や `` `[Memory `` のような特殊文字ファイルが push 時に問題になった（解決済み）。出典: A5-3 §5-4、PB指示 Step7、PBまとめ。【資料】
11. **「複数分岐が同じレールの位置に統合される見え方」への注意**: `parent_id` 多段リダイレクトで復元した分岐を統合ブロックにすると、Phase A.5 本体修正前のバグ（別々の分岐点が1つに統合）と似た見え方になりうる。ラベルで区別すること。出典: 未解決 §4-1。【資料】
12. **レーン数が増える UI**: 入れ子の深さに比例してレーンが縦に増える（3段階で4レーン）。大量時の UI は未設計。出典: A5-3 §5-5。【資料】
13. **ChatGPT レビューを使うときは GitHub の remote しか見えない**。未 push の変更とは照合できない。出典: チャット参照元 v10 の運用メモ（chat-core の抽出と重複）。【資料】

14. **旧 `restore-branch` は `Promise.all` で個別 UPDATE を並列発行しており、トランザクションではなかった**。レーン数が増えたり途中失敗すると整合性が崩れうる（RPC 化を検討、と記載）。現在は `restore_message_branch` RPC（v178）。出典: v7 §15。【資料】【コード】（`restore-branch/route.ts:33`）
15. **「アクティブパスは常に1本」という前提は `branch_root_id` 単位では成立しない**。入れ子分岐がある場合、複数の `branch_root_id` グループが同時に `is_active=true` を持つ（状態②③）。`is_active` の個数で現在地を判定しないこと。出典: v7 §15。【資料】
16. **branchEdit で新枝を作った直後は、旧枝の assistant メッセージを inactive にするタイミングが Promise Bridge の保存と競合しないか確認が必要**。出典: v7 §15。【資料】【未確認】（現行は `apply_branch_edit` RPC で生成前に commit されるため、保存との競合形態は変わっている可能性）
17. **一時モード（`isTemporary`）スレッドは DB 保存がないため、レールの分岐ブロックは表示対象外**。出典: v7 §15。【資料】

CLAUDE.mdに既出: 8項目（`message_number` 優先の表示順／`branch_root_id` バグの v148 修正／`branchBlocksByAnchor` 統一／世界線ラベルの重複／Phase B その3／`isLast` のみ上書き再生成ボタン／v173 のモーダル送信先／`resolvedThreadId` 方式）。

## 未実装・宿題

1. **Phase B その3（④''' がツリーに表示されない）**。③''→④'' をさらに編集した ④''' が消える。原因未調査、優先度低。調査方針は v9 に5項目。【資料】【コード】（CC にも「未着手」と記載。`lib/branchTree.ts` に3パス目は無い）
2. **世界線ラベルの一意な連番化**（CC の「低優先・後回し」に既出）。ただし資料側の理由: `lane.label`（内容サマリ）が各レーンで異なるため実害は小さい。出典: matome §8。【資料】
3. **既存の汚染データ（`branch_root_id` が全行に統合されたスレッド）の補正**。出典: 入れ子 §4-2。【資料】【未確認】
4. **`branch_root_id` 上書きによる所属情報の喪失の根本対応**（補助テーブル `branches`／`branch_nodes`、または `prev_branch_*` 列）。Phase B 着手前の設計課題として切り出された。出典: 未解決 §4-2。【資料】【未確認】（Phase B は実装済みで、この設計課題が検討されたかは不明）
5. **楽観更新（`handleRestoreBranchOptimistic`）**: 第2段階で `page.tsx` 側に作るなら可。出典: ChatGPTさんのご意見 §1。【資料】【未確認】
6. **LibreChat 由来の4案（上記判断13）**: フォーク時の3種選別、ID マッピングによるツリー複製（`share/[token]/fork` との関係）、`created_at` 補正。出典: 引継ぎUIその1。【資料】【未確認】
7. **`chat/route.ts` の branch edit 採番・履歴構築 SELECT の error 未確認（MF-2b）**。`?? 0` フォールバックが誤採番・分岐破損につながりうる高リスク箇所として監査Fで分割された。現行は `apply_branch_edit` RPC 化済み（v179）で状況が変わっている可能性。出典: 実装方針資料（MF-2 分割全体像）。【資料】【未確認】
8. **`share/[token]/fork` の `increment_fork_count` の error 未確認**（新規発見として記録のみ、対応せず）。出典: 実装方針資料 Commit 5b。【資料】【未確認】
9. **テスト用 Project の実機確認で使える検証スレッド**: `<thread-id-a>`（状態①②）、`<thread-id-b>`（A.5本体後の#5/#9/#13）。現在も DB に残っているかは未確認。出典: A5-3 §7、未解決 §5。【資料】【未確認】
10. **v7 §14「将来の拡張アイデア」（備忘・未着手）**: ①世界線への命名（`messages.branch_label` 追加か別テーブル）②レーンのドラッグ並び替え（`branch_index` 入れ替え）・分岐の破棄（削除）③各メッセージ下の「世界線を表示」ボタン＋選択肢カード（`BranchSelector`）④分岐間 diff 表示（2つの世界線の回答を並べる）⑤レーンラベルの一意な連番化 ⑥`branches`／`branch_nodes` 補助テーブルの再検討（`display_order` のような派生状態カラムより、「この分岐はどの編集チェーンに属するか」を明示する構造メタデータの方が筋が良い）。出典: v7 §14。【資料】【未確認】

## 矛盾・要照合

1. **inventory.md の分類（解消）**: `codexBranchingMode実装メモ.txt` は lore-rag・B に変更済み（Rui 承認）。方針書 §4-1 の出典からも外した。以下は変更前の指摘: 中身は分岐ではなく、**v133 Memory Summary UI のCodex実行ログ**（`lib/lore.ts` の `MemoryKind` 拡張、`sourceMessageNumber`、`LoreMemoryCard`、`app/api/lore/route.ts` POST、`/memory` ページ新規）。方針書 §4-1 は branching の出典に挙げているが、機能は lore-rag に属する。さらに Codex のディレクトリは `~\Desktop\20260328`。branching の判断は含まれない。【資料】
2. **inventory.md の分類（解消）**: `実装方針資料.txt` は auth-and-security・B に変更済み（Rui 承認）。以下は変更前の指摘: 6KB の資料は restore-branch route の確認メモではなく、**監査F（MF-1 Commit 5a/5b、MF-2 分割）の実装方針**。restore-branch への言及は1行（部分状態の指摘）のみ。機能は auth-and-security。【資料】
3. **inventory.md の分類（解消）**: 分岐履歴レールUI v7 を C→B に変更済み（Rui 承認。無印〜v6 は C のまま）。v7 の内容は上記に追記した。【資料】
4. **スケジュール v2 の「RAG 中心」**: 実質は RAG/Branching 共通の工程表で、branching の確定事項は §10（v131）の1節だけ。残りは lore-rag 側の出典。【資料】
5. **matome の保存先記述**: 「変更はすべて `ChatPanel.tsx` 内」だが、その後 Phase B Step 2 で分岐系ロジックは `lib/branching.ts` へ切り出された（`getOrderNo`／`compareMessagesForDisplay`／`getAnchorKey`／`buildChainBlocksByRootAnchor`／`resolveCurrentLaneKey`／`buildCurrentLaneKeyByBranchRootId`／`resolveBranchBlockAnchor`／`buildBranchLanes`）。【資料】【コード】（`lib/branching.ts` の存在は CC でも確認）
6. **v9 の `buildDisplayParentIdMap` の説明**: 「2パス構成」とあるが、`lib/branchTree.ts` の `normalizeParentId` には `message_number === 1` → 合成ルート、同レーン prior なし → 合成ルートの分岐があり、資料の1パス目の記述より詳しい。実装と資料のどちらも ④''' 未表示の原因は未特定。【コード】
7. **二重発言バグ（2026-06-14）の結論が資料に無い**: 現象報告・推測・案A〜Cのみ。CC の履歴表に「v153: 再生成機能2点修正（二重発言バグ修正・上書き再生成追加）」とあり、解消済みと推定されるが、根本原因（DB 重複 insert か is_active フィルタか）を記録した資料は読めた範囲に無い。【資料】【未確認】
8. **codex実装メモ（62KB）の時期**: ログのコミット `96f7012`・環境（`~\Desktop\20260328`）と、CC の v122〜v123 周辺の記述から編集再生成②MVP＋user バブルからの入口追加と読めるが、日付は資料にない。【資料】【未確認】
9. **入れ子（2026-06-13）の修正案 `branchRootId = baseUser.id` と v179 `apply_branch_edit` RPC の整合**: RPC 化後も同じ採番（`new_branch_root_id`）かは migration `docs/applied/migration_v179_apply_branch_edit.sql` で要確認。【コード】【未確認】
10. **v7 の Phase B は「俯瞰モーダル」・「未着手」と記載**。実際の実装は独立ページ（`app/threads/[id]/tree/page.tsx`、読み取り専用）で、モーダルではない（PB指示・PBまとめと CC が一致）。v7 は Phase B 着手前の古い記述。【資料】【コード】
11. **v7 §15 の `useMemo` 化は未実施と記載**だが、現行 `ChatPanel.tsx` は `visibleMessages`／`chainBlocksByRootAnchor`／`currentLaneKeyByBranchRootId` を `useMemo` 化済み（matome §8 と同じ陳腐化）。【コード】
12. **v7 §13 の検証スレッド**: A.5-3〜A.5-5 検証スレッドの ID は「未記録」。`cda3b1cb-…`（A.5 本体）と `afab4acd-…`（状態①②）のみ ID が残る（宿題9と同じ）。【資料】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_PhaseA5_kaiketsu_logic_matome.md | A | 全文 |
| KabeHub_引き継ぎメモ_分岐ツリー可視化_v9.md | A | 全文 |
| KabeHub_引き継ぎ資料_PhaseA5実装後_未解決事項.md | B | 全文 |
| KabeHub_引き継ぎ資料_入れ子分岐branch_root_idバグ.md | B | 全文（長い行は先頭400字） |
| KabeHub_引き継ぎ資料_再生成二重発言バグ.md | B | 全文 |
| KabeHub_PhaseA5-3_統一ロジック置き換え_詳細検討資料.md | B | 見出し一覧＋§4-5・§5・§6・§7 |
| KabeHub_PhaseB_分岐ツリー実装指示.md | B | 背景・§3-2・全体の注意点（Step 1〜7は見出しで確認） |
| KabeHub_PhaseB_実装まとめ_既知バグ.md | B | 全文 |
| KabeHub_BranchingMode_RAG_実装スケジュール案_v2.md | B | §1・§10・§14・§15・付録 |
| ChatGPTさんのご意見.txt | B | 先頭〜§3（約70行） |
| 引継ぎUIその1.txt | B | 全文（上位80行） |
| 実装方針資料.txt | B | 全文（長い行は先頭260字）。内容は監査F |
| codex実装メモ.txt | B | 先頭30行＋叙述行＋完了報告（実行ログの生出力は読まない） |
| codexBranchingMode実装メモ.txt | B | 先頭40行＋叙述行41本＋完了報告（実行ログの生出力は読まない） |
| KabeHub_引き継ぎメモ_分岐履歴レールUI_v7.md | B（C→B、Rui承認） | §0・§2〜§5・§9-6・§12〜§15（見出し一覧で全体を確認。§6〜§11 の実装コードは matome・A5-3 と重複のため未読） |
