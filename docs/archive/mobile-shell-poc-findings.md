# apps/mobile-shell-poc の知見（アーカイブ）

作成: 2026-11-26／元ディレクトリ `apps/mobile-shell-poc`（追跡59ファイル）を削除する前に、残す価値のある知見だけを要約したもの。
元のコードは git 履歴（コミット `b488a5d`、2026-08-19、`feat(mobile): M0-A Android native shell smoke test (task 2a)`）から復元できる。

## 位置づけ

- Capacitor の M0-A（ネイティブ shell の挙動確認）専用の**使い捨て PoC**。正式な `apps/mobile/` とは別物で、npm workspaces にも含まれていなかった。
- 構成: `appId com.kabehub.app`、Capacitor 8.5.0（exact）、`server.url` で `https://www.kabehub.com` をリモートロード、cleartext 無効、Android のみ（iOS は Mac 環境の Task 2b で実施予定のまま未実施）。
- **リモートロード方式（`server.url`）は smoke test 専用**。正式アプリは静的 export（`output: "export"`、`webDir: "out"`）を採用した（`docs/_reorg/extract/mobile.md` 判断2・3）。

## 実測結果（2026-08-19、Android のみ。Pixel 8 エミュレータ、API 37）

| 項目 | 結果 | 内容 |
|-|-|-|
| 基本レンダリング | PASS | cold start、`/login` 表示、Google ログインボタン・利用規約リンクの表示を確認 |
| Safe area | FAIL | `/terms` の固定ヘッダーがステータスバー領域（0–132 px）と重なった。`/login` は問題なし |
| Back 操作 | FAIL | `/login`→`/terms` へ遷移後に Android の戻る操作を行うと、history があっても `/login` へ戻らず app task が終了した（2回再現） |
| Keyboard | 未実施 | 認証後の smoke test へ持ち越し |
| iOS | 未実施 | Task 2b（Mac 環境）で実施予定のまま |

## 環境メモ

- 当時の Android Studio 同梱 JBR（Java 25）は、Capacitor 8.5.0 が生成した Gradle 8.14.3 の対応範囲外だった（`Unsupported class file major version 69`）。検証時のみ一時的に JDK 21 を指定して回避した。
- **現行の `apps/mobile` は AGP 9.3.2／Gradle 9.5.0**（2026-08-26 に採用）で、この問題は当時の構成固有。

## 正式 Mobile への引き継ぎ状況

- Safe area と Back 操作の FAIL が、正式な `apps/mobile` でどう扱われたかは本アーカイブでは**未確認**（`docs/_reorg/extract/mobile.md` および実機検証の記録を参照）。
- 同 PoC の Capacitor 8.5.0 は、Android 公開前に 8.5.1 以上へ更新が必要な脆弱性の対象（`docs/_reorg/extract/cross-history.md` の日付つき項目）。ディレクトリ削除で PoC 側の対象は解消する。
