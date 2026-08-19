# KabeHub Mobile Shell PoC

このディレクトリは、M0-Aのネイティブshell挙動だけを確認するための**使い捨てPoC**です。タスク3以降で作成する正式な `apps/mobile/` とは別物であり、このコードや生成済みネイティブプロジェクトを正式Mobileアプリへ移行する前提ではありません。rootのnpm workspacesにも含めません。

## M0-A限定の構成

- Application ID / package name: `com.kabehub.app`
- Application name: `KabeHub`
- Web assets directory: `www`
- Remote URL: `https://www.kabehub.com`
- Cleartext traffic: disabled
- Capacitor packages: `8.5.0` exact
- Android project: `android/`
- iOS project: Task 2aでは生成しない

`capacitor.config.ts` の `server.url` によるリモートロードは、M0-A smoke test専用です。この方式を本番Mobile topologyへ持ち込んではいけません。本番アプリでは正式なMobile構成と配信方式を別途設計・実装します。

## Node.js要件

root Webの `README.md` が要求するNode.js 20.9以上と、このPoCが要求するNode.js 22以上は、別環境の要件です。このPoCの要件は `package.json` の `engines.node` に記録しています。

## ローカル操作

依存のインストールとAndroid同期は、このディレクトリで実行します。

```powershell
npm install
npx cap sync android
```

AndroidデバッグAPKは `android/` でビルドします。

```powershell
.\gradlew.bat assembleDebug
```

2026-08-19のWindows検証環境では、Android Studio 2026.1.3同梱JBRがJava 25で、Capacitor 8.5.0が生成したGradle 8.14.3の対応範囲外でした。そのため、生成物を変更せず、検証ビルド時のみ一時配置したJDK 21を `org.gradle.java.home` で指定しました。

検証結果と実測手順は `SMOKE_TEST_RESULTS.md` を参照してください。
