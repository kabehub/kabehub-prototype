# Phase 3B-2: 409 通知・入力保持・HTTP失敗確認

作業日: 2026-10-25。ブランチ: `thread-trash-phase3`。開始HEAD: `de58a43`（3B-1）。
実装コミット: `0b131d6` (`fix(thread-trash): handle Web 409 errors and preserve input (Phase 3B-2)`)。
このレポートと検証ログはコミットしない。

## 変更ファイル

| ファイル | 内容 |
| --- | --- |
| `lib/threads/trash-client.ts` | 型付き`ThreadWriteError`、厳密な409判定、レスポンスのerror読込、共通通知、入力復元・中断通知の純関数 |
| `app/page.tsx` | streaming非2xxの型付きエラー化、通常/メモ送信の409入力復元、中断後PATCHの成功確認と再同期、画像前段の失敗時停止、指定された書き込みの共通409通知 |
| `components/ChatPanel.tsx` | 公開/Push/system prompt/roleplay/タグ/ノート/メッセージノート/下書き/タイトルの409通知。タグ入力復元。タイトルのHTTP/通信失敗確認 |
| `components/MessageBubble.tsx` | Lore likeの409通知。親で通知済みのマスク編集409では編集を閉じず、重複する汎用alertを出さない |
| `components/RoleplayBubble.tsx` | 同じ親の更新callbackを使う編集で、409の重複alertだけを抑制。その他の失敗表示は維持 |
| `app/arena/page.tsx` | AI/人間ターン、タイムトラベルDELETEとfallback、公開PATCHの409通知。DELETEの409ではfallbackしない |
| `app/novel-check/page.tsx` | thread PATCH、chat POST×2を各要求で確認。失敗後の要求/遷移を止め、409は共通通知 |
| `scripts/thread-trash-client.test.cjs` | 純関数、型付きエラー、読めない本文、streamingの非2xx/2xx等26件 |
| `scripts/thread-trash-write-ui.test.cjs` | 実callbackを制御したI/Oで検証する59件。入力・巻き戻し・通知・失敗時の後続処理抑止等 |
| `scripts/thread-trash-ui-test-helpers.cjs` | 既存callback取得ヘルパーを他の対象ファイルの通常async関数にも再利用できるよう拡張 |
| `scripts/thread-trash-view.test.cjs` | 新しい共通関数と中断PATCH helperを既存ガードテストのコンテキストへ追加 |
| `scripts/query-text-regeneration.test.cjs` | 同じく新しい共通関数をモックI/O環境に追加。既存queryText検証は維持 |
| `scripts/arena-ui.test.cjs` | Webの新しいToast利用を既存テストでモック |
| `scripts/messageDisplay.test.cjs` | 同じくToast利用を既存表示テストでモック |

API・DB・RLS・Cron・`apps/mobile`・依存パッケージ・`ChatInput.tsx`/`ChatInputCentered.tsx`に変更なし。
3B-1の`captureView`/`isCurrentView`/epoch/refを再利用し、表示判定は再実装していない。
タグの復元にも、親の既存判定を閉じ込めた`captureViewGuard`を渡す。
任意の検索カウンター分離は行わず、既存の検索/一覧latest-winsを維持した。

## エラーと入力の扱い

- ゴミ箱扱いはHTTP409かつ`error === "thread is in trash"`だけ。404、他の409、500は同一扱いにしない。
- `ThreadWriteError`はstatusと文字列のerrorを保持。`fetchWithStreaming`の非2xxではこれをthrowする。本文が空/不正/読込済みでもstatusを保持する。本文はcloneで読むため元レスポンスを消費しない。
- 2xxのJSON/NDJSON処理は変更していない。chunk、meta、GitHub進捗も回帰テストで確認。
- 共通トーストは「このスレッドはゴミ箱にあります」、actionは「ゴミ箱を開く」。クリック時に`/trash`へ移動する。
- 通常送信は`queryText ?? userContent`を復元。空文字のqueryTextも尊重し、添付本文を入力欄へ展開しない。メモ送信は元の手入力（前後の空白を含む）を復元し、楽観的メモを除去する。
- 入力復元は現在のviewでのみ行い、functional updaterでもviewと現在の入力を確認する。入力が空のときだけ復元し、空白を含む新しい入力は上書きしない。
- タグも409のときだけ元の入力を復元して入力欄を再表示。新しい入力や別viewへは復元しない。
- 再生成/編集再生成の409は共通通知後に既存の再GET同期を使う。軽量再生成でも409では同期する。
- `handleUpdateMessage`は共通通知後もrejectし、バブル側の楽観的hidden表示のrollbackや編集継続を妨げない。通常/roleplay双方の編集で汎用alertが重ならないようにした。
- 既存の汎用toast/alert/rollbackは、409専用分岐以外では維持した。新たに確認を追加したタイトル・画像前段・novel-check・中断PATCHは失敗を成功扱いしない。

## 中断後 PATCH 失敗時の整合の取り方

`persistAbortedMessages`に3経路を集約した。呼び出し元の既存view確認を通った場合だけ実行する。

1. 通常送信のuser/assistant、分岐再生成のassistant、編集再生成のassistantをPATCHし、すべてのHTTP成否を確認する。
2. 通常送信/分岐再生成では、memoの表示追加をPATCH成功後へ移した。未保存なのにmemo化成功として表示しない。
3. `Promise.allSettled`で全PATCHの完了を待つ。一方が成功して他方が失敗した場合も、その後の再GETで実際のDB状態へ同期する。混在失敗にtrash409があればその通知を優先し、通知は1回。
4. `abortReasonRef === "thread-trashed"`では通知を出さない。`"user"`/nullで正確なtrash409なら共通通知、それ以外なら各操作の汎用失敗通知。
5. 失敗時は同じスレッドのmessagesを再GETし、viewが有効な場合だけ採用する。削除でviewが変わった場合は通知・表示更新とも行わない。
6. `abortReasonRef`は呼び出し元の既存finallyでnullへ戻す。isLoading/streaming等の後始末も維持した。

再GETも失敗した場合、未保存のmemoを新しく作って表示することはしない。元の表示（再生成では直前の分岐非活性化を含み得る）を残し、次の読み込みで再同期する。通信障害時にDBの結果を断定して手動rollbackする処理は追加していない。
通常の削除起因中断では、3B-1のview不一致によりこのhelper自体へ進まない。通知抑制はHTTP失敗分岐の保険としても維持している。

## handleSwitchTemporary の調査（変更なし）

ローカルソースで確認した事実:

- `app/api/threads/route.ts`のexportはGETだけで、POSTの実装はない。標準のRoute Handlerのmethod境界ではPOSTは405になる構成。実環境へのAPI呼び出しは行っていない。
- `handleSwitchTemporary`は一覧に対象が無いと`POST /api/threads`を送り、`res.ok`を確認せず次へ進む。
- 続く各`POST /api/chat`も`res.ok`を確認しない。最後に一時モードを解除して一時メッセージを消去するため、HTTP失敗が通信例外にならなければ失敗を保存成功として扱い得る。
- `/api/chat`にはスレッド不在時のupsertがある。このため「POST /api/threadsが未実装なので必ず全保存に失敗する」とは断定しない。
- 一時保存時に渡す`isTemporarySave`/`savedMessage`は、現在のchat routeのrequest型・destructure・処理分岐に存在しない。元メッセージのrole/id/時刻をそのまま再現する専用保存契約は確認できず、通常のchat経路として処理される。

指示どおりこの関数は修正していない。開始HEADとの関数ブロックのバイト一致を確認した。別タスクでAPI契約と失敗時の一時データ保持を合わせて見直す必要がある。

## 入力保持の保証範囲・残した既存挙動

- 保証するのは、現在のチャット画面でtrash409を受けたときの手入力テキスト。タグ入力も上記の範囲で復元する。
- 添付画像/テキストファイルの選択UIは復元しない。送信欄の先行クリア順序は変更していないため、手入力が戻っても添付は付いていない。再送時は再添付が必要。
- `/image`コマンド/画像生成モードの入力復元は対象外。画像前段が失敗して停止しても、その入力を自動復元しない。
- 「ゴミ箱を開く」で遷移した後に戻った場合の入力保持は保証しない。入力の永続保存は追加していない。
- 409以外の失敗時の入力保持は追加しない。たとえば通常送信500では従来どおり入力は復元しない。
- 軽量再生成の非409エラーは、既存catchがbranchモードだけ汎用toast/再GETを行う構成のまま。今回、非409の通知仕様を広げていない。
- novel-checkで途中まで保存した後に後続要求が失敗した場合、成功済みのDB行は残り得る。遷移と後続要求を止める修正であり、補償DELETEや新規の再試行/重複排除契約は追加していない。

## 検証

- `npm test`: **978件pass、0 fail、0 skipped**（3B-1の893件 + 新規85件）。終了コード0。
- `npx tsc --noEmit`: **エラーなし**、終了コード0、出力なし。
- 純関数: 409の厳密判定、入力が空/入力済み/空白入力、queryTextあり/なし/空文字、中断理由ごとの通知分岐を検証。
- 実callback: 409での入力復元、view変更後の無更新、メモ除去、タグ復元、タイトルのHTTP/通信失敗、前段失敗時の画像生成抑止、PATCHの部分失敗/再GET失敗、各指定経路の通知、Arena fallback抑止、novel-check3要求の各失敗停止を検証。
- streamingの409/500/本文なし、成功JSON/NDJSON、restore-branch404をtrashへ変換しないこと、既存3B-1ガードも確認。
- `git diff --check`はエラーなし。変更した既存11ファイルのLF/BOM維持、コミット対象14ファイルすべての`i/lf w/lf`を確認。コミット後の`git diff --stat`は空。
- 本番DB/Supabaseへの接続、実ブラウザでの本番接続を伴う操作確認は行っていない。

## Rui の手動確認項目

1. 別タブで対象をゴミ箱へ移動し、通常送信/メモ送信。共通トーストとaction、現在画面の入力復元、楽観的メモが残らないこと。
2. テキスト添付あり/なし、手入力なしの添付のみ、エラー待ち中に新しく入力した場合。本文が展開されず、新しい入力を上書きしないこと。添付UIが戻らない差を確認。
3. 停止ボタン/Esc後のmemo化と別タブ削除の競合、内部削除中断時の通知抑制。DELETE→Undo→同ID再選択でも古い更新が戻らないこと。
4. 画像前段chat保存を409/500/通信失敗にして、画像生成APIへ進まないこと。画像入力の復元は対象外。
5. 公開/Push/system prompt/roleplay/タグ/ノート/メッセージノート/下書き/メッセージ編集・削除/ブランチ復元/Lore likeで409通知。タグとバブルの楽観的表示の巻き戻し。
6. タイトル保存の409/500/通信失敗でローカルタイトルを成功更新せず、ダイアログを閉じないこと。
7. ArenaのAI/人間ターン、公開、messages DELETE。trash409ではfallbackしないこと。その他の従来fallbackは維持されること。
8. novel-checkの保存3要求のそれぞれを失敗させ、成功扱いで遷移しないこと。部分保存後の再試行は上記制約に留意する。
9. `handleSwitchTemporary`の専用見直し、非409入力保持、遷移をまたぐ下書き保持は後続の判断対象。

レポートと検証ログは未コミット。mainへのpush・その他のpush・`--force`は行っていない。
