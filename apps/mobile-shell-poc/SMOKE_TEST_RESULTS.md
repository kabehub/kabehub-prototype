# M0-A Native Shell Smoke Test Results

## 結果

| 項目 | Android (Task 2a) | iOS (Task 2a) |
|---|---|---|
| 基本レンダリング | **PASS** | `PENDING — Task 2b（Mac環境）で実施予定` |
| Safe area | **FAIL — `/terms` のヘッダーがステータスバー領域と重なる** | `PENDING — Task 2b（Mac環境）で実施予定` |
| Back操作 | **FAIL — historyがある状態でも `/login` へ戻らずapp taskが終了した** | `N/A — Android only（Capacitor仕様）` |
| Keyboard | `N/A — 認証後smoke testへ持ち越し` | `N/A — 認証後smoke testへ持ち越し` |

空欄はありません。`FAIL` は観測結果をそのまま記録したもので、この使い捨てPoC内での修正は本タスクの対象外です。

## 検証環境

- 実施日: 2026-08-19（Asia/Tokyo）
- Host: Microsoft Windows 10.0.26200.9168
- Node.js: 24.14.1
- npm: 11.11.0
- Capacitor: core / cli / android / ios すべて8.5.0 exact
- AVD: `Pixel_8` (`emulator-5554`)
- Android: 17 / API 37
- 画面: 1080 x 2400、status bar inset 132 px、navigation bar inset 63 px
- Application ID: `com.kabehub.app`
- Remote origin: `https://www.kabehub.com`
- Build: `assembleDebug` PASS、APK install PASS、cold start PASS

Android Studio 2026.1.3同梱JBRはJava 25でした。Capacitor 8.5.0が生成したGradle 8.14.3では `Unsupported class file major version 69` となるため、検証ビルド時のみ一時JDK 21を `org.gradle.java.home` で指定しました。リポジトリ内のGradle設定は変更していません。

## Android実測メモ

### 基本レンダリング — PASS

1. `com.kabehub.app/.MainActivity` をcold startした。
2. Capacitorログで `Loading app at https://www.kabehub.com` を確認した。
3. 未ログイン状態では `https://www.kabehub.com/login?next=%2F` がWebView内に表示された。
4. UI階層でページタイトル `KabeHub`、`Googleでログイン` ボタン、`利用規約` リンクを確認した。画面の崩れや空白表示はなかった。

### Safe area — FAIL

- `/login` の主要コンテンツはステータスバーおよび画面下部のgesture navigation barと重ならず表示された。
- `/terms` へ遷移すると、固定ヘッダーの `KabeHub / 利用規約` が画面上端から描画され、時刻・status iconの領域（0–132 px）と明確に重なった。
- このため、ページ横断のsafe-area要件としては `FAIL` と判定した。

### Back操作 — FAIL

指定手順を次のとおり実施し、同じ結果を2回確認した。

1. アプリ起動後、CDPで現在URLが `https://www.kabehub.com/login?next=%2F`、`history.length` が1であることを確認した。
2. `/login` の同一origin静的リンク `利用規約` をタップし、`https://www.kabehub.com/terms` へ遷移した。
3. CDPで `/terms` と `history.length` 2を確認し、WebView historyが1件増えたことを確認した。
4. Android backを実行した。
5. 期待した `/login` へのhistory backは発生せず、KabeHubのActivity/taskが終了してlauncherへ戻った。再現時はKabeHubプロセスも終了した。

history先頭相当の挙動は別に確認した。

1. アプリを再度cold startし、`/login?next=%2F`、`history.length` 1を確認した。
2. Android backを実行した。
3. launcherが前面になり、KabeHubのapp taskは消滅した。Linuxプロセスは直後もcached状態で残っていたため、観測結果は「app task終了・ホーム画面へ復帰（プロセスはcached）」とする。

### Keyboard — N/A

現HEADの `/login` はGoogleログインボタンのみでテキスト入力要素がないため、`N/A — Mobile auth実装後の認証済みsmoke testへ持ち越し` とした。

## iOS

Task 2aでは `npx cap add ios` を実行しておらず、`ios/` も生成していない。iOSの基本レンダリングとSafe areaはTask 2b（Mac環境）で実施する。Back操作はAndroid only、Keyboardは認証後smoke testへ持ち越す。
