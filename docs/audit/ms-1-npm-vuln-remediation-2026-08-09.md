# MS-1 npm脆弱性対応記録（2026-08-09）

実施チケット: MS-1a（next 16.3.0更新によるpostcss／nanoid／sharpの脆弱性解消）

実施日: 2026-08-09

方針: `package.json`は`next`を`16.2.11`から`16.3.0`へ変更する1行だけとし、`npm audit fix`は使用しない。`uuid`はMS-1bの対象として変更しない。

## 実行環境と結果

| item | Preflight | Postflight（コミット前） |
|---|---|---|
| Node | `v24.14.1` | `v24.14.1` |
| npm | `11.11.0` | `11.11.0` |
| registry | `https://registry.npmjs.org/` | `https://registry.npmjs.org/` |
| `git rev-parse HEAD` | `39a80cca9b94b0fced6da42d3dc87f914e5cbd12` | `39a80cca9b94b0fced6da42d3dc87f914e5cbd12` |
| `git hash-object package-lock.json` | `315b46a162bc7c59cdd4d70511c7619d14a984a1` | `3a818478b2d96f3dbb70c716812a71e6549594d7` |
| audit | Moderate 1、High 4、合計5 vulnerable packages | Moderate 1、合計1 vulnerable package（`uuid`のみ） |

結果: `next`、`postcss`、`nanoid`、`sharp`は`npm audit --json`の`vulnerabilities`から消滅した。MS-1b対象の`uuid` 1件だけが残存している。

## 実行コマンド

```text
git status --short
git rev-parse HEAD
git hash-object package-lock.json
npm audit --json
npm ls next postcss nanoid sharp
node --version
npm --version
npm config get registry
npm install
npm ls next postcss nanoid sharp
npm update postcss nanoid
npm ls next postcss nanoid sharp
git ls-files --others --exclude-standard
git status --short -- next-env.d.ts tsconfig.tsbuildinfo
git diff -- next-env.d.ts tsconfig.tsbuildinfo
git diff -- package.json
npm run build
Move-Item -LiteralPath 'C:\Users\Admin\Desktop\20260328\temp_check.tsx' -Destination 'C:\Users\Admin\AppData\Local\Temp\ms-1a-20260809-temp_check.tsx'
npm run build
Move-Item -LiteralPath 'C:\Users\Admin\AppData\Local\Temp\ms-1a-20260809-temp_check.tsx' -Destination 'C:\Users\Admin\Desktop\20260328\temp_check.tsx'
git ls-files --others --exclude-standard
git status --short -- next-env.d.ts tsconfig.tsbuildinfo
git diff -- next-env.d.ts tsconfig.tsbuildinfo
git restore -- next-env.d.ts
git status --short -- next-env.d.ts tsconfig.tsbuildinfo
git diff -- next-env.d.ts tsconfig.tsbuildinfo
npm audit --json
npm ls next postcss nanoid sharp
git hash-object package-lock.json
git diff -- package.json package-lock.json
npm explain @emnapi/runtime
git add package.json package-lock.json docs/audit/ms-1-npm-vuln-remediation-2026-08-09.md
git diff --cached --check
git diff --cached --stat
git diff --cached -- package.json
git status --short
git commit -m "chore(deps): next 16.3.0へ更新しpostcss/nanoid/sharpの脆弱性を解消（MS-1a）"
```

`npm audit --json`は脆弱性が存在するため終了コード1となる。JSONを正常に取得できている場合はnpm auditの仕様どおりとして扱った。サンドボックス内のregistry接続失敗後、同じコマンドをネットワーク許可付きで再実行した。

## Preflight生出力

### `git status --short`

```text
 M docs/audit/full-audit-a-2026-07-13.md
?? "KabeHub_\347\233\243\346\237\273H_I\345\257\276\345\277\234_\345\256\237\350\243\205\346\226\271\351\207\235_\345\274\225\343\201\215\347\266\231\343\201\216\350\263\207\346\226\231.md"
?? app/test-login/
?? temp_album.txt
?? temp_chat.txt
?? temp_check.tsx
?? temp_h.txt
?? temp_messages.txt
warning: unable to access 'C:\Users\Admin/.config/git/ignore': Permission denied
warning: unable to access 'C:\Users\Admin/.config/git/ignore': Permission denied
```

上記は開始時点から存在するユーザー変更であり、本作業では変更・stageしない。

### `git rev-parse HEAD`

```text
39a80cca9b94b0fced6da42d3dc87f914e5cbd12
```

### `git hash-object package-lock.json`

```text
315b46a162bc7c59cdd4d70511c7619d14a984a1
```

### `npm audit --json`（サンドボックス内の初回失敗）

```text
{
  "message": "request to https://registry.npmjs.org/-/npm/v1/security/advisories/bulk failed, reason: ",
  "error": {
    "summary": "",
    "detail": ""
  }
}
npm warn audit request to https://registry.npmjs.org/-/npm/v1/security/advisories/bulk failed, reason:
npm error audit endpoint returned an error
npm error Log files were not written due to an error writing to the directory: C:\Users\Admin\AppData\Local\npm-cache\_logs
npm error You can rerun the command with `--loglevel=verbose` to see the logs in your terminal
```

### `npm audit --json`（ネットワーク許可付き再実行）

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {
    "nanoid": {
      "name": "nanoid",
      "severity": "high",
      "isDirect": false,
      "via": [
        {
          "source": 1138813,
          "name": "nanoid",
          "dependency": "nanoid",
          "title": "nanoid: custom generators can loop indefinitely when size is zero",
          "url": "https://github.com/advisories/GHSA-2v37-7h3g-55p8",
          "severity": "high",
          "cwe": [
            "CWE-835"
          ],
          "cvss": {
            "score": 5.9,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H"
          },
          "range": "<3.3.17"
        }
      ],
      "effects": [],
      "range": "<3.3.17",
      "nodes": [
        "node_modules/nanoid"
      ],
      "fixAvailable": true
    },
    "next": {
      "name": "next",
      "severity": "high",
      "isDirect": true,
      "via": [
        "postcss",
        "sharp"
      ],
      "effects": [],
      "range": "9.3.4-canary.0 - 16.3.0-preview.10",
      "nodes": [
        "node_modules/next"
      ],
      "fixAvailable": {
        "name": "next",
        "version": "16.3.0",
        "isSemVerMajor": false
      }
    },
    "postcss": {
      "name": "postcss",
      "severity": "high",
      "isDirect": true,
      "via": [
        {
          "source": 1117015,
          "name": "postcss",
          "dependency": "postcss",
          "title": "PostCSS has XSS via Unescaped </style> in its CSS Stringify Output",
          "url": "https://github.com/advisories/GHSA-qx2v-qp2m-jg93",
          "severity": "moderate",
          "cwe": [
            "CWE-79"
          ],
          "cvss": {
            "score": 6.1,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N"
          },
          "range": "<8.5.10"
        },
        {
          "source": 1124252,
          "name": "postcss",
          "dependency": "postcss",
          "title": "PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments",
          "url": "https://github.com/advisories/GHSA-6g55-p6wh-862q",
          "severity": "high",
          "cwe": [
            "CWE-22",
            "CWE-200"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N"
          },
          "range": "<=8.5.11"
        },
        {
          "source": 1124288,
          "name": "postcss",
          "dependency": "postcss",
          "title": "PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure",
          "url": "https://github.com/advisories/GHSA-r28c-9q8g-f849",
          "severity": "high",
          "cwe": [
            "CWE-22"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N"
          },
          "range": "<=8.5.17"
        },
        {
          "source": 1130709,
          "name": "postcss",
          "dependency": "postcss",
          "title": "PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset",
          "url": "https://github.com/advisories/GHSA-fxqj-rqcc-2cmp",
          "severity": "moderate",
          "cwe": [
            "CWE-22",
            "CWE-200"
          ],
          "cvss": {
            "score": 0,
            "vectorString": null
          },
          "range": "<=8.5.22"
        }
      ],
      "effects": [
        "next"
      ],
      "range": "<=8.5.22",
      "nodes": [
        "node_modules/next/node_modules/postcss",
        "node_modules/postcss"
      ],
      "fixAvailable": {
        "name": "next",
        "version": "16.3.0",
        "isSemVerMajor": false
      }
    },
    "sharp": {
      "name": "sharp",
      "severity": "high",
      "isDirect": false,
      "via": [
        {
          "source": 1124066,
          "name": "sharp",
          "dependency": "sharp",
          "title": "sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591",
          "url": "https://github.com/advisories/GHSA-f88m-g3jw-g9cj",
          "severity": "high",
          "cwe": [
            "CWE-1395"
          ],
          "cvss": {
            "score": 0,
            "vectorString": null
          },
          "range": "<0.35.0"
        }
      ],
      "effects": [
        "next"
      ],
      "range": "<0.35.0",
      "nodes": [
        "node_modules/sharp"
      ],
      "fixAvailable": {
        "name": "next",
        "version": "16.3.0",
        "isSemVerMajor": false
      }
    },
    "uuid": {
      "name": "uuid",
      "severity": "moderate",
      "isDirect": true,
      "via": [
        {
          "source": 1119441,
          "name": "uuid",
          "dependency": "uuid",
          "title": "uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided",
          "url": "https://github.com/advisories/GHSA-w5hq-g745-h8pq",
          "severity": "moderate",
          "cwe": [
            "CWE-787",
            "CWE-1285"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N"
          },
          "range": "<11.1.1"
        }
      ],
      "effects": [],
      "range": "<11.1.1",
      "nodes": [
        "node_modules/uuid"
      ],
      "fixAvailable": {
        "name": "uuid",
        "version": "14.0.1",
        "isSemVerMajor": true
      }
    }
  },
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 1,
      "high": 4,
      "critical": 0,
      "total": 5
    },
    "dependencies": {
      "prod": 152,
      "dev": 82,
      "optional": 38,
      "peer": 0,
      "peerOptional": 0,
      "total": 270
    }
  }
}
```

対象4パッケージのadvisory objectは、nanoid 1件、postcss 4件、sharp 1件の合計6件。`next.via`は`postcss`と`sharp`の文字列参照であり、独立advisoryとして重複計上しない。これとは別にMS-1b対象のuuid 1件がある。

### `npm ls next postcss nanoid sharp`

```text
ai-editor@0.1.0 C:\Users\Admin\Desktop\20260328
+-- autoprefixer@10.4.27
| `-- postcss@8.5.18 deduped
+-- next@16.2.11
| +-- postcss@8.4.31
| | `-- nanoid@3.3.16 deduped
| `-- sharp@0.34.5
+-- postcss@8.5.18
| `-- nanoid@3.3.16
`-- tailwindcss@3.4.19
  +-- postcss-import@15.1.0
  | `-- postcss@8.5.18 deduped
  +-- postcss-js@4.1.0
  | `-- postcss@8.5.18 deduped
  +-- postcss-load-config@6.0.1
  | `-- postcss@8.5.18 deduped
  +-- postcss-nested@6.2.0
  | `-- postcss@8.5.18 deduped
  `-- postcss@8.5.18 deduped
```

## install・依存解決の生出力

`package.json`の`"next": "16.2.11"`を`"next": "16.3.0"`へ変更した。他の行は変更していない。

### `npm install`（サンドボックス内の初回失敗）

```text
npm error code EACCES
npm error errno EACCES
npm error FetchError: request to https://registry.npmjs.org/next failed, reason:
npm error     at ClientRequest.<anonymous> (C:\Program Files\nodejs\node_modules\npm\node_modules\minipass-fetch\lib\index.js:130:14)
npm error     at ClientRequest.emit (node:events:508:28)
npm error     at emitErrorEvent (node:_http_client:108:11)
npm error     at _destroy (node:_http_client:963:9)
npm error     at onSocketNT (node:_http_client:983:5)
npm error     at process.processTicksAndRejections (node:internal/process/task_queues:91:21) {
npm error   code: 'EACCES',
npm error   errno: 'EACCES',
npm error   type: 'system',
npm error   requiredBy: '.'
npm error }
npm error
npm error The operation was rejected by your operating system.
npm error It's possible that the file was already in use (by a text editor or antivirus),
npm error or that you lack permissions to access it.
npm error
npm error If you believe this might be a permissions issue, please double-check the
npm error permissions of the file and its containing directories, or try running
npm error the command again as root/Administrator.
npm error Log files were not written due to an error writing to the directory: C:\Users\Admin\AppData\Local\npm-cache\_logs
npm error You can rerun the command with `--loglevel=verbose` to see the logs in your terminal
```

### `npm install`（権限付き再実行）

```text
added 2 packages, removed 1 package, changed 6 packages, and audited 240 packages in 2m

111 packages are looking for funding
  run `npm fund` for details

2 vulnerabilities (1 moderate, 1 high)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
```

表示された`npm audit fix`は実行していない。

### `npm ls next postcss nanoid sharp`（`npm install`直後）

```text
ai-editor@0.1.0 C:\Users\Admin\Desktop\20260328
+-- autoprefixer@10.4.27
| `-- postcss@8.5.23 deduped
+-- next@16.3.0
| +-- postcss@8.5.23 deduped
| `-- sharp@0.35.3
+-- postcss@8.5.23
| `-- nanoid@3.3.16
`-- tailwindcss@3.4.19
  +-- postcss-import@15.1.0
  | `-- postcss@8.5.23 deduped
  +-- postcss-js@4.1.0
  | `-- postcss@8.5.23 deduped
  +-- postcss-load-config@6.0.1
  | `-- postcss@8.5.23 deduped
  +-- postcss-nested@6.2.0
  | `-- postcss@8.5.23 deduped
  `-- postcss@8.5.23 deduped
```

`nanoid@3.3.16`が修正版基準`3.3.17`未満で残ったため、指定条件に従い`npm update postcss nanoid`を実行した。`package.json`の`postcss` rangeは`^8`のまま変更されていない。

### `npm update postcss nanoid`（サンドボックス内の初回タイムアウト）

```text
command timed out after 120332 milliseconds
npm warn ERESOLVE overriding peer dependency
npm warn While resolving: ai-editor@0.1.0
npm warn Found: postcss@8.5.23
npm warn node_modules/postcss
npm warn   dev postcss@"^8" from the root project
npm warn   7 more (autoprefixer, next, postcss-import, postcss-js, ...)
npm warn
npm warn Could not resolve dependency:
npm warn peer postcss@"^8.1.0" from autoprefixer@10.4.27
npm warn node_modules/autoprefixer
npm warn   dev autoprefixer@"^10" from the root project
```

上記の`7 more`と末尾の`...`はnpm自身が出力した原文であり、証跡作成時の省略ではない。

### `npm update postcss nanoid`（権限付き再実行）

```text
changed 1 package, and audited 240 packages in 844ms

111 packages are looking for funding
  run `npm fund` for details

1 moderate severity vulnerability

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
```

### `npm ls next postcss nanoid sharp`（明示更新後）

```text
ai-editor@0.1.0 C:\Users\Admin\Desktop\20260328
+-- autoprefixer@10.4.27
| `-- postcss@8.5.23 deduped
+-- next@16.3.0
| +-- postcss@8.5.23 deduped
| `-- sharp@0.35.3
+-- postcss@8.5.23
| `-- nanoid@3.3.18
`-- tailwindcss@3.4.19
  +-- postcss-import@15.1.0
  | `-- postcss@8.5.23 deduped
  +-- postcss-js@4.1.0
  | `-- postcss@8.5.23 deduped
  +-- postcss-load-config@6.0.1
  | `-- postcss@8.5.23 deduped
  +-- postcss-nested@6.2.0
  | `-- postcss@8.5.23 deduped
  `-- postcss@8.5.23 deduped
```

## build・生成差分・未追跡ファイル

### build前の`git ls-files --others --exclude-standard`

```text
"KabeHub_\347\233\243\346\237\273H_I\345\257\276\345\277\234_\345\256\237\350\243\205\346\226\271\351\207\235_\345\274\225\343\201\215\347\266\231\343\201\216\350\263\207\346\226\231.md"
app/test-login/page.tsx
temp_album.txt
temp_chat.txt
temp_check.tsx
temp_h.txt
temp_messages.txt
warning: unable to access 'C:\Users\Admin/.config/git/ignore': Permission denied
```

### 1回目の`npm run build`（失敗生ログ）

```text
> ai-editor@0.1.0 build
> next build --webpack

▲ Next.js 16.3.0 (webpack)
- Environments: .env.local
✓ Running next.config.js took 12ms

  Creating an optimized production build ...
✓ Compiled successfully in 8.7s
  Running TypeScript ...
temp_check.tsx(5,61): error TS2307: Cannot find module './MessageBubble' or its corresponding type declarations.
temp_check.tsx(6,89): error TS2307: Cannot find module './ChatInput' or its corresponding type declarations.
temp_check.tsx(7,31): error TS2307: Cannot find module './ChatInputCentered' or its corresponding type declarations.
temp_check.tsx(8,25): error TS2307: Cannot find module './ExportModal' or its corresponding type declarations.
temp_check.tsx(13,33): error TS2307: Cannot find module './PublishConfirmModal' or its corresponding type declarations.
temp_check.tsx(14,56): error TS2307: Cannot find module './RoleplayBubble' or its corresponding type declarations.
⚠ Warning: Next.js ignored package-lock.json in C:\Users\Admin because it is outside the current Git repository (C:\Users\Admin\Desktop\20260328).
 To use this directory, set `outputFileTracingRoot` in your Next.js config.

Failed to type check.
```

原因: 作業開始前から存在する未追跡`temp_check.tsx`がTypeScript対象に入り、同ファイル内の相対import 6件を解決できなかった。Next 16.3.0自体のwebpack compileは成功していた。

移動元`C:\Users\Admin\Desktop\20260328\temp_check.tsx`が存在し、移動先`C:\Users\Admin\AppData\Local\Temp\ms-1a-20260809-temp_check.tsx`が存在しないことを絶対パスで確認した。同ファイルだけを一時退避し、再検証後に元の絶対パスへ復元した。

### 2回目の`npm run build`（再検証成功生ログ）

```text
> ai-editor@0.1.0 build
> next build --webpack

▲ Next.js 16.3.0 (webpack)
- Environments: .env.local
✓ Running next.config.js took 12ms

  Creating an optimized production build ...
✓ Compiled successfully in 3.4s
  Running TypeScript ...
  Finished TypeScript in 1400ms ...
  Collecting page data using 15 workers ...
  Generating static pages using 15 workers (0/28) ...
  Generating static pages using 15 workers (7/28)
  Generating static pages using 15 workers (14/28)
  Generating static pages using 15 workers (21/28)
✓ Generating static pages using 15 workers (28/28) in 1266ms
  Finalizing page optimization ...
  Collecting build traces ...

Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /[handle]
├ ƒ /admin/storage-cleanup
├ ƒ /album
├ ƒ /api/account
├ ƒ /api/album
├ ƒ /api/arena
├ ƒ /api/auth/github
├ ƒ /api/auth/github/callback
├ ƒ /api/auth/github/status
├ ƒ /api/calendar
├ ƒ /api/chat
├ ƒ /api/cron/storage-cleanup
├ ƒ /api/csp-report
├ ƒ /api/explore
├ ƒ /api/extract-settings
├ ƒ /api/fetch-github
├ ƒ /api/folder-settings
├ ƒ /api/image-gen
├ ƒ /api/lore
├ ƒ /api/lore/[id]
├ ƒ /api/lore/batch-train
├ ƒ /api/lore/bulk-archive
├ ƒ /api/lore/chunks
├ ƒ /api/lore/chunks/[id]
├ ƒ /api/lore/consolidate/candidates
├ ƒ /api/lore/consolidate/dismiss
├ ƒ /api/lore/consolidate/merge
├ ƒ /api/lore/consolidate/preview
├ ƒ /api/lore/dreaming-batch
├ ƒ /api/lore/dreaming-batch/history
├ ƒ /api/lore/dreaming-batch/rollback
├ ƒ /api/lore/embed
├ ƒ /api/lore/like
├ ƒ /api/lore/update-temporal-status
├ ƒ /api/mcp-tokens
├ ƒ /api/mcp/threads
├ ƒ /api/mcp/threads/[id]/messages
├ ƒ /api/messages/[id]
├ ƒ /api/novel-check
├ ƒ /api/profile
├ ƒ /api/reports
├ ƒ /api/search
├ ƒ /api/share/[token]
├ ƒ /api/share/[token]/fork
├ ƒ /api/stats
├ ƒ /api/threads
├ ƒ /api/threads/[id]
├ ƒ /api/threads/[id]/branch-to
├ ƒ /api/threads/[id]/copy
├ ƒ /api/threads/[id]/drafts
├ ƒ /api/threads/[id]/likes
├ ƒ /api/threads/[id]/message-notes
├ ƒ /api/threads/[id]/messages
├ ƒ /api/threads/[id]/messages/[messageId]
├ ƒ /api/threads/[id]/messages/restore-branch
├ ƒ /api/threads/[id]/notes
├ ƒ /api/threads/[id]/tags
├ ƒ /arena
├ ƒ /arena/[token]
├ ƒ /auth/callback
├ ƒ /calendar
├ ƒ /explore
├ ƒ /image
├ ƒ /legal
├ ƒ /login
├ ƒ /memory
├ ƒ /novel-check
├ ƒ /privacy
├ ƒ /settings
├ ƒ /share/[token]
├ ○ /sitemap.xml
├ ƒ /stats
├ ƒ /terms
├ ƒ /test-login
└ ƒ /threads/[id]/tree


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

⚠ Warning: Next.js ignored package-lock.json in C:\Users\Admin because it is outside the current Git repository (C:\Users\Admin\Desktop\20260328).
 To use this directory, set `outputFileTracingRoot` in your Next.js config.
```

### build後の`git ls-files --others --exclude-standard`

```text
"KabeHub_\347\233\243\346\237\273H_I\345\257\276\345\277\234_\345\256\237\350\243\205\346\226\271\351\207\235_\345\274\225\343\201\215\347\266\231\343\201\216\350\263\207\346\226\231.md"
app/test-login/page.tsx
temp_album.txt
temp_chat.txt
temp_check.tsx
temp_h.txt
temp_messages.txt
warning: unable to access 'C:\Users\Admin/.config/git/ignore': Permission denied
```

build前後は完全一致した。一時退避先は復元後に存在せず、元の`temp_check.tsx`が存在することも確認した。

### build直後の`git diff -- next-env.d.ts tsconfig.tsbuildinfo`

```diff
diff --git a/next-env.d.ts b/next-env.d.ts
index 9edff1c..ce4e94a 100644
--- a/next-env.d.ts
+++ b/next-env.d.ts
@@ -1,6 +1,7 @@
 /// <reference types="next" />
 /// <reference types="next/image-types/global" />
 import "./.next/types/routes.d.ts";
+import "./.next/types/root-params.d.ts";

 // NOTE: This file should not be edited
 // see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

`next-env.d.ts`の1行追加はbuild起因の生成差分であるため、`git restore -- next-env.d.ts`で復元した。`tsconfig.tsbuildinfo`はbuild後も差分なし。復元後の`git status --short -- next-env.d.ts tsconfig.tsbuildinfo`と`git diff -- next-env.d.ts tsconfig.tsbuildinfo`はいずれも出力なしだった。

## Postflight生出力

### `npm audit --json`

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {
    "uuid": {
      "name": "uuid",
      "severity": "moderate",
      "isDirect": true,
      "via": [
        {
          "source": 1119441,
          "name": "uuid",
          "dependency": "uuid",
          "title": "uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided",
          "url": "https://github.com/advisories/GHSA-w5hq-g745-h8pq",
          "severity": "moderate",
          "cwe": [
            "CWE-787",
            "CWE-1285"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N"
          },
          "range": "<11.1.1"
        }
      ],
      "effects": [],
      "range": "<11.1.1",
      "nodes": [
        "node_modules/uuid"
      ],
      "fixAvailable": {
        "name": "uuid",
        "version": "14.0.1",
        "isSemVerMajor": true
      }
    }
  },
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 1,
      "high": 0,
      "critical": 0,
      "total": 1
    },
    "dependencies": {
      "prod": 152,
      "dev": 81,
      "optional": 40,
      "peer": 0,
      "peerOptional": 0,
      "total": 271
    }
  }
}
```

### `npm ls next postcss nanoid sharp`

```text
ai-editor@0.1.0 C:\Users\Admin\Desktop\20260328
+-- autoprefixer@10.4.27
| `-- postcss@8.5.23 deduped
+-- next@16.3.0
| +-- postcss@8.5.23 deduped
| `-- sharp@0.35.3
+-- postcss@8.5.23
| `-- nanoid@3.3.18
`-- tailwindcss@3.4.19
  +-- postcss-import@15.1.0
  | `-- postcss@8.5.23 deduped
  +-- postcss-js@4.1.0
  | `-- postcss@8.5.23 deduped
  +-- postcss-load-config@6.0.1
  | `-- postcss@8.5.23 deduped
  +-- postcss-nested@6.2.0
  | `-- postcss@8.5.23 deduped
  `-- postcss@8.5.23 deduped
```

### `git hash-object package-lock.json`

```text
3a818478b2d96f3dbb70c716812a71e6549594d7
```

## 差分確認

- `git diff -- package.json package-lock.json`を完全表示して確認した。
- `package.json`の変更は`next: 16.2.11 -> 16.3.0`の1行だけ。`postcss`は`^8`、`uuid`は`^9.0.1`のまま。
- lockfileのversion/resolved変更は、Next本体、`@next/env`、Nextの各SWC optional dependency、PostCSS、nanoid、sharp、sharpの各platform/libvips optional dependency、sharp wasmが要求する`@emnapi/runtime`だけだった。
- `node_modules/next/node_modules/postcss@8.4.31`は削除され、rootの`postcss@8.5.23`へdedupeされた。これは`npm ls`でもNext配下が`postcss@8.5.23 deduped`と確認できる。
- `@emnapi/runtime@1.11.3`は`@img/sharp-wasm32@0.35.3`の`^1.11.1`依存であり、sharp更新の推移依存である。
- 対象外パッケージの無関係なversion bumpまたはresolution変更はない。

## Disposition

MS-1aの受け入れ条件を満たした。対象4パッケージの6 advisoryは解消し、`uuid` 1件のみをMS-1bへ残す。webpack buildは既存未追跡ファイルを一時退避した再検証で成功し、生成差分と未追跡ファイル増減は残していない。
