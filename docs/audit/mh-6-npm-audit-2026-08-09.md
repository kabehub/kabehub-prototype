# MH-6 npm audit確認記録（2026-08-09）

実施チケット: MH-6（I-1・I-2）

実施日: 2026-08-09

方針: 未使用依存`rehype-highlight`の削除と現況記録のみ。検出された脆弱性の修正・パッケージ更新はMS-1へ送る。

## 実行環境と対象

| item | I-1実施前 | I-1実施後（コミット前） |
|---|---|---|
| Node | `v24.14.1` | `v24.14.1` |
| npm | `11.11.0` | `11.11.0` |
| registry | `https://registry.npmjs.org/` | `https://registry.npmjs.org/` |
| `git rev-parse HEAD` | `52b1b28905ecad246b6fee9c845203b7214a512a` | `52b1b28905ecad246b6fee9c845203b7214a512a` |
| `git hash-object package-lock.json` | `ff970c1af631498cb261ab4d37dc835d0c34a819` | `315b46a162bc7c59cdd4d70511c7619d14a984a1` |

実施前後のlockfile hashは異なる。したがって、post auditは`rehype-highlight`削除後の`package-lock.json`を対象に実行した。

## 実行コマンド

```text
git status --short
git ls-files --others --exclude-standard
node --version
npm --version
npm config get registry
git rev-parse HEAD
git hash-object package-lock.json
npm audit --json
npm uninstall rehype-highlight --ignore-scripts --no-audit
npm ls --depth=0
npm ls rehype-highlight lowlight highlight.js --all
git diff -- package.json package-lock.json
npm run build
git status --short -- next-env.d.ts tsconfig.tsbuildinfo components/MarkdownRenderer.tsx
git ls-files --others --exclude-standard
git hash-object package-lock.json
npm audit --json
npm explain nanoid
npm explain sharp
npm explain postcss
```

`npm audit --json`はいずれもJSONを正常に出力し、脆弱性が存在するため終了コード1となった。これはnpm auditの正常な仕様として扱った。

## I-1実施前のaudit結果

metadataのseverity集計はModerate 1、High 4、合計5。依存数はprod 158、dev 82、optional 38、total 276だった。

### 表A: Vulnerable package summary

| package | severity | direct | nodes/dependency path |
|---|---|---|---|
| `nanoid` | high | false | `node_modules/nanoid`; `root > next@16.2.11 > postcss@8.4.31 > nanoid@3.3.16`および`root > postcss@8.5.18 > nanoid@3.3.16`（`npm explain nanoid`） |
| `next` | high | true | `node_modules/next`（root direct） |
| `postcss` | high | true | `node_modules/postcss`（root dev direct）、`node_modules/next/node_modules/postcss`（`root > next@16.2.11 > postcss@8.4.31`。`npm explain postcss`） |
| `sharp` | high | false | `node_modules/sharp`; `root > next@16.2.11 > sharp@0.34.5`（optional、`npm explain sharp`） |
| `uuid` | moderate | true | `node_modules/uuid`（root direct） |

### 表B: Advisory details

| package | advisory source/ID | advisory URL | severity |
|---|---|---|---|
| `nanoid` | `1138813` | `https://github.com/advisories/GHSA-2v37-7h3g-55p8` | high |
| `postcss` | `1117015` | `https://github.com/advisories/GHSA-qx2v-qp2m-jg93` | moderate |
| `postcss` | `1124252` | `https://github.com/advisories/GHSA-6g55-p6wh-862q` | high |
| `postcss` | `1124288` | `https://github.com/advisories/GHSA-r28c-9q8g-f849` | high |
| `postcss` | `1130709` | `https://github.com/advisories/GHSA-fxqj-rqcc-2cmp` | moderate |
| `sharp` | `1124066` | `https://github.com/advisories/GHSA-f88m-g3jw-g9cj` | high |
| `uuid` | `1119441` | `https://github.com/advisories/GHSA-w5hq-g745-h8pq` | moderate |

`next.via`はadvisory objectではなく文字列`postcss`・`sharp`だったため、表Bでは独立advisoryとして重複計上していない。

## I-1実施後（コミット前）のaudit結果

metadataのseverity集計はModerate 1、High 4、合計5。依存数はprod 152、dev 82、optional 38、total 270だった。

### 表A: Vulnerable package summary

| package | severity | direct | nodes/dependency path |
|---|---|---|---|
| `nanoid` | high | false | `node_modules/nanoid`; `root > next@16.2.11 > postcss@8.4.31 > nanoid@3.3.16`および`root > postcss@8.5.18 > nanoid@3.3.16`（`npm explain nanoid`） |
| `next` | high | true | `node_modules/next`（root direct） |
| `postcss` | high | true | `node_modules/postcss`（root dev direct）、`node_modules/next/node_modules/postcss`（`root > next@16.2.11 > postcss@8.4.31`。`npm explain postcss`） |
| `sharp` | high | false | `node_modules/sharp`; `root > next@16.2.11 > sharp@0.34.5`（optional、`npm explain sharp`） |
| `uuid` | moderate | true | `node_modules/uuid`（root direct） |

### 表B: Advisory details

| package | advisory source/ID | advisory URL | severity |
|---|---|---|---|
| `nanoid` | `1138813` | `https://github.com/advisories/GHSA-2v37-7h3g-55p8` | high |
| `postcss` | `1117015` | `https://github.com/advisories/GHSA-qx2v-qp2m-jg93` | moderate |
| `postcss` | `1124252` | `https://github.com/advisories/GHSA-6g55-p6wh-862q` | high |
| `postcss` | `1124288` | `https://github.com/advisories/GHSA-r28c-9q8g-f849` | high |
| `postcss` | `1130709` | `https://github.com/advisories/GHSA-fxqj-rqcc-2cmp` | moderate |
| `sharp` | `1124066` | `https://github.com/advisories/GHSA-f88m-g3jw-g9cj` | high |
| `uuid` | `1119441` | `https://github.com/advisories/GHSA-w5hq-g745-h8pq` | moderate |

`next.via`はadvisory objectではなく文字列`postcss`・`sharp`だったため、表Bでは独立advisoryとして重複計上していない。

## I-1実施前後の比較

- vulnerable packageは前後とも5件、advisory objectは前後とも7件で、新規発生・解消はいずれも0件。
- package名、severity、direct区分、nodes、advisory source/ID、URLは前後で同一。
- 依存総数は276から270へ6件減少した。これは`rehype-highlight`本体と、その専用推移依存`hast-util-is-element`、`hast-util-to-text`、`highlight.js`、`lowlight`、`unist-util-find-after`の削除による。audit対象のvulnerable packageには含まれていないため、audit結果に影響しなかった。
- `git diff -- package.json package-lock.json`に無関係な既存パッケージのversion bump・resolution変更はなかった。

MH-0には『4パッケージ5件』と記録されている。ただし当時の『5件』のカウント単位は、今回のadvisory単位集計（表B）と一致するとは限らないため、その表記を原文どおり比較対象として残す。今回の実測はvulnerable package数5件（表A）、advisory数7件（表B）である。

## I-1・build・作業状態の確認

- `git grep -n -F "rehype-highlight" -- package.json package-lock.json`: 0件。
- `npm ls rehype-highlight lowlight highlight.js --all`: `(empty)`。3パッケージとも依存ツリーに残っていないため、別依存経路の追加説明は不要。
- `npm run build`: 成功。最初のsandbox内実行は親ディレクトリのlockfile確認時の権限制約で停止し、権限付き実行では未追跡`temp_check.tsx`の型エラーを確認した。指示どおり同ファイルだけをリポジトリ外へ一時退避した再実行で成功し、完了後に元の場所へ復元した。
- `next-env.d.ts`、`tsconfig.tsbuildinfo`、`components/MarkdownRenderer.tsx`: build後も差分なし。
- `git ls-files --others --exclude-standard`: Step 0とbuild後で完全一致（`app/test-login/page.tsx`、`temp_album.txt`、`temp_chat.txt`、`temp_check.tsx`、`temp_h.txt`、`temp_messages.txt`）。

## Disposition

I-1は未使用依存の削除とbuild確認を完了。I-2は実施前後およびMH-0との差分を本書に記録して完了。検出された脆弱性の対応は本チケットでは行わず、MS-1（別セッション）へ送る。
