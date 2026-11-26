# KabeHub ドキュメント再編 棚卸し表（手順①-1）

作成日: 2026-11-25／基準: `origin/main` = `68144bb`／方針書: `docs/_reorg/KabeHub_ドキュメント再編_方針_v2.md`（§1・§4-1・§5・§6）

読み方: 期間は「ファイル名の日付」、`*` 付きはファイル名に日付がなく**更新日時**で代用。扱い＝**A 精読／B 拾い読み／C 読まない**。旧フォルダの全ファイルは、名前・サイズ・更新日時・md5（重複検出）と、判断できなかった一部の先頭数行だけで分類した（全文は読んでいない）。

## 0. 件数の検算

| 区分 | 件数 |
|-|-|
| 旧フォルダ（`C:\Users\ruima\kabehub-old-docs`）ファイル数（`ls` 実測。サブフォルダなし） | 632 |
| 本表§2の旧フォルダ行数 | 632 |
| リポジトリ `docs/`（`applied/` 除く）＋`CLAUDE.md`＋`apps/mobile-shell-poc/`（§3） | 30 |
| リポジトリ `docs/applied/`（§4。README含む） | 52 |
| 旧フォルダの内訳 A / B / C | 42 / 126 / 464 |

検算: 42+126+464 = 632（旧フォルダ 632 件と一致）。B1〜B10反映後の値（反映前は 52+132+448）。

方針書の見込み（「精読は全体の1〜2割」）との比較: 精読Aは 6.6%、A+Bは 26.6%（反映前は 8.2%・29.1%）

種類別（旧フォルダ）: 引き継ぎ 365、監査 95、方針ドラフト 69、備忘録 34、Codex指示書 25、ログ 17、その他 16、実装報告 11

## 1. 機能（§4-1）ごとの A・B 集計（旧フォルダ＋リポジトリdocs）

複数機能にまたがるファイルは各機能に1回ずつ数える（行の合計は総件数と一致しない）。`(横断)` は機能ドキュメントでなく `status.md`／`changelog.md`／`operations/`／`overview/`／`backlog.md` の出典。

| 対象機能 | 旧A | 旧B | 旧C | リポA | リポB | リポC | A+B合計 |
|-|-|-|-|-|-|-|-|
| chat-core | 1 | 6 | 8 | 0 | 0 | 0 | 7 |
| models-and-pricing | 2 | 4 | 16 | 0 | 1 | 0 | 7 |
| branching-and-regenerate | 2 | 11 | 8 | 0 | 0 | 0 | 13 |
| chat-ui | 2 | 0 | 3 | 0 | 0 | 0 | 2 |
| rich-conversation | 1 | 2 | 18 | 0 | 0 | 0 | 3 |
| threads | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| trash | 1 | 0 | 2 | 0 | 3 | 0 | 4 |
| search | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| export | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| sharing-and-explore | 3 | 0 | 0 | 0 | 0 | 0 | 3 |
| lore-rag | 3 | 7 | 16 | 1 | 0 | 0 | 11 |
| project-memory | 5 | 12 | 53 | 0 | 2 | 1 | 19 |
| auto-summary | 1 | 1 | 13 | 0 | 0 | 0 | 2 |
| github-integration | 1 | 5 | 0 | 0 | 0 | 0 | 6 |
| mcp | 3 | 4 | 1 | 0 | 0 | 0 | 7 |
| arena | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| image-generation | 0 | 2 | 0 | 0 | 0 | 1 | 2 |
| novel-and-roleplay | 1 | 1 | 0 | 0 | 0 | 0 | 2 |
| auth-and-security | 8 | 25 | 96 | 1 | 3 | 10 | 37 |
| mobile | 4 | 11 | 64 | 1 | 2 | 1 | 18 |
| highlight | 1 | 0 | 3 | 0 | 0 | 0 | 1 |
| (横断) history/changelog・status | 4 | 37 | 236 | 2 | 0 | 51 | 43 |
| (横断) operations | 5 | 5 | 13 | 0 | 0 | 1 | 10 |
| (横断) overview | 1 | 7 | 3 | 2 | 0 | 0 | 10 |
| (横断) roadmap/backlog | 3 | 1 | 13 | 0 | 0 | 0 | 4 |

## 2. 旧フォルダ 全ファイル（632 行）

| ファイル名 | 期間 | サイズ | 種類 | 対象機能 | 扱い | 備考 |
|-|-|-|-|-|-|-|
| # 検証用topic.md | 2026-10-01* | 44B | その他 | project-memory | C | Project Memoryのtopic DL/UL動作確認用ダミー（revision 1〜3の1行のみ） |
| # 検証用topic2.md | 2026-10-01* | 50B | その他 | project-memory | C | Project Memoryのtopic DL/UL動作確認用ダミー（revision 1〜3の1行のみ） |
| # 検証用topic3.md | 2026-10-01* | 50B | その他 | project-memory | C | Project Memoryのtopic DL/UL動作確認用ダミー（revision 1〜3の1行のみ） |
| 108更新用.txt | 2026-06-02* | 4.7KB | その他 | (横断) history/changelog・status | C | v107引き継ぎ資料の冒頭を更新する指示文（内容は旧版更新手順のみ） |
| APIメモその1.txt | 2026-06-30* | 4.7KB | 備忘録 | chat-core | B | Claude APIアドバイザーツール等の相談まとめ |
| APIメモその2.txt | 2026-06-30* | 9.1KB | 備忘録 | export | C | APIでのリッチDL体験の可否相談／B1〜B10反映：B→C |
| APIメモ概要.txt | 2026-06-30* | 26.5KB | 備忘録 | chat-core | B | Claude API公式ドキュメントの貼り付け（27KB）。外部資料 |
| B-05a_CSP強制化nonce導入_方針ドラフト (1).md | 2026-07-24* | 21.2KB | 方針ドラフト | auth-and-security | B | v2（ChatGPTレビュー反映・検証済み）。無印のv1より新しい |
| B-05a_CSP強制化nonce導入_方針ドラフト.md | 2026-07-24* | 9.6KB | 方針ドラフト | auth-and-security | C | 旧版（①Claude案v1。(1)付きのv2が後継） |
| B-05a_Codex指示書.md | 2026-07-24* | 18.7KB | Codex指示書 | auth-and-security | B |  |
| ChatGPTさんのご意見.txt | 2026-06-13* | 9.0KB | 方針ドラフト | branching-and-regenerate | B | 分岐Phase A→B方針へのChatGPTレビュー |
| Fable5_KabeHub_質問リスト.md | 2026-07-01* | 6.4KB | 備忘録 | (横断) overview | C | 旧版（v2あり） |
| Fable5_KabeHub_質問リスト_v2.md | 2026-07-01* | 11.9KB | 備忘録 | (横断) overview | B | 質問リスト最新版 |
| GitHub連携メモ.txt | 2026-06-06* | 30.1KB | 備忘録 | github-integration | B | B1〜B10反映：A→B |
| Hook修正.txt | 2026-06-08* | 4.2KB | 備忘録 | mcp | B | Codex Hookが会話を保存しない問題の原因メモ |
| KabeHub_B-04b_H-29_Codex指示書.md | 2026-07-21* | 20.1KB | Codex指示書 | auth-and-security | B |  |
| KabeHub_B-04b_H-29_test-login指示書.md | 2026-07-21* | 6.9KB | Codex指示書 | auth-and-security | B |  |
| KabeHub_B-04b_H-29_削除モード0件問題_引き継ぎ資料.md | 2026-07-21* | 10.9KB | 引き継ぎ | auth-and-security | B |  |
| KabeHub_B-04b_H-29_削除モード0件問題_解決ログ.md | 2026-07-22* | 11.3KB | ログ | auth-and-security | B |  |
| KabeHub_B-04b_H-29_方針ドラフト.md | 2026-07-21* | 12.6KB | 方針ドラフト | auth-and-security | B |  |
| KabeHub_B-05b_H-21_Codex指示書_v2.md | 2026-07-25* | 19.1KB | Codex指示書 | auth-and-security | B |  |
| KabeHub_B-05b_H-21_脅威モデルと選択肢整理_ドラフト_2026-08-12.md | 2026-08-12 | 10.7KB | 方針ドラフト | auth-and-security | C | 旧版 |
| KabeHub_B-05b_H-21_脅威モデルと選択肢整理_ドラフト_2026-08-12_v2.md | 2026-08-12 | 11.2KB | 方針ドラフト | auth-and-security | C | 旧版 |
| KabeHub_B-05b_H-21_脅威モデルと選択肢整理_確定版_v5_2026-08-12.md | 2026-08-12 | 23.2KB | 方針ドラフト | auth-and-security | C | 旧版 |
| KabeHub_B-05b_H-21_脅威モデルと選択肢整理_確定版_v7_2026-08-12.md | 2026-08-12 | 29.6KB | 方針ドラフト | auth-and-security | A | 系列の最新版(v7) |
| KabeHub_BranchingMode_RAG_実装スケジュール案_v1.md | 2026-06-07* | 18.8KB | 方針ドラフト | branching-and-regenerate / lore-rag | C | 旧版 |
| KabeHub_BranchingMode_RAG_実装スケジュール案_v2.md | 2026-06-07* | 22.5KB | 方針ドラフト | branching-and-regenerate / lore-rag | B | 系列の最新版(v2) |
| KabeHub_Capacitor化_Task6_Codex指示書_v4_2026-08-22.md | 2026-08-22 | 32.6KB | Codex指示書 | mobile | B |  |
| KabeHub_Capacitor化_タスク11-FU1_Codex指示書_v1.md | 2026-08-27* | 5.1KB | Codex指示書 | mobile | B |  |
| KabeHub_Capacitor化_タスク11_Codex指示書_v1.md | 2026-08-27* | 6.6KB | Codex指示書 | mobile | C | 旧版 |
| KabeHub_Capacitor化_タスク11_Codex指示書_v2.md | 2026-08-27* | 6.7KB | Codex指示書 | mobile | B | 系列の最新版(v2) |
| KabeHub_Capacitor化_タスク12_Codex指示書_v1.md | 2026-08-27* | 13.3KB | Codex指示書 | mobile | B |  |
| KabeHub_Capacitor化_タスク13_引き継ぎ資料_v1_自己完結版.md | 2026-08-30* | 13.5KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_タスク13_引き継ぎ資料_v2_自己完結版.md | 2026-08-30* | 20.6KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_タスク13_引き継ぎ資料_v3_自己完結版.md | 2026-09-01* | 30.5KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_タスク13_引き継ぎ資料_v4_自己完結版.md | 2026-09-04* | 43.9KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_タスク13_引き継ぎ資料_v5_自己完結版.md | 2026-09-05* | 43.6KB | 引き継ぎ | mobile | B | 系列の最新版(v5)／タスク14 v8と内容が重なる（B1〜B10反映：方針v26・引継v23をAとして残す） |
| KabeHub_Capacitor化_タスク14実装方針引継ぎ資料_v5.md | 2026-09-06* | 8.6KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_タスク14実装方針引継ぎ資料_v6.md | 2026-09-06* | 14.4KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_タスク14実装方針引継ぎ資料_v7.md | 2026-09-06* | 26.1KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_タスク14実装方針引継ぎ資料_v8.md | 2026-09-06* | 44.2KB | 引き継ぎ | mobile | B | 系列の最新版(v8)。B1〜B10反映：A→B（タスク13 v5と内容が重なる。方針v26・引継v23をAとして残す） |
| KabeHub_Capacitor化_タスク3指示書_v3_2026-08-20.md | 2026-08-20 | 24.0KB | Codex指示書 | mobile | B |  |
| KabeHub_Capacitor化_実装方針_v10_2026-08-21.md | 2026-08-21 | 26.6KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v11_2026-08-22.md | 2026-08-22 | 16.1KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v12_2026-08-22.md | 2026-08-22 | 21.7KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v13_2026-08-22.md | 2026-08-22 | 11.1KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v14_2026-08-23.md | 2026-08-23 | 11.2KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v15_2026-08-23.md | 2026-08-23 | 10.6KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v16.md | 2026-08-23* | 21.9KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v17.md | 2026-08-23* | 13.5KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v18.md | 2026-08-23* | 17.9KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v19.md | 2026-08-23* | 14.4KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v1_2026-08-18.md | 2026-08-18 | 10.2KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v20.md | 2026-08-25* | 12.0KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v21.md | 2026-08-26* | 11.8KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v22.md | 2026-08-27* | 13.5KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v23_自己完結版.md | 2026-08-27* | 23.3KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v24_自己完結版.md | 2026-08-30* | 33.4KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v25_自己完結版.md | 2026-08-30* | 41.9KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v26_自己完結版.md | 2026-08-30* | 43.2KB | 方針ドラフト | mobile | A | 系列の最新版(v26) |
| KabeHub_Capacitor化_実装方針_v2_2026-08-18.md | 2026-08-18 | 21.0KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v3_2026-08-18.md | 2026-08-18 | 29.7KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v4_2026-08-19.md | 2026-08-19 | 29.5KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v5_2026-08-19.md | 2026-08-19 | 32.8KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v6_2026-08-20.md | 2026-08-20 | 44.7KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v7_2026-08-20.md | 2026-08-20 | 10.5KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v8_2026-08-21.md | 2026-08-21 | 15.2KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_実装方針_v9_2026-08-21.md | 2026-08-21 | 5.6KB | 方針ドラフト | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v10_2026-08-22.md | 2026-08-22 | 13.7KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v11_2026-08-22.md | 2026-08-22 | 15.2KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v12_2026-08-23.md | 2026-08-23 | 13.0KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v13_2026-08-23.md | 2026-08-23 | 26.4KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v14.md | 2026-08-23* | 15.5KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v15.md | 2026-08-23* | 22.1KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v16.md | 2026-08-23* | 17.8KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v17.md | 2026-08-25* | 19.0KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v18.md | 2026-08-26* | 16.1KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v19.md | 2026-08-27* | 14.4KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v1_2026-08-17.md | 2026-08-17 | 12.4KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v20_自己完結版.md | 2026-08-27* | 43.9KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v21_自己完結版.md | 2026-08-30* | 55.3KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v22_自己完結版.md | 2026-08-30* | 64.9KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v23_自己完結版.md | 2026-08-30* | 71.4KB | 引き継ぎ | mobile | A | 系列の最新版(v23) |
| KabeHub_Capacitor化_引き継ぎ資料_v2_2026-08-18.md | 2026-08-18 | 25.9KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v3_2026-08-18.md | 2026-08-18 | 8.1KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v4_2026-08-19.md | 2026-08-19 | 8.6KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v5_2026-08-19.md | 2026-08-19 | 10.7KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v6_2026-08-20.md | 2026-08-20 | 17.2KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v7_2026-08-21.md | 2026-08-21 | 13.0KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v8_2026-08-21.md | 2026-08-21 | 15.7KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_引き継ぎ資料_v9_2026-08-22.md | 2026-08-22 | 10.5KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_Capacitor化_残タスク整理_v2_2026-09-05.md | 2026-09-05 | 6.0KB | 引き継ぎ | mobile | A |  |
| KabeHub_CodexHook修正ログ_20260607.md | 2026-06-07 | 5.3KB | ログ | mcp | B |  |
| KabeHub_Gemini4Argon組み込み_引き継ぎ資料_v1.md | 2026-11-25* | 9.4KB | 引き継ぎ | models-and-pricing | A |  |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v1.md | 2026-09-16* | 12.7KB | 引き継ぎ | project-memory / lore-rag | C | 旧版 |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v10.md | 2026-10-01* | 13.1KB | 引き継ぎ | project-memory / lore-rag | C | 旧版 |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v11.md | 2026-10-01* | 16.8KB | 引き継ぎ | project-memory / lore-rag | C | 旧版 |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v12.md | 2026-10-01* | 22.2KB | 引き継ぎ | project-memory / lore-rag | C | 旧版 |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v13.md | 2026-10-01* | 15.9KB | 引き継ぎ | project-memory / lore-rag | A | 系列の最新版(v13) |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v2.md | 2026-09-16* | 16.1KB | 引き継ぎ | project-memory / lore-rag | C | 旧版 |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v3.md | 2026-09-24* | 15.4KB | 引き継ぎ | project-memory / lore-rag | C | 旧版 |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v4.md | 2026-09-28* | 16.9KB | 引き継ぎ | project-memory / lore-rag | C | 旧版 |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v5.md | 2026-09-28* | 20.7KB | 引き継ぎ | project-memory / lore-rag | C | 旧版 |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v6.md | 2026-09-29* | 31.6KB | 引き継ぎ | project-memory / lore-rag | C | 旧版 |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v7.md | 2026-09-29* | 18.4KB | 引き継ぎ | project-memory / lore-rag | C | 旧版 |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v8.md | 2026-11-25* | 23.0KB | 引き継ぎ | project-memory / lore-rag | C | 旧版 |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v9.md | 2026-09-29* | 22.0KB | 引き継ぎ | project-memory / lore-rag | C | 旧版 |
| KabeHub_Lv2_B2_Codex実装指示書_v1.md | 2026-11-25* | 16.1KB | Codex指示書 | rich-conversation | C | B1〜B10反映：C相当（実装済みの指示書。結果は統合引き継ぎ資料v12・コードで確認） |
| KabeHub_Lv2_B2_方針ドラフト_v1.md | 2026-11-25* | 9.9KB | 方針ドラフト | rich-conversation | C | 旧版 |
| KabeHub_Lv2_B2_方針ドラフト_v2.md | 2026-11-25* | 12.3KB | 方針ドラフト | rich-conversation | B | 系列の最新版(v2) |
| KabeHub_Lv2_Phase3b_Codex実装指示書_v1.md | 2026-11-25* | 24.3KB | Codex指示書 | rich-conversation | C | B1〜B10反映：C相当（実装済みの指示書。結果は統合引き継ぎ資料v12・コードで確認） |
| KabeHub_Lv2_Phase3b_Codex読み取り調査指示書_v1.md | 2026-11-25* | 11.6KB | Codex指示書 | rich-conversation | C | B1〜B10反映：C相当（実装済みの指示書。結果は統合引き継ぎ資料v12・コードで確認） |
| KabeHub_Lv2_Phase3b_方針ドラフト_v1.md | 2026-11-25* | 11.3KB | 方針ドラフト | rich-conversation | C | 旧版 |
| KabeHub_Lv2_Phase3b_方針ドラフト_v2.md | 2026-11-25* | 13.8KB | 方針ドラフト | rich-conversation | C | 旧版 |
| KabeHub_Lv2_Phase3b_方針ドラフト_v3.md | 2026-11-25* | 20.3KB | 方針ドラフト | rich-conversation | B | 系列の最新版(v3) |
| KabeHub_Lv2_カード本文リスト対応_Codex実装指示書_v1.md | 2026-11-25* | 8.0KB | Codex指示書 | rich-conversation | C | B1〜B10反映：C相当（実装済みの指示書。結果は統合引き継ぎ資料v12・コードで確認） |
| KabeHub_MCP認証エラー調査メモ_解決済み.md | 2026-04-30* | 7.2KB | 備忘録 | mcp | A |  |
| KabeHub_MD-2_引き継ぎ資料_20260729.md | 2026-07-29 | 13.7KB | 引き継ぎ | auth-and-security | C | B1〜B10反映：C相当（B6／B7の最終版でカバー済み） |
| KabeHub_MF-3実装方針_引き継ぎ資料_2026-08-05.md | 2026-08-05 | 16.7KB | 引き継ぎ | auth-and-security | C | 経過版（完了版あり） |
| KabeHub_MF-3実装方針_引き継ぎ資料_2026-08-06.md | 2026-08-06 | 21.7KB | 引き継ぎ | auth-and-security | C | 経過版（完了版あり） |
| KabeHub_MF-3実装方針_引き継ぎ資料_2026-08-07.md | 2026-08-07 | 26.0KB | 引き継ぎ | auth-and-security | C | 経過版（完了版あり） |
| KabeHub_MF-3実装方針_引き継ぎ資料（MF-3完了）_2026-08-07.md | 2026-08-07 | 29.1KB | 引き継ぎ | auth-and-security | C | B1〜B10反映：C相当（B6／B7の最終版でカバー済み） |
| KabeHub_MF-5a実装方針_引き継ぎ資料_2026-08-07.md | 2026-08-07 | 14.4KB | 引き継ぎ | auth-and-security | C | 経過版（最終版あり） |
| KabeHub_MF-5a実装方針v3_最終版_2026-08-07.md | 2026-08-07 | 11.2KB | 引き継ぎ | auth-and-security | C | B1〜B10反映：C相当（B6／B7の最終版でカバー済み） |
| KabeHub_MG実装方針_引き継ぎ資料_v3_2026-08-08.md | 2026-08-08 | 19.1KB | 引き継ぎ | auth-and-security | C | B1〜B10反映：C相当（B6／B7の最終版でカバー済み） |
| KabeHub_Next16アップグレードチケット_前提チケット.md | 2026-07-23* | 5.8KB | Codex指示書 | auth-and-security / (横断) operations | A | Next16前提チケット |
| KabeHub_Phase4_匿名トライアル論点整理_2026-08-12.md | 2026-08-12 | 9.4KB | 方針ドラフト | (横断) roadmap/backlog / auth-and-security | A | Phase4匿名トライアル論点 |
| KabeHub_PhaseA5-3_統一ロジック置き換え_詳細検討資料.md | 2026-06-14* | 29.6KB | 方針ドラフト | branching-and-regenerate | B |  |
| KabeHub_PhaseA5_kaiketsu_logic_matome.md | 2026-06-14* | 13.3KB | 方針ドラフト | branching-and-regenerate | A |  |
| KabeHub_PhaseB_分岐ツリー実装指示.md | 2026-06-14* | 10.6KB | Codex指示書 | branching-and-regenerate | B |  |
| KabeHub_PhaseB_実装まとめ_既知バグ.md | 2026-06-14* | 5.4KB | 実装報告 | branching-and-regenerate | B |  |
| KabeHub_PhaseE_Codex指示書_v1.md | 2026-09-11* | 12.6KB | Codex指示書 | project-memory | B | 要判断：Cを検討（B1〜B10反映：判断が割れた。Bのまま） |
| KabeHub_PhaseE_実装方針ドラフト_v5_Claude案.md | 2026-09-11* | 23.9KB | 方針ドラフト | project-memory | B | 要判断：Cを検討（B1〜B10反映：判断が割れた。Bのまま） |
| KabeHub_Project_Memory_Manager_post-MVPバックログ優先順位_v1.md | 2026-09-12* | 3.8KB | 方針ドラフト | project-memory / (横断) roadmap/backlog | C | 旧版 |
| KabeHub_Project_Memory_Manager_post-MVPバックログ優先順位_v2.md | 2026-09-12* | 6.1KB | 方針ドラフト | project-memory / (横断) roadmap/backlog | C | 旧版 |
| KabeHub_Project_Memory_Manager_post-MVPバックログ優先順位_v3.md | 2026-09-13* | 10.0KB | 方針ドラフト | project-memory / (横断) roadmap/backlog | C | 旧版 |
| KabeHub_Project_Memory_Manager_post-MVPバックログ優先順位_v4.md | 2026-09-13* | 11.0KB | 方針ドラフト | project-memory / (横断) roadmap/backlog | C | 旧版 |
| KabeHub_Project_Memory_Manager_post-MVPバックログ優先順位_v5.md | 2026-09-14* | 11.5KB | 方針ドラフト | project-memory / (横断) roadmap/backlog | C | 旧版 |
| KabeHub_Project_Memory_Manager_post-MVPバックログ優先順位_v6.md | 2026-09-16* | 5.5KB | 方針ドラフト | project-memory / (横断) roadmap/backlog | C | 旧版 |
| KabeHub_Project_Memory_Manager_post-MVPバックログ優先順位_v7.md | 2026-09-16* | 6.8KB | 方針ドラフト | project-memory / (横断) roadmap/backlog | A | 系列の最新版(v7) |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v10_2026-09-09.md | 2026-09-09 | 21.0KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v11_2026-09-09.md | 2026-09-09 | 9.4KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v12.md | 2026-09-09* | 12.4KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v13.md | 2026-09-10* | 7.5KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v14.md | 2026-09-10* | 12.8KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v15.md | 2026-09-10* | 15.3KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v16.md | 2026-09-11* | 15.1KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v17.md | 2026-09-11* | 15.4KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v18.md | 2026-09-11* | 8.2KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v19.md | 2026-09-12* | 7.1KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v20.md | 2026-09-12* | 9.5KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v21.md | 2026-09-13* | 15.7KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v22.md | 2026-09-13* | 21.8KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v23.md | 2026-09-14* | 23.9KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v24.md | 2026-09-14* | 20.3KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v25.md | 2026-09-16* | 11.7KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v26.md | 2026-09-16* | 14.9KB | 引き継ぎ | project-memory | A | 系列の最新版(v26) |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v2_2026-09-08.md | 2026-09-08 | 20.7KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v4_2026-09-08.md | 2026-09-08 | 12.7KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v5_2026-09-08.md | 2026-09-08 | 12.8KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v6_2026-09-08.md | 2026-09-08 | 12.6KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v7_2026-09-08.md | 2026-09-08 | 15.2KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v8_2026-09-08.md | 2026-09-08 | 13.1KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v9_2026-09-09.md | 2026-09-09 | 14.8KB | 引き継ぎ | project-memory | C | 旧版 |
| KabeHub_RAG改善設計メモ_v142以降.md | 2026-06-09* | 9.7KB | 方針ドラフト | lore-rag | B | 無番号版。_01〜_04と内容が異なる（行差分40〜67行） |
| KabeHub_RAG改善設計メモ_v142以降_01.md | 2026-06-09* | 8.9KB | 方針ドラフト | lore-rag | C | B1〜B10反映：C（_04が最新で内容を含む） |
| KabeHub_RAG改善設計メモ_v142以降_02.md | 2026-06-09* | 9.0KB | 方針ドラフト | lore-rag | C | B1〜B10反映：C（_04が最新で内容を含む） |
| KabeHub_RAG改善設計メモ_v142以降_03.md | 2026-06-09* | 9.7KB | 方針ドラフト | lore-rag | C | B1〜B10反映：C（_04が最新で内容を含む） |
| KabeHub_RAG改善設計メモ_v142以降_04.md | 2026-06-09* | 10.5KB | 方針ドラフト | lore-rag | A |  |
| KabeHub_RAG機能実装メモ_Temporal版_v2.md | 2026-06-07* | 30.9KB | 方針ドラフト | lore-rag | A |  |
| KabeHub_UIリデザイン引き継ぎ_v1.md | 2026-04-07* | 8.0KB | 引き継ぎ | chat-ui | C | 旧版 |
| KabeHub_UIリデザイン引き継ぎ_v2.md | 2026-04-08* | 7.3KB | 引き継ぎ | chat-ui | C | 旧版 |
| KabeHub_UIリデザイン引き継ぎ_v3.md | 2026-04-08* | 7.7KB | 引き継ぎ | chat-ui | A | 系列の最新版(v3) |
| KabeHub_explore_cursor注入対応_引き継ぎ資料_v1.md | 2026-10-28* | 8.3KB | 引き継ぎ | sharing-and-explore | A |  |
| KabeHub_folder_name統一_Phase0_調査結果_v1.md | 2026-09-14* | 8.1KB | 実装報告 | project-memory | B |  |
| KabeHub_folder_name統一_Phase1_完了報告_v1.md | 2026-09-14* | 8.1KB | 実装報告 | project-memory | B |  |
| KabeHub_folder_name統一_Phase2_完了報告_v1.md | 2026-09-15* | 12.1KB | 実装報告 | project-memory | B |  |
| KabeHub_folder_name統一_Phase3_完了報告_v1.md | 2026-09-15* | 12.0KB | 実装報告 | project-memory | B |  |
| KabeHub_folder_name統一_Phase4_完了報告_v1.md | 2026-09-16* | 12.2KB | 実装報告 | project-memory | B |  |
| KabeHub_folder_name統一_Phase5A_完了報告_v1.md | 2026-09-16* | 14.2KB | 実装報告 | project-memory | B |  |
| KabeHub_folder_name統一_Phase5B_完了報告_v1.md | 2026-09-16* | 13.1KB | 実装報告 | project-memory | B |  |
| KabeHub_folder_name統一_Phase5C_完了報告_v1.md | 2026-09-16* | 15.4KB | 実装報告 | project-memory | B |  |
| KabeHub_folder_name統一_設計検討_引き継ぎ資料_v1.md | 2026-09-14* | 17.1KB | 引き継ぎ | project-memory | A |  |
| KabeHub_middleware_explore対応_引き継ぎ.md | 2026-07-20* | 6.5KB | 引き継ぎ | sharing-and-explore / auth-and-security | A |  |
| KabeHub_v111_修正メモ.md | 2026-06-03* | 8.8KB | 備忘録 | chat-core | B | コードレビューその2に基づく修正メモ |
| KabeHub_v138_デバッグまとめ_20260608.md | 2026-06-08 | 5.8KB | 備忘録 | lore-rag | B |  |
| KabeHub_ジャンル分類機能_設計メモ.md | 2026-04-05* | 6.4KB | 方針ドラフト | sharing-and-explore | A |  |
| KabeHub_スマホアプリ化軽タスク引き継ぎ資料_2026-08-28.md | 2026-08-28 | 6.5KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_スマホアプリ化軽タスク引き継ぎ資料_v2_2026-08-28.md | 2026-08-28 | 13.1KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_スマホアプリ化軽タスク引き継ぎ資料_v3_2026-08-28.md | 2026-08-28 | 14.9KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_スマホアプリ化軽タスク引き継ぎ資料_v4_2026-08-28.md | 2026-08-28 | 11.8KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_スマホアプリ化軽タスク引き継ぎ資料_v5_2026-08-28.md | 2026-08-28 | 15.8KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_スマホアプリ化軽タスク引き継ぎ資料_v6_2026-08-29.md | 2026-08-29 | 17.9KB | 引き継ぎ | mobile | C | 旧版 |
| KabeHub_スマホアプリ化軽タスク引き継ぎ資料_v7_2026-08-29.md | 2026-08-29 | 13.2KB | 引き継ぎ | mobile | B | 系列の最新版(v7) |
| KabeHub_スマホレスポンシブ対応_引き継ぎ_20260624 (1).md | 2026-06-24 | 18.4KB | 引き継ぎ | mobile / chat-ui | C | 旧版。v166版（更新日時が新しい・CLAUDE.md参照先）が現行 |
| KabeHub_スマホレスポンシブ対応_引き継ぎ_20260624_v166.md | 2026-06-24 | 20.8KB | 引き継ぎ | mobile / chat-ui | A | CLAUDE.mdが詳細の参照先に指定。chat-uiとmobileの両方を担当（Capacitor部は約60行） |
| KabeHub_スレッド削除ゴミ箱化_引き継ぎ資料_v1.md | 2026-10-23* | 14.9KB | 引き継ぎ | trash | C | 旧版 |
| KabeHub_スレッド削除ゴミ箱化_引き継ぎ資料_v2.md | 2026-10-23* | 18.7KB | 引き継ぎ | trash | C | 旧版 |
| KabeHub_スレッド削除ゴミ箱化_引き継ぎ資料_v3.md | 2026-10-25* | 18.7KB | 引き継ぎ | trash | A | 系列の最新版(v3) |
| KabeHub_セキュリティ強化記録_20260603.md | 2026-06-03 | 10.7KB | 備忘録 | auth-and-security | A |  |
| KabeHub_セッションログ_20260607_v133.md | 2026-06-07 | 7.5KB | ログ | (横断) history/changelog・status | B | セッションログ（v133） |
| KabeHub_タスク10_GitHub_OAuth_mobile化_引き継ぎ資料_2026-08-24.md | 2026-08-24 | 14.8KB | 引き継ぎ | mobile / github-integration | B | GitHub OAuthのmobile化／代替済み（github-integration.md と引継v23 §2） |
| KabeHub_タスク10_作業終了メモ_2026-08-26.md | 2026-08-26 | 6.3KB | 引き継ぎ | mobile / github-integration | B | GitHub OAuthのmobile化／代替済み（github-integration.md と引継v23 §2） |
| KabeHub_タスク10_残作業まとめ_2026-08-25.md | 2026-08-25 | 7.4KB | 引き継ぎ | mobile / github-integration | B | GitHub OAuthのmobile化／代替済み（github-integration.md と引継v23 §2） |
| KabeHub_チャット参照元整理_Pinnedキャッシュ化_引き継ぎ資料_v1.md | 2026-10-02* | 17.3KB | 引き継ぎ | chat-core | B | Pinned Filesのキャッシュ化（別トラックのv1）。旧版ではない。B1抽出時の指摘によりRui承認 |
| KabeHub_チャット参照元整理_Project_Memoryチャット注入_引き継ぎ資料_v2.md | 2026-10-02* | 26.5KB | 引き継ぎ | chat-core / project-memory | C | 旧版 |
| KabeHub_チャット参照元整理_Project_Memoryチャット注入_引き継ぎ資料_v3.md | 2026-10-03* | 14.8KB | 引き継ぎ | chat-core / project-memory | C | 旧版 |
| KabeHub_チャット参照元整理_Project_Memoryチャット注入_引き継ぎ資料_v4.md | 2026-10-03* | 11.8KB | 引き継ぎ | chat-core / project-memory | C | 旧版 |
| KabeHub_チャット参照元整理_Project_Memoryチャット注入_引き継ぎ資料_v5.md | 2026-10-03* | 11.5KB | 引き継ぎ | chat-core / project-memory | C | 旧版 |
| KabeHub_チャット参照元整理_設定ドロワータブ化_引き継ぎ資料_v6.md | 2026-10-04* | 18.4KB | 引き継ぎ | chat-core / project-memory | C | 旧版 |
| KabeHub_チャット参照元整理_課題B完了_引き継ぎ資料_v10.md | 2026-10-05* | 41.5KB | 引き継ぎ | chat-core / project-memory | A | 系列の最新版(v10) |
| KabeHub_チャット参照元整理_課題B完了_引き継ぎ資料_v7.md | 2026-10-04* | 17.4KB | 引き継ぎ | chat-core / project-memory | C | 旧版 |
| KabeHub_チャット参照元整理_課題B完了_引き継ぎ資料_v8.md | 2026-10-04* | 23.8KB | 引き継ぎ | chat-core / project-memory | C | 旧版 |
| KabeHub_チャット参照元整理_課題B完了_引き継ぎ資料_v9.md | 2026-10-05* | 34.7KB | 引き継ぎ | chat-core / project-memory | C | 旧版 |
| KabeHub_ハイライト機能_Codex読み取り調査指示書_v1.md | 2026-11-25* | 13.3KB | Codex指示書 | highlight | C | B1〜B10反映：C（調査は完了済み。結論は検討v3に反映） |
| KabeHub_ハイライト機能_検討_引き継ぎ資料_v1.md | 2026-11-01* | 15.7KB | 引き継ぎ | highlight | C | 旧版 |
| KabeHub_ハイライト機能_検討_引き継ぎ資料_v2.md | 2026-11-01* | 27.2KB | 引き継ぎ | highlight | C | 旧版 |
| KabeHub_ハイライト機能_検討_引き継ぎ資料_v3.md | 2026-11-01* | 34.1KB | 引き継ぎ | highlight | A | 系列の最新版(v3) |
| KabeHub_モデル追加チケット_GPT5.6_Gemini3.6.md | 2026-07-23* | 12.5KB | Codex指示書 | models-and-pricing | C | 旧版（確定版が正本。ただし要照合） |
| KabeHub_モデル追加チケット_確定版_GPT5.6_Gemini3.6.md | 2026-07-23* | 18.2KB | Codex指示書 | models-and-pricing | B | B1〜B10反映：正本を再修_から確定版へ変更（確定版のほうが新しい）。ただし再修_との差があり要照合（§6-1） |
| KabeHub_モデル運用棚卸し.md | 2026-09-06* | 10.1KB | 備忘録 | models-and-pricing | B | B1〜B10反映：A→B |
| KabeHub_リッチ会話UI_Lv1Lv2_検討_引き継ぎ資料_v1.md | 2026-10-25* | 44.3KB | 引き継ぎ | rich-conversation | C | 旧版 |
| KabeHub_リッチ会話UI_Lv1Lv2_検討_引き継ぎ資料_v10.md | 2026-11-01* | 12.7KB | 引き継ぎ | rich-conversation | C | 旧版 |
| KabeHub_リッチ会話UI_Lv1Lv2_検討_引き継ぎ資料_v11.md | 2026-11-01* | 14.5KB | 引き継ぎ | rich-conversation | C | 旧版 |
| KabeHub_リッチ会話UI_Lv1Lv2_検討_引き継ぎ資料_v2.md | 2026-10-25* | 27.7KB | 引き継ぎ | rich-conversation | C | 旧版 |
| KabeHub_リッチ会話UI_Lv1Lv2_検討_引き継ぎ資料_v3.md | 2026-10-30* | 42.2KB | 引き継ぎ | rich-conversation | C | 旧版 |
| KabeHub_リッチ会話UI_Lv1Lv2_検討_引き継ぎ資料_v4.md | 2026-10-30* | 47.3KB | 引き継ぎ | rich-conversation | C | 旧版 |
| KabeHub_リッチ会話UI_Lv1Lv2_検討_引き継ぎ資料_v5.md | 2026-10-31* | 64.6KB | 引き継ぎ | rich-conversation | C | 旧版 |
| KabeHub_リッチ会話UI_Lv1Lv2_検討_引き継ぎ資料_v6.md | 2026-10-31* | 19.0KB | 引き継ぎ | rich-conversation | C | 旧版 |
| KabeHub_リッチ会話UI_Lv1Lv2_検討_引き継ぎ資料_v7.md | 2026-10-31* | 8.6KB | 引き継ぎ | rich-conversation | C | 旧版 |
| KabeHub_リッチ会話UI_Lv1Lv2_検討_引き継ぎ資料_v8.md | 2026-11-01* | 12.6KB | 引き継ぎ | rich-conversation | C | 旧版 |
| KabeHub_リッチ会話UI_Lv1Lv2_検討_引き継ぎ資料_v9.md | 2026-11-01* | 16.3KB | 引き継ぎ | rich-conversation | C | 旧版 |
| KabeHub_リッチ会話UI_Lv1Lv2_統合_引き継ぎ資料_v12.md | 2026-11-01* | 40.2KB | 引き継ぎ | rich-conversation | A | 系列の最新版(v12) |
| KabeHub_公開準備タスクリスト_v2.md | 2026-04-08* | 6.3KB | 備忘録 | auth-and-security / (横断) roadmap/backlog | C | 旧版 |
| KabeHub_公開準備タスクリスト_v3.md | 2026-04-08* | 4.5KB | 備忘録 | auth-and-security / (横断) roadmap/backlog | C | 系列旧版（.txtと同内容） |
| KabeHub_公開準備タスクリスト_v3.txt | 2026-04-08* | 4.5KB | 備忘録 | auth-and-security / (横断) roadmap/backlog | C | 重複（.mdとmd5一致） |
| KabeHub_公開準備タスクリスト_v4.md | 2026-04-09* | 5.3KB | 備忘録 | auth-and-security / (横断) roadmap/backlog | C | 旧版 |
| KabeHub_公開準備タスクリスト_v5.md | 2026-04-09* | 6.2KB | 備忘録 | auth-and-security / (横断) roadmap/backlog | C | 旧版 |
| KabeHub_公開準備タスクリスト_v6.md | 2026-04-09* | 6.7KB | 備忘録 | (横断) overview / (横断) operations | B | 系列の最新版(v6) |
| KabeHub_内部モデル刷新_引き継ぎ資料_v1.md | 2026-09-06* | 8.1KB | 引き継ぎ | models-and-pricing | C | 旧版 |
| KabeHub_内部モデル刷新_引き継ぎ資料_v2.md | 2026-09-07* | 10.3KB | 引き継ぎ | models-and-pricing | C | 旧版 |
| KabeHub_内部モデル刷新_引き継ぎ資料_v3.md | 2026-09-07* | 16.8KB | 引き継ぎ | models-and-pricing | C | 旧版 |
| KabeHub_内部モデル刷新_引き継ぎ資料_v4.md | 2026-09-07* | 29.9KB | 引き継ぎ | models-and-pricing | C | 旧版 |
| KabeHub_内部モデル刷新_引き継ぎ資料_v5.md | 2026-10-12* | 5.2KB | 引き継ぎ | models-and-pricing | C | 旧版 |
| KabeHub_内部モデル刷新_引き継ぎ資料_v6.md | 2026-10-12* | 13.4KB | 引き継ぎ | models-and-pricing | A | 系列の最新版(v6) |
| KabeHub_変更履歴アーカイブ_v133-v140.md | 2026-06-09* | 15.8KB | 引き継ぎ | (横断) history/changelog・status | B |  |
| KabeHub_変更履歴アーカイブ_v160-v172.md | 2026-06-29* | 22.7KB | 引き継ぎ | (横断) history/changelog・status | B |  |
| KabeHub_変更履歴アーカイブ_v171-v181.md | 2026-08-16* | 50.8KB | 引き継ぎ | (横断) history/changelog・status | B | v160-v172版と範囲が一部重複 |
| KabeHub_変更履歴アーカイブ_v182-v190.md | 2026-10-22* | 47.5KB | 引き継ぎ | (横断) history/changelog・status | A | B1〜B10反映：B→A |
| KabeHub_小説執筆モード実装方針_20260517.md | 2026-05-17 | 18.1KB | 方針ドラフト | novel-and-roleplay | A |  |
| KabeHub_引き継ぎメモ_分岐ツリー可視化_v8.md | 2026-06-14* | 6.9KB | 引き継ぎ | branching-and-regenerate | C | 旧版 |
| KabeHub_引き継ぎメモ_分岐ツリー可視化_v9.md | 2026-06-14* | 5.1KB | 引き継ぎ | branching-and-regenerate | A | 系列の最新版(v9) |
| KabeHub_引き継ぎメモ_分岐履歴レールUI.md | 2026-06-13* | 11.4KB | 引き継ぎ | branching-and-regenerate | C | 旧版 |
| KabeHub_引き継ぎメモ_分岐履歴レールUI_v2.md | 2026-06-13* | 18.1KB | 引き継ぎ | branching-and-regenerate | C | 旧版 |
| KabeHub_引き継ぎメモ_分岐履歴レールUI_v3.md | 2026-06-13* | 22.8KB | 引き継ぎ | branching-and-regenerate | C | 旧版 |
| KabeHub_引き継ぎメモ_分岐履歴レールUI_v4.md | 2026-06-13* | 18.4KB | 引き継ぎ | branching-and-regenerate | C | 旧版 |
| KabeHub_引き継ぎメモ_分岐履歴レールUI_v5.md | 2026-06-13* | 30.9KB | 引き継ぎ | branching-and-regenerate | C | 旧版 |
| KabeHub_引き継ぎメモ_分岐履歴レールUI_v6.md | 2026-06-14* | 29.5KB | 引き継ぎ | branching-and-regenerate | C | 旧版 |
| KabeHub_引き継ぎメモ_分岐履歴レールUI_v7.md | 2026-06-14* | 41.2KB | 引き継ぎ | branching-and-regenerate | B | 分岐履歴レールUIの最終版(v7)。B1抽出時の指摘によりRui承認 |
| KabeHub_引き継ぎ資料_2026-08-10.md | 2026-08-10 | 14.5KB | 引き継ぎ | (横断) history/changelog・status | B | 8月のセッション引き継ぎ。08-16総括に内容が含まれない（行一致3〜5/74〜103） |
| KabeHub_引き継ぎ資料_2026-08-12.md | 2026-08-12 | 11.9KB | 引き継ぎ | (横断) history/changelog・status | B | 8月のセッション引き継ぎ。08-16総括に内容が含まれない（行一致3〜5/74〜103） |
| KabeHub_引き継ぎ資料_2026-08-13.md | 2026-08-13 | 14.7KB | 引き継ぎ | (横断) history/changelog・status | B | 8月のセッション引き継ぎ。08-16総括に内容が含まれない（行一致3〜5/74〜103） |
| KabeHub_引き継ぎ資料_2026-08-13_v2.md | 2026-08-13 | 19.4KB | 引き継ぎ | (横断) history/changelog・status | B | 8月のセッション引き継ぎ。08-16総括に内容が含まれない（行一致3〜5/74〜103） |
| KabeHub_引き継ぎ資料_20260329_v1.md | 2026-03-29 | 9.2KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260329_v2.md | 2026-03-29 | 14.9KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260329_v3.md | 2026-03-29 | 20.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260329_v4.md | 2026-03-29 | 17.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260329_v5.md | 2026-03-29 | 19.0KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260329_v6.md | 2026-03-29 | 20.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260330_v8.md | 2026-03-30 | 24.0KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260330_v9.md | 2026-03-30 | 24.0KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260401_v13.md | 2026-04-01 | 34.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260401_v15.md | 2026-04-01 | 37.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260401_v16.md | 2026-04-01 | 37.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260401_v17.md | 2026-04-01 | 34.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260402_v18.md | 2026-04-02 | 19.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260402_v19.md | 2026-04-02 | 22.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260403_v20.md | 2026-04-03 | 24.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260403_v21.md | 2026-04-03 | 29.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260403_v22.md | 2026-04-03 | 31.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260403_v23.md | 2026-04-03 | 35.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260404_v24.md | 2026-04-04 | 36.5KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260404_v25.md | 2026-04-04 | 37.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260405_v26.md | 2026-04-05 | 42.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260405_v27.md | 2026-04-05 | 37.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260405_v28.md | 2026-04-05 | 38.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260405_v29.md | 2026-04-05 | 40.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260405_v30.md | 2026-04-05 | 41.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260405_v30（次回セッション向け）.md | 2026-04-05 | 46.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260406_v31_次回セッション向け.md | 2026-04-06 | 38.2KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260406_v32.md | 2026-04-06 | 39.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260406_v33.md | 2026-04-06 | 41.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260406_v34.md | 2026-04-06 | 44.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260406_v35.md | 2026-04-06 | 51.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260406_v36.md | 2026-04-06 | 51.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260406_v37.md | 2026-04-06 | 55.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260407_v38.md | 2026-04-07 | 57.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260407_v39.md | 2026-04-07 | 62.0KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260407_v40.md | 2026-04-07 | 66.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260407_v41.md | 2026-04-07 | 64.5KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260407_v42.md | 2026-04-07 | 68.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260407_v43.md | 2026-04-07 | 51.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260408_v44.md | 2026-04-08 | 53.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260408_v45.md | 2026-04-08 | 16.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260408_v46.md | 2026-04-08 | 21.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260408_v47.md | 2026-04-08 | 22.5KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260408_v48.md | 2026-04-08 | 22.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260408_v49.md | 2026-04-08 | 24.0KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260408_v50.md | 2026-04-08 | 36.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260409_v51.md | 2026-04-09 | 22.5KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260409_v52.md | 2026-04-09 | 26.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260409_v53.md | 2026-04-09 | 27.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260409_v54.md | 2026-04-09 | 30.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260419_v55.md | 2026-04-19 | 33.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260419_v56.md | 2026-04-19 | 36.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260420_v57.md | 2026-04-20 | 39.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260420_v58.md | 2026-04-20 | 41.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260420_v59.md | 2026-04-20 | 43.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260420_v60.md | 2026-04-20 | 44.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260422_v61.md | 2026-04-22 | 46.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260425_v62.md | 2026-04-25 | 48.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260425_v63.md | 2026-04-25 | 51.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260426_v63.md | 2026-04-26 | 38.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260426_v64.md | 2026-04-26 | 41.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260427_v65.md | 2026-04-27 | 43.0KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260427_v66.md | 2026-04-27 | 43.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260427_v67.md | 2026-04-27 | 44.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260428_v68.md | 2026-04-28 | 46.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260428_v69.md | 2026-04-28 | 47.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260429_v70.md | 2026-04-29 | 49.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260429_v71.md | 2026-04-29 | 50.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260429_v72.md | 2026-04-29 | 50.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260430_v73.md | 2026-04-30 | 53.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260430_v74.md | 2026-04-30 | 54.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260430_v75.md | 2026-04-30 | 56.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260430_v76.md | 2026-04-30 | 59.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260430_v77.md | 2026-04-30 | 66.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260430_v78.md | 2026-04-30 | 68.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260430_v79.md | 2026-04-30 | 65.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260430_v80.md | 2026-04-30 | 69.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260501_v81.md | 2026-05-01 | 72.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260502_v82.md | 2026-05-02 | 75.0KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260502_v83.md | 2026-05-02 | 75.9KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260504_v84.md | 2026-05-04 | 78.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260505_v85.md | 2026-05-05 | 81.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260505_v86.md | 2026-05-05 | 83.9KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260506_v87.md | 2026-05-06 | 86.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260508_v88.md | 2026-05-08 | 89.0KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260508_v89.md | 2026-05-08 | 91.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260509_v90.md | 2026-05-09 | 93.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260516_v91.md | 2026-05-16 | 16.5KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260516_v92.md | 2026-05-16 | 19.2KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260516_v93.md | 2026-05-16 | 24.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260517_v94.md | 2026-05-17 | 28.9KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260517_v95.md | 2026-05-17 | 34.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260517_v96.md | 2026-05-17 | 34.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260522_v97.md | 2026-05-22 | 41.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260523_v98.md | 2026-05-23 | 46.2KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260523_v99.md | 2026-05-23 | 49.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260526_v100.md | 2026-05-26 | 53.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260530_v101.md | 2026-05-30 | 56.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260530_v102.md | 2026-05-30 | 49.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260601_v103.md | 2026-06-01 | 54.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260601_v104.md | 2026-06-01 | 60.2KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260601_v105.md | 2026-06-01 | 65.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260601_v106.md | 2026-06-01 | 67.5KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260602_v107.md | 2026-06-02 | 72.2KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260602_v108.md | 2026-06-02 | 76.2KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260603_v109.md | 2026-06-03 | 27.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260603_v110.md | 2026-06-03 | 31.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260603_v111.md | 2026-06-03 | 36.5KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260603_v112.md | 2026-06-03 | 25.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260604_v113.md | 2026-06-04 | 30.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260605_v114.md | 2026-06-05 | 32.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260605_v115.md | 2026-06-05 | 34.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260605_v116.md | 2026-06-05 | 36.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260605_v117.md | 2026-06-05 | 39.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260606_v118.md | 2026-06-06 | 36.5KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260606_v119.md | 2026-06-06 | 41.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260606_v120.md | 2026-06-06 | 46.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260606_v121.md | 2026-06-06 | 49.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260607_v122.md | 2026-06-07 | 54.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260607_v123.md | 2026-06-07 | 58.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260607_v126.md | 2026-06-07 | 65.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260607_v127.md | 2026-06-07 | 70.7KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260607_v128.md | 2026-06-07 | 75.9KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260607_v129.md | 2026-06-07 | 78.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260607_v130.md | 2026-06-07 | 83.9KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260607_v131.md | 2026-06-07 | 87.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260607_v132.md | 2026-06-07 | 95.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260607_v133.md | 2026-06-07 | 12.5KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260608_v134.md | 2026-06-08 | 14.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260608_v136.md | 2026-06-08 | 18.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260608_v137.md | 2026-06-08 | 19.2KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260608_v138.md | 2026-06-08 | 25.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260608_v139.md | 2026-06-08 | 24.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260608_v140.md | 2026-06-08 | 29.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260609_v141.md | 2026-06-09 | 13.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260612_v142.md | 2026-06-12 | 16.0KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260612_v143.md | 2026-06-12 | 19.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260612_v144.md | 2026-06-12 | 27.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260613_v145.md | 2026-06-13 | 32.9KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260613_v146.md | 2026-06-13 | 35.9KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260613_v147.md | 2026-06-13 | 38.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260613_v148.md | 2026-06-13 | 45.0KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260614_v149.md | 2026-06-14 | 52.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260615_v150.md | 2026-06-15 | 59.5KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260615_v151.md | 2026-06-15 | 66.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260615_v152.md | 2026-06-15 | 71.0KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260615_v153.md | 2026-06-15 | 82.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260615_v154.md | 2026-06-15 | 84.5KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260615_v155.md | 2026-06-15 | 89.0KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260615_v156.md | 2026-06-15 | 92.9KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260615_v157.md | 2026-06-15 | 96.9KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260615_v158.md | 2026-06-15 | 100.2KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260615_v159.md | 2026-06-15 | 105.2KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260617_v160.md | 2026-06-17 | 107.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260618_v161.md | 2026-06-18 | 111.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260624_v162.md | 2026-06-24 | 109.3KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260624_v163.md | 2026-06-24 | 27.8KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260624_v164.md | 2026-06-24 | 30.5KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260624_v165.md | 2026-06-24 | 33.1KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260624_v166.md | 2026-06-24 | 37.2KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260628_v169.md | 2026-06-28 | 42.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260628_v170.md | 2026-06-28 | 45.0KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260629_v171.md | 2026-06-29 | 48.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_20260629_v173.md | 2026-06-29 | 52.2KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_Next16アップグレード作業中.md | 2026-07-23* | 8.5KB | 引き継ぎ | (横断) operations | C | 作業中の経過版（完了はロードマップ側） |
| KabeHub_引き継ぎ資料_PhaseA5実装後_未解決事項.md | 2026-06-13* | 13.3KB | 引き継ぎ | branching-and-regenerate | B |  |
| KabeHub_引き継ぎ資料_npm_audit対応完了とCodex全体監査着手_2026-07-13.md | 2026-07-13 | 6.7KB | 引き継ぎ | auth-and-security / (横断) operations | B |  |
| KabeHub_引き継ぎ資料_slim_20260629.md | 2026-06-29 | 19.4KB | 引き継ぎ | (横断) history/changelog・status | C | v173時点のスリム版。v176が後継 |
| KabeHub_引き継ぎ資料_v174.md | 2026-07-01* | 21.4KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_v175.md | 2026-07-01* | 24.9KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（v176が後継） |
| KabeHub_引き継ぎ資料_v176.md | 2026-07-23* | 29.6KB | 引き継ぎ | (横断) history/changelog・status | A | 最新の基準版（方針書§6） |
| KabeHub_引き継ぎ資料_v177.md | 2026-08-14* | 32.2KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断） |
| KabeHub_引き継ぎ資料_v178.md | 2026-07-28* | 42.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版。旧v178とmd5一致（07-28版）。新v178(08-14)が正本 |
| KabeHub_引き継ぎ資料_v179.md | 2026-08-15* | 76.4KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断） |
| KabeHub_引き継ぎ資料_v180.md | 2026-08-15* | 81.1KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断） |
| KabeHub_引き継ぎ資料_v181.md | 2026-08-15* | 87.2KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断） |
| KabeHub_引き継ぎ資料_v182.md | 2026-08-16* | 38.9KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断） |
| KabeHub_引き継ぎ資料_v183.md | 2026-08-16* | 41.8KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断） |
| KabeHub_引き継ぎ資料_v184.md | 2026-08-16* | 49.1KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断） |
| KabeHub_引き継ぎ資料_v185.md | 2026-08-17* | 58.0KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断） |
| KabeHub_引き継ぎ資料_v186.md | 2026-09-06* | 64.7KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断） |
| KabeHub_引き継ぎ資料_v187.md | 2026-09-07* | 73.9KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断） |
| KabeHub_引き継ぎ資料_v188.md | 2026-09-07* | 77.1KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断） |
| KabeHub_引き継ぎ資料_v190.md | 2026-09-07* | 86.2KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断） |
| KabeHub_引き継ぎ資料_v191.md | 2026-10-21* | 95.2KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断）。B1〜B10反映：A→B |
| KabeHub_引き継ぎ資料_v192.md | 2026-10-22* | 21.9KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断） |
| KabeHub_引き継ぎ資料_v193.md | 2026-10-25* | 39.4KB | 引き継ぎ | (横断) history/changelog・status | B | v177〜v193は拾い読み（#15の判断）。B1〜B10反映：A→B |
| KabeHub_引き継ぎ資料_v194.md | 2026-11-01* | 41.4KB | 引き継ぎ | (横断) history/changelog・status | A | 最新（方針書§6） |
| KabeHub_引き継ぎ資料_ノートPC同期と依存パッケージ点検_2026-07-13.md | 2026-07-13 | 4.9KB | 引き継ぎ | (横断) operations | B |  |
| KabeHub_引き継ぎ資料_入れ子分岐branch_root_idバグ.md | 2026-06-13* | 10.9KB | 実装報告 | branching-and-regenerate | B |  |
| KabeHub_引き継ぎ資料_全体監査A-I完了_2026-07-13.md | 2026-07-13 | 9.4KB | 引き継ぎ | auth-and-security | B |  |
| KabeHub_引き継ぎ資料_再生成二重発言バグ.md | 2026-06-14* | 5.5KB | 実装報告 | branching-and-regenerate | B |  |
| KabeHub_引き継ぎ資料_新v178.md | 2026-08-14* | 42.4KB | 引き継ぎ | (横断) history/changelog・status | B | v178の正本（08-14更新）。旧v178・v178（07-28）はC |
| KabeHub_引き継ぎ資料_旧v178.md | 2026-07-28* | 42.6KB | 引き継ぎ | (横断) history/changelog・status | C | 旧版（無印v178とmd5一致。新v178が正本） |
| KabeHub_未実装機能_統合バックログ_v1.md | 2026-11-25* | 35.6KB | 方針ドラフト | (横断) roadmap/backlog | C | 旧版 |
| KabeHub_未実装機能_統合バックログ_v2.md | 2026-11-17* | 45.4KB | 方針ドラフト | (横断) roadmap/backlog | C | 旧版 |
| KabeHub_未実装機能_統合バックログ_v3.md | 2026-11-17* | 52.1KB | 方針ドラフト | (横断) roadmap/backlog | A | 系列の最新版(v3) |
| KabeHub_検索改善_pg_trgm_仕様書.md | 2026-05-30* | 3.8KB | 方針ドラフト | search | B | B1〜B10反映：A→B |
| KabeHub_監査A_2026-07-13_更新版.md | 2026-07-13 | 8.7KB | 監査 | auth-and-security | B |  |
| KabeHub_監査A対応ロードマップ.md | 2026-07-15* | 16.1KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_B-04a終了.md | 2026-07-21* | 41.6KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_B-04b完了.md | 2026-07-22* | 51.0KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_B-05a完了.md | 2026-07-25* | 89.8KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_B-05b完了.md | 2026-07-25* | 103.6KB | 監査 | auth-and-security / (横断) history/changelog・status | A | 監査A最終版（方針書§6の指定） |
| KabeHub_監査A対応ロードマップ_B-05設計セッション完了.md | 2026-07-23* | 69.6KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_B01終了.md | 2026-07-20* | 15.0KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_B02終了.md | 2026-07-20* | 22.8KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_Next16完了.md | 2026-07-24* | 79.6KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_T10終了.md | 2026-07-18* | 42.6KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_T12終了.md | 2026-07-18* | 55.8KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_T6終了.md | 2026-07-16* | 27.2KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_T8終了.md | 2026-07-16* | 34.8KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_T9終了.md | 2026-07-18* | 36.8KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_delete_current_user終了.md | 2026-07-20* | 29.1KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_middleware完了.md | 2026-07-20* | 21.0KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ_モデル追加完了.md | 2026-07-23* | 58.9KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査A対応ロードマップ（T2終了）.md | 2026-07-14* | 16.1KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版・重複（監査A対応ロードマップ.mdとmd5一致） |
| KabeHub_監査A対応ロードマップ（T3終了）.md | 2026-07-16* | 20.6KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版（B-05b完了版が最終） |
| KabeHub_監査B対応ロードマップ(MB-a2終了）.md | 2026-07-26* | 23.4KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査B対応ロードマップ.md | 2026-07-26* | 17.4KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査B対応ロードマップ_MB-a3終了.md | 2026-07-26* | 34.3KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査B対応ロードマップ_MB-b完了.md | 2026-07-26* | 46.6KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査B対応ロードマップ_MB-c完了.md | 2026-07-27* | 68.8KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査B対応ロードマップ_MB-d完了.md | 2026-07-27* | 85.2KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査B対応ロードマップ_MB-e完了.md | 2026-07-27* | 101.2KB | 監査 | auth-and-security / (横断) history/changelog・status | B | 監査B最終（#10：B〜G各系列の最終版をBとする現状維持） |
| KabeHub_監査C対応ロードマップ.md | 2026-07-27* | 9.0KB | 監査 | (横断) operations / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査C対応ロードマップ_MC-2完了.md | 2026-07-27* | 12.7KB | 監査 | (横断) operations / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査C対応ロードマップ_MC-3完了.md | 2026-07-28* | 16.4KB | 監査 | (横断) operations / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査C対応ロードマップ_MC-4完了.md | 2026-07-28* | 23.5KB | 監査 | (横断) operations / (横断) history/changelog・status | B | 監査C最終 |
| KabeHub_監査D対応ロードマップ_D-12完了.md | 2026-07-28* | 11.1KB | 監査 | (横断) operations / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査D対応ロードマップ_MD-0完了.md | 2026-07-28* | 8.0KB | 監査 | (横断) operations / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査D対応ロードマップ_MD-1チェック完了.md | 2026-07-28* | 16.5KB | 監査 | (横断) operations / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査D対応ロードマップ_MD-1完了.md | 2026-07-28* | 15.5KB | 監査 | (横断) operations / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査D対応ロードマップ_MD-2完了.md | 2026-07-29* | 20.1KB | 監査 | (横断) operations / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査D対応ロードマップ_MD-3_グループ1完了.md | 2026-07-30* | 8.1KB | 監査 | (横断) operations / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査D対応ロードマップ_MD-3_グループ2完了.md | 2026-07-30* | 17.0KB | 監査 | (横断) operations / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査D対応ロードマップ_MD-3_グループ3完了.md | 2026-07-30* | 26.0KB | 監査 | (横断) operations / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査D対応ロードマップ_MD-3_グループ4完了.md | 2026-07-30* | 40.1KB | 監査 | (横断) operations / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査D対応ロードマップ_MD-3_全完了.md | 2026-07-31* | 40.0KB | 監査 | (横断) operations / (横断) history/changelog・status | B | 監査D最終 |
| KabeHub_監査Eロードマップ.md | 2026-08-01* | 62.3KB | 監査 | models-and-pricing / auth-and-security | C | 中間版 |
| KabeHub_監査Eロードマップ_E完了.md | 2026-08-01* | 69.6KB | 監査 | models-and-pricing / auth-and-security | B | 監査E最終 |
| KabeHub_監査E対応ロードマップ_ME-0完了.md | 2026-07-31* | 13.6KB | 監査 | models-and-pricing / auth-and-security | C | 中間版 |
| KabeHub_監査E対応ロードマップ_ME-1完了.md | 2026-07-31* | 24.4KB | 監査 | models-and-pricing / auth-and-security | C | 中間版 |
| KabeHub_監査E対応ロードマップ_ME-2完了.md | 2026-07-31* | 34.2KB | 監査 | models-and-pricing / auth-and-security | C | 中間版 |
| KabeHub_監査E対応ロードマップ_ME-3完了.md | 2026-08-01* | 47.0KB | 監査 | models-and-pricing / auth-and-security | C | 中間版 |
| KabeHub_監査E対応ロードマップ_ME-4再突合完了.md | 2026-08-01* | 53.5KB | 監査 | models-and-pricing / auth-and-security | C | 中間版 |
| KabeHub_監査E対応ロードマップ_ME-4完了.md | 2026-08-01* | 58.1KB | 監査 | models-and-pricing / auth-and-security | C | 中間版 |
| KabeHub_監査E対応ロードマップ_ME5ドラフト.md | 2026-08-01* | 8.4KB | 監査 | models-and-pricing / auth-and-security | C | 中間版 |
| KabeHub_監査F対応ロードマップ_Commit3完了.md | 2026-08-03* | 52.1KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_Commit4完了.md | 2026-08-03* | 59.5KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_MF-0完了.md | 2026-08-01* | 16.6KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_MF-1_Commit1完了.md | 2026-08-01* | 26.8KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_MF-1_Commit2A完了.md | 2026-08-02* | 33.7KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_MF-1_Commit2C完了.md | 2026-08-02* | 42.4KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_MF-2a着手前.md | 2026-08-05* | 85.5KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_MF-2完了.md | 2026-08-05* | 93.4KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_MF-2実装方針確定.md | 2026-08-04* | 82.0KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_MF-3完了.md | 2026-08-07* | 95.3KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_MF-4完了.md | 2026-08-07* | 99.5KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_MF-5a-1完了.md | 2026-08-07* | 106.4KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_MF-5a完了.md | 2026-08-08* | 108.1KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_MF-5b完了.md | 2026-08-08* | 116.7KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_MF-6a完了.md | 2026-08-08* | 123.9KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査F対応ロードマップ_全完了.md | 2026-08-08* | 136.0KB | 監査 | auth-and-security / (横断) history/changelog・status | B | 監査F最終(139KB) |
| KabeHub_監査G対応ロードマップ_MG-1完了.md | 2026-08-08* | 24.9KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査G対応ロードマップ_MG-2完了.md | 2026-08-08* | 31.5KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査G対応ロードマップ_MG-3完了.md | 2026-08-08* | 41.9KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 中間版 |
| KabeHub_監査G対応ロードマップ_全完了.md | 2026-08-08* | 54.9KB | 監査 | auth-and-security / (横断) history/changelog・status | B | 監査G最終 |
| KabeHub_監査H_I対応_実装方針_引き継ぎ資料_v1_5_2026-08-08.md | 2026-08-08 | 25.1KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 経過版 |
| KabeHub_監査H_I対応_実装方針_引き継ぎ資料_v1_6_2026-08-09.md | 2026-08-09 | 33.6KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 経過版 |
| KabeHub_監査H_I対応_実装方針_引き継ぎ資料_v1_7_2026-08-09.md | 2026-08-09 | 39.1KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 経過版 |
| KabeHub_監査H_I対応_実装方針_引き継ぎ資料_v1_8_2026-08-09.md | 2026-08-09 | 49.1KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 経過版 |
| KabeHub_監査H_I対応_実装方針_引き継ぎ資料_v1_9_2026-08-09.md | 2026-08-09 | 49.8KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 経過版 |
| KabeHub_監査H_I対応_実装方針_引き継ぎ資料_v2_0_2026-08-09.md | 2026-08-09 | 58.4KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 経過版 |
| KabeHub_監査H_I対応_実装方針_引き継ぎ資料_v2_1_2026-08-09.md | 2026-08-09 | 67.9KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 経過版 |
| KabeHub_監査H_I対応_実装方針_引き継ぎ資料_v2_2_2026-08-09.md | 2026-08-09 | 73.3KB | 監査 | auth-and-security / (横断) history/changelog・status | B | 監査H・I最終 |
| KabeHub_監査H・I対応_実装方針_引き継ぎ資料_v1.4_2026-08-08.md | 2026-08-08 | 20.1KB | 監査 | auth-and-security / (横断) history/changelog・status | C | 経過版 |
| KabeHub_監査対応A-I_MH-MS総括引き継ぎ資料_2026-08-09.md | 2026-08-09 | 607.5KB | 引き継ぎ | auth-and-security / (横断) history/changelog・status | C | 旧版（08-16更新版あり） |
| KabeHub_監査対応A-I_MH-MS総括引き継ぎ資料_2026-08-16更新版.md | 2026-08-16 | 610.5KB | 引き継ぎ | auth-and-security / (横断) history/changelog・status | B | 総括の最新版。625KBのため見出しから拾う／付録Aは古い版（B-05b未着手と誤記）。古い・書き写さない。監査IDは監査名を前置する（§6-2） |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v1.md | 2026-10-02* | 11.4KB | 引き継ぎ | auto-summary | C | 旧版 |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v10.md | 2026-10-07* | 10.8KB | 引き継ぎ | auto-summary | C | 旧版 |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v11.md | 2026-10-07* | 9.3KB | 引き継ぎ | auto-summary | C | 旧版 |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v12.md | 2026-10-07* | 15.3KB | 引き継ぎ | auto-summary | C | 旧版 |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v13.md | 2026-10-08* | 21.3KB | 引き継ぎ | auto-summary | C | 旧版 |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v14.md | 2026-10-08* | 18.7KB | 引き継ぎ | auto-summary | B | v15が参照する§5だけ読む。B1抽出時の指摘によりRui承認 |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v15.md | 2026-10-15* | 12.1KB | 引き継ぎ | auto-summary | A | 系列の最新版(v15) |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v2.md | 2026-10-02* | 13.9KB | 引き継ぎ | auto-summary | C | 旧版 |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v3.md | 2026-10-02* | 17.6KB | 引き継ぎ | auto-summary | C | 旧版 |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v4.md | 2026-10-05* | 19.4KB | 引き継ぎ | auto-summary | C | 旧版 |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v5.md | 2026-10-05* | 29.1KB | 引き継ぎ | auto-summary | C | 旧版 |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v6.md | 2026-10-06* | 10.9KB | 引き継ぎ | auto-summary | C | 旧版 |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v7.md | 2026-10-06* | 10.7KB | 引き継ぎ | auto-summary | C | 旧版 |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v8.md | 2026-10-06* | 15.0KB | 引き継ぎ | auto-summary | C | 旧版 |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v9.md | 2026-10-07* | 12.7KB | 引き継ぎ | auto-summary | C | 旧版 |
| KabeHub_認証改善メモ_20260629.md | 2026-06-29 | 5.8KB | 備忘録 | auth-and-security | A |  |
| KabeHub_運用知見アーカイブ_v178-v191.md | 2026-10-22* | 17.2KB | 備忘録 | (横断) operations | A | v178-v191の運用知見／v194の運用節と重なる。原文確認用 |
| KabeHub_静的監査_統合まとめ_2026-07-13.md | 2026-07-13 | 10.7KB | 監査 | auth-and-security | B |  |
| MCP認証エラー調査メモ.md | 2026-04-30* | 2.1KB | 備忘録 | mcp | C | 旧版（_解決済みあり） |
| Project Memory Manager（仮）設計検討 引継ぎ資料.md | 2026-09-07* | 18.6KB | 引き継ぎ | project-memory | C | 初版（無版番号。v1相当） |
| RAG機能初期壁打ち.txt | 2026-06-07* | 5.7KB | 備忘録 | lore-rag | B |  |
| RAG機能実装メモその1.txt | 2026-06-07* | 10.8KB | 備忘録 | lore-rag | B |  |
| README.md | 2026-04-06* | 5.9KB | その他 | (横断) overview | B | 旧GitHub README（Next.js 14時代）。現行READMEと差分あり（旧149行→現行210行。英語README・構成が追加）。#11の判断でB |
| README_V1.md | 2026-04-06* | 5.5KB | その他 | (横断) overview | C | 旧GitHub README（Next.js 14時代）。README.mdと内容ほぼ同一 |
| SA_oss_m1_audit_v1.md | 2026-11-17* | 19.5KB | 監査 | (対象外：別プロジェクト) | C | B1〜B10反映：KabeHubの資料ではない（別プロジェクト＝会計の資料）。KabeHubから除外。参照先SA_oss_roadmap_v2.mdも同様 |
| Supabase法人移行 トラブルシューティング記録.txt | 2026-04-09* | 2.3KB | 備忘録 | (横断) operations | A | トラブルシューティング記録（runbook候補） |
| V102差分.txt | 2026-05-30* | 4.7KB | 引き継ぎ | image-generation | B | v102変更サマリー（画像生成のチャット統合） |
| codex-instruction-folder-settings-to-project-settings.md | 2026-09-12* | 9.4KB | Codex指示書 | project-memory | B |  |
| codexBranchingMode実装メモ.txt | 2026-06-07* | 117.2KB | ログ | lore-rag | B | v133 Memory Summary UIのCodex実行ログ(120KB)。分岐ではなくlore-rag。B1抽出時の指摘によりRui承認 |
| codex_instruction_v184_project_memory_topic_rpcs.md | 2026-09-09* | 8.3KB | Codex指示書 | project-memory | B |  |
| codex_mcp_handover.md | 2026-06-04* | 5.4KB | 引き継ぎ | mcp | A |  |
| codex実装メモ.txt | 2026-06-06* | 62.3KB | ログ | branching-and-regenerate | B | Codex実行ログ形式(64KB)。先頭30行でhandleRegenerate・MessageBubble・ChatPanel関連と判定 |
| directory-structure-pruned.txt | 2026-11-25* | 11.4KB | ログ | (横断) history/changelog・status | C | ディレクトリ構成の機械出力（2026-07時点）。現行構成はgit ls-filesで取得可 |
| file-structure-full.txt | 2026-07-27* | 944.7KB | ログ | (横断) history/changelog・status | C | ディレクトリ構成の機械出力（2026-07時点）。現行構成はgit ls-filesで取得可 |
| file-structure-no-git-next-node_modules.txt | 2026-07-27* | 9.8KB | ログ | (横断) history/changelog・status | C | ディレクトリ構成の機械出力（2026-07時点）。現行構成はgit ls-filesで取得可 |
| full-audit-a-2026-07-13.md | 2026-07-13 | 36.5KB | 監査 | auth-and-security | C | 重複（docs/audit/に同一内容あり・md5一致） |
| full-audit-a-log.txt | 2026-07-13* | 83.3KB | ログ | auth-and-security | C | 巨大ログ（中身は読まない） |
| full-audit-b-2026-07-13.md | 2026-07-13 | 18.7KB | 監査 | auth-and-security | C | 重複（docs/audit/に同一内容あり・md5一致） |
| full-audit-b-2026-07-26_reaudit.md | 2026-07-26 | 14.0KB | 監査 | auth-and-security | B | 再監査。docs/audit/に同名なし |
| full-audit-b-log.txt | 2026-07-13* | 45.9KB | ログ | auth-and-security | C | 巨大ログ（中身は読まない） |
| full-audit-c-2026-07-13.md | 2026-07-13 | 27.6KB | 監査 | auth-and-security | C | 重複（docs/audit/に同一内容あり・md5一致） |
| full-audit-c-log.txt | 2026-07-13* | 52.4KB | ログ | auth-and-security | C | 巨大ログ（中身は読まない） |
| full-audit-d-2026-07-13.md | 2026-07-13 | 55.8KB | 監査 | auth-and-security | C | 重複（docs/audit/に同一内容あり・md5一致） |
| full-audit-d-log.txt | 2026-07-13* | 212.4KB | ログ | auth-and-security | C | 巨大ログ（中身は読まない） |
| full-audit-e-2026-07-13.md | 2026-07-13 | 51.0KB | 監査 | auth-and-security | C | 重複（docs/audit/に同一内容あり・md5一致） |
| full-audit-e-log.txt | 2026-07-13* | 101.0KB | ログ | auth-and-security | C | 巨大ログ（中身は読まない） |
| full-audit-f-2026-07-13.md | 2026-07-13 | 43.0KB | 監査 | auth-and-security | C | 重複（docs/audit/に同一内容あり・md5一致） |
| full-audit-f-log.txt | 2026-07-13* | 98.5KB | ログ | auth-and-security | C | 巨大ログ（中身は読まない） |
| full-audit-g-2026-07-13.md | 2026-07-13 | 25.6KB | 監査 | auth-and-security | C | 重複（docs/audit/に同一内容あり・md5一致） |
| full-audit-g-log.txt | 2026-07-13* | 70.6KB | ログ | auth-and-security | C | 巨大ログ（中身は読まない） |
| full-audit-h-2026-07-13.md | 2026-07-13 | 61.7KB | 監査 | auth-and-security | C | 重複（docs/audit/に同一内容あり・md5一致） |
| full-audit-h-log.txt | 2026-07-13* | 125.2KB | ログ | auth-and-security | C | 巨大ログ（中身は読まない） |
| full-audit-i-2026-07-13.md | 2026-07-13 | 19.4KB | 監査 | auth-and-security | C | 重複（docs/audit/に同一内容あり・md5一致） |
| full-audit-i-log.txt | 2026-07-13* | 41.5KB | ログ | auth-and-security | C | 巨大ログ（中身は読まない） |
| github_integration_instructions.md | 2026-06-06* | 10.0KB | Codex指示書 | github-integration | B |  |
| github_phase3_plan.md | 2026-06-06* | 13.7KB | 方針ドラフト | github-integration | A | 現行と差あり（A維持） |
| icon-maskable-192.png | 2026-08-17* | 6.7KB | その他 | mobile | C | PWAアイコン画像（192x192 PNG）。ドキュメントではない |
| mobile-env-setup.md | 2026-08-28* | 6.6KB | 備忘録 | mobile | C | 重複（docs/mobile-env-setup.mdと同一・md5一致） |
| v124完了時.txt | 2026-11-25* | 4.5KB | その他 | (横断) history/changelog・status | B | 欠落した引き継ぎ資料の代替（完了時の最終回答の抜粋）。本体は存在しない |
| v125完了時.txt | 2026-11-25* | 6.0KB | その他 | (横断) history/changelog・status | B | 欠落した引き継ぎ資料の代替（完了時の最終回答の抜粋）。本体は存在しない |
| v135完了時.txt | 2026-11-25* | 9.0KB | その他 | (横断) history/changelog・status | B | 欠落した引き継ぎ資料の代替（完了時の最終回答の抜粋）。本体は存在しない |
| v167と168完了時.txt | 2026-11-25* | 1.6KB | その他 | (横断) history/changelog・status | B | 欠落した引き継ぎ資料の代替（完了時の最終回答の抜粋）。本体は存在しない |
| v172完了時.txt | 2026-11-25* | 883B | その他 | (横断) history/changelog・status | B | 欠落した引き継ぎ資料の代替（完了時の最終回答の抜粋）。本体は存在しない |
| v189完了時.txt | 2026-11-25* | 2.5KB | その他 | (横断) history/changelog・status | B | 欠落した引き継ぎ資料の代替（完了時の最終回答の抜粋）。本体は存在しない |
| v79更新内容.txt | 2026-04-30* | 70.5KB | 引き継ぎ | mcp | B | v78作業まとめ（MCPサーバー実装。72KB） |
| v92 実装仕様書：会話数カウント＋統計機能.txt | 2026-05-16* | 11.9KB | 方針ドラフト | models-and-pricing | B | 会話数カウント＋統計機能の仕様書／B1〜B10反映：A→B |
| ⑥実施.txt | 2026-05-23* | 1.2KB | 備忘録 | novel-and-roleplay | B | 小説執筆モード⑥の実装メモ（約1KB） |
| ★ご神託_00_コンテキスト共有用.txt | 2026-07-03* | 46.7KB | その他 | (横断) overview | B | コンテキスト共有用（判断だけ拾う） |
| ★ご神託_01_セキュリティ強化.txt | 2026-07-03* | 157.7KB | その他 | auth-and-security | B | 巨大(約160KB)。判断だけ拾う／実装チケット集。監査A〜Iに属さない独立資料 |
| ★ご神託_02_リファクタリング（技術的負債の解消）.txt | 2026-07-03* | 242.5KB | その他 | (横断) overview | B | 巨大(約250KB)。判断だけ拾う |
| コードレビュー.txt | 2026-06-03* | 36.3KB | 監査 | auth-and-security | B | 外部AIによる構造レビュー（英語） |
| コードレビューその2.txt | 2026-06-03* | 18.3KB | 監査 | auth-and-security | B | 外部AIによる構造レビュー（英語） |
| 修_KabeHub_モデル追加チケット_GPT5.6_Gemini3.6.md | 2026-07-23* | 12.7KB | Codex指示書 | models-and-pricing | C | 旧版（確定版が正本。ただし要照合） |
| 再修_KabeHub_モデル追加チケット_GPT5.6_Gemini3.6.md | 2026-07-23* | 16.5KB | Codex指示書 | models-and-pricing | C | B1〜B10反映：旧版（確定版が正本）。確定版に無い記述あり→§6-1 |
| 壁打ちエディタ_設計資料.md | 2026-03-28* | 6.5KB | 方針ドラフト | (横断) overview | C | 旧版（v2あり） |
| 壁打ちエディタ_設計資料_v2.md | 2026-03-28* | 8.9KB | 方針ドラフト | (横断) overview | A | 初期プロダクト設計の最新版 |
| 壁打ち引き継ぎ資料_20260328.md | 2026-03-28 | 5.7KB | 引き継ぎ | (横断) overview | B | 最初期の引き継ぎ |
| 実装方針資料.txt | 2026-08-04* | 6.2KB | 備忘録 | auth-and-security | B | 監査F（MF-1 Commit 5・MF-2分割）の実装方針。restore-branchは1行のみ。B1抽出時の指摘によりRui承認 |
| 引き継ぎ資料_MF-2a着手前_2026-08-05.md | 2026-08-05 | 6.9KB | 引き継ぎ | auth-and-security | C | B1〜B10反映：C相当（B6／B7の最終版でカバー済み） |
| 引き継ぎ資料_MF-2実装方針確定_2026-08-04.md | 2026-08-04 | 5.4KB | 引き継ぎ | auth-and-security | C | B1〜B10反映：C相当（B6／B7の最終版でカバー済み） |
| 引継ぎUIその1.txt | 2026-06-12* | 6.2KB | 備忘録 | branching-and-regenerate | B | LibreChat分岐ロジックの調査メモ |
| 振り返り_Hook実装_20260516.md | 2026-05-16 | 5.5KB | 備忘録 | mcp | B | ClaudeCode→KabeHub自動保存Hookの振り返り |
| 未実装機能.txt | 2026-11-17* | 639B | 備忘録 | (横断) roadmap/backlog | B | 未実装アイデアのメモ（箇条書き639B） |
| 画像入力対応メモ.md | 2026-06-01* | 3.2KB | 備忘録 | image-generation | B | img2img調査メモ。imageRefIdは実装済みでメモの「未実装」は古い。B1抽出時の指摘によりRui承認 |
| 記憶まわり追加.txt | 2026-06-09* | 20.5KB | 備忘録 | lore-rag | B | RAG・記憶まわりの改善検討（liked_ai等） |
| 設計指示書.txt | 2026-03-28* | 3.3KB | 方針ドラフト | (横断) overview | B | 初期MVPの設計指示（2026-03） |
| 連携トラブルシューティング.txt | 2026-06-02* | 2.6KB | 備忘録 | mcp / (横断) operations | A |  |
| 過去Fable回答その1.txt | 2026-06-10* | 10.5KB | 監査 | chat-core / auth-and-security | B | Fableによるコードレビュー回答 |
| 過去Fable回答その2.txt | 2026-06-10* | 11.5KB | 監査 | chat-core / auth-and-security | B | Fableによるコードレビュー回答 |
| 🔁 KabeHub Googleログイン永久ループ 対処備忘録.txt | 2026-04-08* | 1.2KB | 備忘録 | (横断) operations / auth-and-security | A | runbook候補 |

## 3. リポジトリ `docs/`（`applied/` を除く）・`CLAUDE.md`・`apps/mobile-shell-poc/`（30 行）

| ファイル名 | 期間 | サイズ | 種類 | 対象機能 | 扱い | 備考 |
|-|-|-|-|-|-|-|
| CLAUDE.md | 2026-11-17* | 135.4KB | その他 | (横断) history/changelog・status / (横断) overview | A | 現行の正本（約139KB）。最後にスリム化する対象 |
| docs/KabeHub_folder_name統一_Phase3_実装報告_v1.md | 2026-09-15* | 5.9KB | 実装報告 | project-memory | B | archive移動候補 |
| docs/KabeHub_folder_name統一_Phase5C_実装ログ.md | 2026-09-16* | 3.0KB | 実装報告 | project-memory | B | archive移動候補 |
| docs/_reorg/KabeHub_ドキュメント再編_方針_v2.md | 2026-11-25* | 30.1KB | その他 | (横断) overview | A | 本再編の方針書（全文読了） |
| docs/ai-usage-cost-handover.md | 2026-08-19* | 3.8KB | 引き継ぎ | models-and-pricing | B | AI利用コスト計測の引き継ぎ |
| docs/api-key-flow-inventory.md | 2026-11-01* | 16.5KB | その他 | auth-and-security | A | BYOK経路の棚卸し正本。security/へ移動予定 |
| docs/archive/codex-instruction-proxy-paths-memory-topics.md | 2026-09-09* | 4.9KB | Codex指示書 | project-memory | C | 既にarchive済み |
| docs/archive/supabase-schema.OBSOLETE.sql | 2026-08-19* | 1.4KB | その他 | (横断) operations | C | OBSOLETE |
| docs/audit/full-audit-a-2026-07-13.md | 2026-07-13 | 36.5KB | 監査 | auth-and-security | C | 現状維持。旧フォルダ側と重複（md5一致） |
| docs/audit/full-audit-b-2026-07-13.md | 2026-07-13 | 18.7KB | 監査 | auth-and-security | C | 現状維持。旧フォルダ側と重複（md5一致） |
| docs/audit/full-audit-c-2026-07-13.md | 2026-07-13 | 27.6KB | 監査 | auth-and-security | C | 現状維持。旧フォルダ側と重複（md5一致） |
| docs/audit/full-audit-d-2026-07-13.md | 2026-07-13 | 55.8KB | 監査 | auth-and-security | C | 現状維持。旧フォルダ側と重複（md5一致） |
| docs/audit/full-audit-e-2026-07-13.md | 2026-07-13 | 51.0KB | 監査 | auth-and-security | C | 現状維持。旧フォルダ側と重複（md5一致） |
| docs/audit/full-audit-f-2026-07-13.md | 2026-07-13 | 43.0KB | 監査 | auth-and-security | C | 現状維持。旧フォルダ側と重複（md5一致） |
| docs/audit/full-audit-g-2026-07-13.md | 2026-07-13 | 25.6KB | 監査 | auth-and-security | C | 現状維持。旧フォルダ側と重複（md5一致） |
| docs/audit/full-audit-h-2026-07-13.md | 2026-07-13 | 61.7KB | 監査 | auth-and-security | C | 現状維持。旧フォルダ側と重複（md5一致） |
| docs/audit/full-audit-i-2026-07-13.md | 2026-07-13 | 19.4KB | 監査 | auth-and-security | C | 現状維持。旧フォルダ側と重複（md5一致） |
| docs/audit/mh-5b-db-verification-2026-08-09.md | 2026-08-09 | 2.2KB | 監査 | auth-and-security | B | CLAUDE.mdに記載あり |
| docs/audit/mh-6-npm-audit-2026-08-09.md | 2026-08-09 | 7.5KB | 監査 | auth-and-security | B | CLAUDE.mdに記載あり |
| docs/audit/ms-1-npm-vuln-remediation-2026-08-09.md | 2026-08-09 | 44.5KB | 監査 | auth-and-security | B |  |
| docs/lore-refactoring-notes.md | 2026-10-05* | 3.4KB | 備忘録 | lore-rag | A | Lore検索経路の記録 |
| docs/mobile-env-setup.md | 2026-08-28* | 6.6KB | 備忘録 | mobile | A | 旧フォルダ側に同一ファイルあり |
| docs/schema.sql | 2026-10-23* | 134.0KB | その他 | auth-and-security | C | SQL正本（現状維持。読まない） |
| docs/storage.sql | 2026-07-23* | 3.9KB | その他 | image-generation | C | SQL正本（現状維持。読まない） |
| docs/task12-handoff.md | 2026-09-05* | 3.7KB | 引き継ぎ | mobile | B | docs/archive/ 移動候補（一時レポート） |
| docs/task13a-handoff.md | 2026-09-05* | 2.9KB | 引き継ぎ | mobile | B | docs/archive/ 移動候補（一時レポート） |
| docs/thread-trash-phase2a-report.md | 2026-10-23* | 20.5KB | 実装報告 | trash | B | 未追跡。archive移動予定（方針書§8-5） |
| docs/thread-trash-phase2b-report.md | 2026-10-23* | 24.0KB | 実装報告 | trash | B | 未追跡。archive移動予定（方針書§8-5） |
| docs/thread-trash-phase3b2-report.md | 2026-10-28* | 11.8KB | 実装報告 | trash | B | 追跡済みの一時レポート。archive移動候補 |
| apps/mobile-shell-poc/（追跡59ファイル） | 2026-08-19 | — | その他 | mobile | C | 追跡されているが説明のない資産（Capacitor M0-AのPoC。READMEは「使い捨てPoC」と明記。`apps/mobile/` とは別）。B1〜B10反映：新規追加。区分Cは暫定 |

## 4. リポジトリ `docs/applied/`（52 行）

migration SQL は方針書§3のとおり現状維持（読まない）。README（台帳）のみA。

| ファイル名 | 期間 | サイズ | 種類 | 対象機能 | 扱い | 備考 |
|-|-|-|-|-|-|-|
| docs/applied/README.md | 2026-10-23* | 9.1KB | その他 | (横断) history/changelog・status | A | migration台帳（v番号とmigrationの対応） |
| docs/applied/migration_rls_cleanup_p0.sql | 2026-07-13* | 21.1KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v119_github_oauth.sql | 2026-07-13* | 1.1KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v120_github_phase4.sql | 2026-07-13* | 807B | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v121_expose_share_token.sql | 2026-07-13* | 587B | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v122_create_likes.sql | 2026-07-13* | 2.3KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v123_rpc_hardening.sql | 2026-07-13* | 4.5KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v125_reports_thread_fk_set_null.sql | 2026-07-13* | 728B | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v125b_submit_report_function.sql | 2026-07-13* | 2.0KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v125c_submit_report_permission_fix.sql | 2026-07-13* | 696B | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v126_find_similar_lore_pairs_liked_ai_protection.sql | 2026-07-13* | 2.8KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v127_public_threads_view_security_invoker.sql | 2026-07-13* | 579B | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v128_public_threads_projection.sql | 2026-07-23* | 7.0KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v129_dreaming_batch_multi_hardening.sql | 2026-07-23* | 6.5KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v130_delete_current_user_hardening.sql | 2026-07-23* | 795B | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v131_storage_orphan_cleanup.sql | 2026-07-23* | 4.4KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v176_dreaming_rpc_and_trigger_cleanup.sql | 2026-07-29* | 1.1KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v177_merge_user_edited_lore_pair.sql | 2026-08-12* | 5.3KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v178_restore_message_branch.sql | 2026-08-12* | 3.5KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v179_apply_branch_edit.sql | 2026-08-12* | 4.1KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v180_drop_legacy_counter_rpcs.sql | 2026-08-12* | 980B | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v181_ai_usage_events.sql | 2026-08-19* | 2.9KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v182_project_memory_phase_a.sql | 2026-09-09* | 19.3KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v183_project_memory_phase_b_backfill.sql | 2026-09-09* | 7.4KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v184_project_memory_topic_rpcs.sql | 2026-09-09* | 14.7KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v185_get_or_create_project.sql | 2026-09-11* | 13.6KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v186_project_memory_phase_d_read_path.sql | 2026-09-11* | 4.1KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v187_project_memory_phase_e_drop_legacy_rpc.sql | 2026-09-11* | 1.1KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v188_project_memory_phase_e_find_similar_lore_pairs_by_project.sql | 2026-09-11* | 6.7KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v189_project_memory_phase_e_merge_project_guard.sql | 2026-09-11* | 5.4KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v190_project_memory_phase_e_drop_legacy_find_similar.sql | 2026-09-11* | 839B | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v191_project_memory_phase_e_update_temporal_status_by_project.sql | 2026-09-11* | 2.7KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v192_project_memory_phase_e_drop_legacy_temporal_status.sql | 2026-09-11* | 541B | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v193_folder_settings_to_project_settings.sql | 2026-09-15* | 1.3KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v194_delete_project_preserving_contents.sql | 2026-09-15* | 15.1KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v195_rename_project.sql | 2026-09-15* | 1.9KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v196_project_settings_project_id_contract.sql | 2026-10-02* | 787B | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v197_project_memory_dreaming_by_project.sql | 2026-09-16* | 15.2KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v198_project_memory_dreaming_final.sql | 2026-09-16* | 20.4KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v199_lore_embeddings_folder_name_drop.sql | 2026-09-16* | 1.5KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v200_project_memory_topic_promotion.sql | 2026-09-28* | 8.0KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v201_delete_project_promotion_delegation.sql | 2026-09-28* | 6.6KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v202_project_memory_promotion_confirmation.sql | 2026-10-02* | 5.0KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v203_project_memory_promotion_restore.sql | 2026-10-02* | 5.4KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v204_project_memory_chat_inclusion.sql | 2026-10-03* | 5.1KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v205_delete_project_memory_topics.sql | 2026-10-06* | 5.1KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v206_project_memory_auto_summary_cursors.sql | 2026-10-07* | 8.5KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/migration_v207_thread_trash.sql | 2026-10-23* | 20.5KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/v141c_migration.sql | 2026-07-13* | 1.6KB | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/v175_migration.sql | 2026-07-13* | 102B | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/v78_mcp_tokens_migration.sql | 2026-07-13* | 612B | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |
| docs/applied/v89_migration.sql | 2026-07-13* | 104B | その他 | (横断) history/changelog・status | C | 適用済みmigration SQL（現状維持・読まない） |

## 5. 本体が存在しない資料（方針書§1-2の5）

| 資料 | 状態 | 代替・補い方 | 備考 |
|-|-|-|-|
| 引き継ぎ資料 v124・v125・v135・v167・v168・v172・v189 の本文 | 存在しない | `v124完了時.txt` ほか6本（最終回答の抜粋）と、前後の版・変更履歴アーカイブで補う | 旧フォルダ6本はいずれもB。v167／168は1ファイル `v167と168完了時` にまとめ |
| Project Memory Manager 設計検討 v3 | 存在しない | v2・v4で補う | 旧フォルダは v2,v4〜v26 |
| CSP Enforce切替・運用ロードマップ | 作られたことがない（CLAUDE.mdが参照） | `roadmap/backlog.md` へコードと統合バックログ v3 から再構成（§8-4） | |
| PWA・Capacitorロードマップ | 同上 | 同上（Capacitor化 実装方針v26・引き継ぎ資料v23が近い） | |
| pg_bigm検索ロードマップ | 同上 | 同上（`KabeHub_検索改善_pg_trgm_仕様書` が近い） | |
| MCP拡張ロードマップ | 同上 | 同上 | |
| GitHub revokeロードマップ | 同上 | 同上 | |
| 引き継ぎ資料 v7・v10・v11・v12・v14 | 存在しない（欠番） | 前後の版と変更履歴アーカイブで補う。v1〜v175はCのため影響小 | 方針書に未記載の欠番。機械検出（§5-1） |
| `SA_oss_roadmap_v2.md` | 存在しない（`SA_oss_m1_audit_v1.md` が参照） | 補わない（別プロジェクト＝会計の資料のため、KabeHubの再編から除外。B1〜B10反映） | 新規発見。方針書に未記載 |
| 監査 Disposition 表のファイル | 存在しない | 監査A〜Iの最終版と総括の本文で補う | B1〜B10反映。Disposition は表としてのみ言及され、独立ファイルは無い |
| なりきりモードの設計資料 | 存在しない | コードとCLAUDE.mdで補う（`roleplay_mode` 関連の記述のみ） | B1〜B10反映 |

### 5-1. 機械検出した欠番（方針書が既知のものを除く）

- 引き継ぎ資料（`KabeHub_引き継ぎ資料_…_vN`・`_vN`）の欠番 v1〜v194 のうち、存在しない番号: v7、v10、v11、v12、v14、v124、v125、v135、v167、v168、v172、v189。
  - 方針書記載の7本（v124・v125・v135・v167・v168・v172・v189）以外の欠番（v7、v10、v11、v12、v14）は、初期（2026-03〜04）に作られなかった・Projectにも無かったものと推定。v1〜v175は一律Cのため再編への影響は小さい。
- PMM設計検討: 欠番 v1、v3
- Capacitor実装方針: 欠番 なし
- Capacitor引き継ぎ資料: 欠番 なし
- 自動要約: 欠番 なし
- Lore昇格ルール: 欠番 なし
- リッチ会話UI: 欠番 なし
- チャット参照元整理: 欠番 v1
- 内部モデル刷新: 欠番 なし
- PMM post-MVPバックログ: 欠番 なし
- 分岐UI（レール＋ツリー）: 欠番 なし

## 6. 要確認（判断に迷った分類）と判断結果

2026-11-25: Ruiの判断（#2・5・8・9・10・12・15〜19）と、実ファイル確認による判断（#1・3・4・7・11・13・14）を反映済み。#6 は今回の指示に含まれず現状維持。

| # | 対象 | 論点 | 判断 | 理由・確認結果 |
|-|-|-|-|-|
| 1 | B-05a_CSP強制化nonce導入_方針ドラフト (1).md | (1)付きとの差分 | (1)付き＝B／無印＝C | 実ファイル確認：21.8KB対9.8KBで内容が異なる。(1)付きは「①Claude案 v2・ChatGPTレビュー反映・検証済み」、無印は「①Claude案 v1」（無印の非空行148行中50行が(1)付きに無い）。更新日時も(1)付きが新しい（07-24 23:06対22:44）。規則「違うなら新しいほうだけB」 |
| 2 | KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v* | 方針書はv12、実際の最新はv26 | v26＝A／v2・v4〜v25＝C | Rui確定。方針書§4-1を訂正（欠番はv1・v3。旧フォルダにあるのはv2・v4〜v26と無版番号の初版） |
| 3 | KabeHub_RAG改善設計メモ_v142以降.md | 無番号版が_01〜_04と同内容か | B（変更なし） | 実ファイル確認：無番号版の非空行191行中、_01に無い行40・_02に無い行63・_03に無い行67・_04に無い行67。どれとも同一でない。規則「違えばB」 |
| 4 | KabeHub_スマホレスポンシブ対応_引き継ぎ_20260624 (1).md | (1)付きとv166版のどちらが現行か | (1)付き＝C／v166版＝A維持 | 実ファイル確認：v166版のほうが更新日時が新しく（16:22対14:09）、サイズも大きい（21.3KB対18.8KB）。規則は「新しいほうをB」だが、v166版はCLAUDE.mdが詳細の参照先に指定しているためAを維持（格下げしていない）。(1)付きのみC |
| 5 | KabeHub_モデル追加チケット_GPT5.6_Gemini3.6.md ほか3本 | 4本のうち正本はどれか | 再修_＝B／無印・確定版・修_＝C（B1〜B10反映で変更：確定版＝B／再修_・無印・修_＝C。§6-2） | Rui確定。ただし4本は実質的に異なる→§6-1「矛盾・要照合」へ |
| 6 | KabeHub_公開準備タスクリスト_v2.md | 公開準備v6をBとする | 変更なし（v6＝B、v2〜v5＝C） | 今回の指示に含まれないため現状維持（#10・16・17と同様） |
| 7 | KabeHub_引き継ぎ資料_2026-08-10.md ほか3本（08-12・08-13・08-13_v2） | 旧版Cとしてよいか | B（4本とも） | 実ファイル確認：総括08-16更新版（625KB）に各ファイルの非空行（12字以上）が含まれる数は、08-10が4/79、08-12が3/74、08-13が5/88、08-13_v2が5/103。総括は8/10・8/12・8/13の内容をほぼ含まない。規則「含まなければB」 |
| 8 | KabeHub_引き継ぎ資料_slim_20260629.md | v176で置き換わったか | C | Rui確定 |
| 9 | KabeHub_引き継ぎ資料_新v178.md | v178の正本 | 新v178＝B／v178・旧v178＝C | Rui確定。新v178=08-14更新が正本。旧v178・v178は07-28版で内容同一 |
| 10 | KabeHub_監査B対応ロードマップ_MB-e完了.md | B〜G各系列の最終版を一律Bとしてよいか | 現状のまま（B） | Rui確定 |
| 11 | README.md | 現行READMEとの差分 | B | 実ファイル確認：旧README.md（149行・Next.js 14時代）と現行README.md（210行）で差分195行（現行は英語README・機能説明等が追加）。規則「差分があればB」。README_V1.mdはCのまま |
| 12 | codexBranchingMode実装メモ.txt | 拾い読みで足りるか | B | Rui確定 |
| 13 | codex実装メモ.txt | 機能の対象 | B（branching-and-regenerate） | 実ファイル確認：先頭30行がhandleRegenerate・MessageBubble・ChatPanelの再生成処理の読み込みとrg検索。再生成機能のCodex実行ログと判定できる。規則「判定できればB」 |
| 14 | 引き継ぎ資料_MF-2a着手前_2026-08-05.md ほか1本（MF-2実装方針確定） | 監査F対応ロードマップ同名版と同一か | B（2本とも） | 実ファイル確認：同一ではない。引き継ぎ版は5.5〜7.1KBのセッション完了報告（MF-1 Commit 5a/5b・MF-2d完了ほか）、ロードマップ版は84〜88KB。引き継ぎ版の非空行がロードマップ版に含まれる数は1/40・1/39。規則「違えばB」 |
| 15 | KabeHub_引き継ぎ資料 v177〜v193 | 一律Bでよいか／Cか | B。ただしv191・v193・v194＝A（B1〜B10反映でv191・v193はB、v194のみA。§6-2） | Rui確定 |
| 16 | KabeHub_引き継ぎ資料 同番号の重複 v30・v63 | 内容の違い | 現状のまま（C） | Rui確定 |
| 17 | Capacitor化 系列のA/B | 線引き | 現状のまま | Rui確定 |
| 18 | 監査Aロードマップの本数 | 方針書は中間版15本・16版と記載 | A系列19本（最終版を除く中間版18本）。方針書を訂正 | 方針書§1-1の16版→19本、§6 C欄の15本→18本に訂正した |
| 19 | full-audit-*.md 9本（旧フォルダ側） | docs/audit/との重複 | C（docs/audit/は現状維持） | Rui確定 |

### 6-2. B1抽出時の指摘によるRui承認（2026-11-25）

| 対象 | 変更 | 理由 |
|-|-|-|
| codexBranchingMode実装メモ.txt | 対象機能 branching-and-regenerate → lore-rag、扱いB | B1抽出時の指摘によりRui承認 |
| 実装方針資料.txt | 対象機能 branching-and-regenerate → auth-and-security、扱いB | B1抽出時の指摘によりRui承認 |
| 画像入力対応メモ.md | 対象機能 chat-core → image-generation、扱い A → B（imageRefIdは実装済みでメモの「未実装」は古い） | B1抽出時の指摘によりRui承認 |
| チャット参照元整理_Pinnedキャッシュ化_引き継ぎ資料_v1.md | C → B（別トラックのv1で旧版ではない） | B1抽出時の指摘によりRui承認 |
| 分岐履歴レールUI v7 | C → B（無印〜v6はC） | B1抽出時の指摘によりRui承認 |
| 自動要約_現状整理_引き継ぎ資料_v14 | C → B（v15が参照する§5だけ読む） | B1抽出時の指摘によりRui承認 |

### 6-2（続）. B1〜B10反映分（2026-11-26。①のB1〜B10抽出で出た分類変更）

区分は変更前→変更後。担当テーマだけの変更は「担当」と記す。

| 対象 | 変更前→変更後 | 理由・注記 |
|-|-|-|
| モデル追加チケット_確定版 | C→B | 正本を確定版へ（再修_より新しい）。§6-1の要照合は維持 |
| 再修_モデル追加チケット | B→C | 同上。無印・修_はC据え置き（備考のみ更新） |
| v92 実装仕様書：会話数カウント＋統計機能 | A→B |  |
| モデル運用棚卸し | A→B |  |
| Lv2 Codex指示書4本（B2・Phase3b実装・Phase3b読み取り調査・カード本文リスト対応） | B→C | 実装済みの指示書。C相当 |
| RAG改善設計メモ _01〜_03 | A→C | _04が最新（A維持）。無番号版はB維持 |
| PhaseE Codex指示書v1／実装方針ドラフトv5 | B（変更なし） | **要判断**：Cを検討。判断が割れたためBのまま、備考に記載 |
| 過去Fable回答 その1・その2 | 担当 auth-and-security / chat-ui → chat-core / auth-and-security | 区分B維持 |
| APIメモその2 | B→C | export の専用資料はなくなる（§8） |
| 検索改善_pg_trgm_仕様書 | A→B |  |
| ハイライト Codex読み取り調査指示書v1 | B→C |  |
| スマホレスポンシブ対応 v166版 | A維持（備考のみ） | chat-uiとmobileの両方を担当。Capacitor部は約60行 |
| 連携トラブルシューティング | 担当 github-integration / operations → mcp / operations | 区分A維持 |
| ジャンル分類機能_設計メモ | 担当 novel-and-roleplay → sharing-and-explore | 区分A維持 |
| GitHub連携メモ | A→B |  |
| github_phase3_plan | A維持（備考のみ） | 現行と差あり |
| なりきりモードの設計資料 | （行なし） | 存在しない。§5・§8に記載 |
| 監査C対応ロードマップ（4本）・監査D対応ロードマップ（10本） | 担当 auth-and-security / history → (横断) operations / (横断) history | 区分は不変。デッドコード(C)・重複共通化(D)は横断の性格 |
| 監査Eロードマップ（9本） | 担当 auth-and-security / history → models-and-pricing / auth-and-security | 区分は不変。models-and-pricing寄り |
| 監査ID | （注意書き） | IDが監査間で衝突するため、書き写すときは監査名を前置する（例：監査A B-05、監査F MF-2） |
| 監査総括 2026-08-16更新版 | B維持（備考のみ） | 付録Aは古い版（B-05b未着手と誤記）。古い・書き写さない |
| 監査 Disposition 表のファイル | （行なし） | 存在しない。§5に記載 |
| SA_oss_m1_audit_v1.md | A→C、担当 auth-and-security → 対象外（別プロジェクト） | 別プロジェクト（会計）の資料。KabeHubから除外。SA_oss_roadmap_v2.mdも同様（§5） |
| 公開準備タスクリスト v6 | 担当 auth-and-security / roadmap → (横断) overview / operations | 区分B維持 |
| ★ご神託_01_セキュリティ強化 | B維持（備考のみ） | 実装チケット集。監査A〜Iに属さない独立資料 |
| MD-2引き継ぎ・MF-3完了・MF-5a v3最終・MG v3・MF-2a着手前（引き継ぎ版）・MF-2実装方針確定（引き継ぎ版） | B→C（6本） | B6／B7の最終版でカバー済み |
| タスク10 系3本 | B維持（備考のみ） | 代替済み（github-integration.md と引継v23 §2） |
| Capacitor タスク14 実装方針引継ぎ v8 | A→B | タスク13 v5（B維持）と内容が重なる。方針v26・引継v23はAのまま |
| docs/task12-handoff.md・task13a-handoff.md | B維持（備考のみ） | docs/archive/ 移動候補 |
| 変更履歴アーカイブ v182-v190 | B→A |  |
| 引き継ぎ資料 v191・v193 | A→B | v194のみA |
| 運用知見アーカイブ v178-v191 | A維持（備考のみ） | v194の運用節と重なる。原文確認用 |
| apps/mobile-shell-poc/ | （新規行。§3） | 追跡されているが説明のない資産。区分Cは暫定 |

件数: 旧フォルダ A/B/C 52/132/448 → 42/126/464（合計632で不変）。リポジトリ側（§3・§4）は 81 行 → 82 行（apps/mobile-shell-poc 追加。§3は29→30行）。§1の機能別表は再計算済み。

### 6-1. 矛盾・要照合

- **モデル追加チケット4本**（B1〜B10反映で正本を確定版に変更。以下は当初の記述で、要照合は維持）: 再修_をBとしたが、4本の内容は実質的に異なる。更新日時の順は 無印 → 修_ → 再修_ → 確定版 で、**確定版（11.2KB）のほうが再修_（10.4KB）より新しい**。確定版と再修_は `app/api/chat/route.ts` に `store: false` を追加する点で一致するが、確定版にあって再修_に無い記述（ChatGPTレビュー反映3点・C-02言及箇所が4→6箇所である旨・Gemini側`thinkingConfig`の注記）と、再修_にあって確定版に無い記述（`scripts/loadModel.test.cjs` の節・「S25 T2の教訓」）がある。無印・修_は `route.ts` を「変更不要」としており、再修_と矛盾する。②で出典に使う前に、実装済みコード（`lib/modelRegistry.ts`・`app/api/arena/route.ts`・`app/api/chat/route.ts`）と照合すること。
- **スマホレスポンシブ v166版**: 「更新日時が新しいほうをB」の規則どおりならBだが、CLAUDE.mdが詳細の参照先に指定しているためAを維持した（#4）。

## 7. 旧フォルダ内の重複（md5一致）

| 組 | ファイル | 判断 |
|-|-|-|
| 1 | KabeHub_公開準備タスクリスト_v3.md ＝ KabeHub_公開準備タスクリスト_v3.txt | 内容同一 |
| 2 | KabeHub_引き継ぎ資料_v178.md ＝ KabeHub_引き継ぎ資料_旧v178.md | 内容同一 |
| 3 | KabeHub_監査A対応ロードマップ.md ＝ KabeHub_監査A対応ロードマップ（T2終了）.md | 内容同一 |

旧フォルダ ↔ リポジトリ `docs/` の同一ファイル（md5一致）: `full-audit-a〜i-2026-07-13.md` 9本、`mobile-env-setup.md` 1本（計10本）。

## 8. 機能ドキュメントの資料が少ない機能

- `threads`（スレッド・タグ・メモ・下書き・カレンダー）: 専用の資料は無し。出典は引き継ぎ資料各版（v1〜v175はC）と CLAUDE.md の API 表。②ではコードと CLAUDE.md を主な根拠にする。
- `arena`: 専用資料は無し。`内部モデル刷新_引き継ぎ資料_v6`（Arena選択式化）と CLAUDE.md のみ。
- `export`: 専用資料は無し。`APIメモその2`（リッチDLの相談。B1〜B10反映でC）と CLAUDE.md・カード下流対応B1のみ。
- `novel-and-roleplay`（なりきりモード）: 設計資料は存在しない。ジャンル分類機能_設計メモは sharing-and-explore へ移した（B1〜B10反映）。
- `highlight`: 旧フォルダに v1〜v3（v3が最新）。方針書の「v2」は訂正済み（v3）。

## 9. 公開リポジトリに載せてよくない情報の確認（grep結果）

対象: `docs/`・`CLAUDE.md`・`scripts/`（作業ツリー）。対象外: テストDBのref・`admin@kabehub.com`（方針書§5-12）。検索パターンと結果は下記。ヒットした値そのものは本表に転記していない。

| 確認した種類 | パターン（要約） | 結果 |
|-|-|-|
| Anthropic／OpenAI／Gemini／GitHub／AWS／Slack／Stripeのキー形式 | `sk-ant-` `sk-proj-` `sk-…32桁以上` `AIza…` `ghp_/gho_/github_pat_` `AKIA…` `xox…` `sk_live_` `whsec_` | **0件** |
| JWT（Supabase anon／service role key等） | `eyJ….….…` 3分割形式 | **0件** |
| 秘密鍵ブロック | `-----BEGIN … PRIVATE KEY` | `scripts/auto-summary-redact.test.cjs` の3行のみ（マスク処理のテスト入力。鍵本体なし）→問題なし |
| DB接続文字列・パスワード・service role・Cron secret等の代入 | `postgres://user:pass@` `SERVICE_ROLE_KEY=…` `*_SECRET=…` `*_TOKEN=…` `PASSWORD=…`（16文字以上の値） | 15件。すべて `scripts/*.test.cjs` 内のダミー値（`"service-role-key"` `"test-cron-secret"` `"github-access-token"` 等）、または `verify-project-memory-mvp.mjs` の環境変数参照（`TEST_USER_PASSWORD`）。→問題なし |
| Bearer／MCPトークン形式の実値 | `Bearer …20桁以上` `kh_…` | `scripts/proxy.test.cjs` の `Bearer cron-only-test-token`（テスト用ダミー）のみ→問題なし |
| 40桁以上のhex（キー・ハッシュ混入の確認） | `[A-Fa-f0-9]{40,}` | `docs/api-key-flow-inventory.md` 3行目＝コミットハッシュ、`docs/audit/full-audit-d/f/g/i-*.md`＝64桁のSHA-256（MCPトークンhashのテストベクトルとみられる）。→鍵ではない（値の素性は未確認だが、鍵形式ではない） |
| 追跡されている環境ファイル | `git ls-files` で `.env*`・`*.pem`・`*.key` 等 | `.env.local.example` のみ。値は空かプレースホルダのみ（`https://your-project.supabase.co`・`your-anon-key`）→問題なし |
| Supabase URL（参考） | `*.supabase.co` | `docs/mobile-env-setup.md` に `<project-ref>.supabase.co`（`NEXT_PUBLIC_SUPABASE_URL`＝ブラウザに公開される値）。anon keyは「（本番anon key）」という文字列で値なし。**どのプロジェクトのrefか**（本番かテストか）はRuiの確認事項 |

未確認（範囲外）: git履歴（過去のコミットに削除済みの秘密が残っていないか）、`docs/audit/full-audit-*-log.txt` 等の旧フォルダ側（リポジトリには入らないため対象外）、`apps/` ・`app/` 等のコード側。

