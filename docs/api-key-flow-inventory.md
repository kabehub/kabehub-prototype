# APIキー送受信経路インベントリ

- 監査対象base SHA: `05ba12daa8334f0a2e710ce53fcc1463e4d12a38`
- 静的監査日: 2026-07-25
- Mobile Task12追補日: 2026-08-27
- 対象: Anthropic（Claude）、Google（Gemini）、OpenAI、Ideogram、OpenRouterのBYOK APIキー
- 対象外: GitHub OAuthアクセストークン、KabeHub MCPトークン、Supabase service role keyなど、AIプロバイダーのBYOKではない資格情報

この文書の件数は固定しない。次の横断grepの検出結果を起点とし、ヒットした変数の定義元・呼び出し元・受信Route・外部転送・DB書込みまで実ファイルで追跡した。

```bash
git grep -n -E "kabehub_(anthropic|gemini|openai|ideogram|openrouter)_key" -- app components lib
git grep -n -E "x-(anthropic|gemini|openai|ideogram|openrouter)-api-key" -- app components lib
git grep -n -E "x-goog-api-key|x-api-key|Api-Key|Authorization" -- app/api lib
git grep -n -E "apiKey|anthropicKey|geminiKey|openaiKey|ideogramKey|openrouterKey" -- app/api app components lib
```

行番号は変更でずれるため主キーにせず、ファイルパスと関数／コンポーネント名で記録する。

## 1. 保存場所とブラウザ内の読取

### Web

| ファイル・関数／コンポーネント | 方向 | プロバイダー | LocalStorageキー | 用途 |
|---|---|---|---|---|
| `app/settings/page.tsx` / `SettingsPage`、`handleSaveApiKeys` | 読取・保存・削除 | 5種すべて | 下記5キー | 正式な設定画面。マウント時に読み、保存操作でset/removeする |
| `components/ChatPanel.tsx` / `ChatPanel`、`handleSaveApiKeys` | 読取・保存・削除 | Anthropic、Gemini、OpenAI | 対応する3キー | `SettingsPage`とは独立した簡易設定パネル |
| `app/page.tsx` / `getApiKeyHeaders`、画像生成、設定抽出 | 読取・内部送信 | 5種すべて | 下記5キー | chat、image-gen、extract-settings用 |
| `app/arena/page.tsx` / `getApiKeyHeaders` | 読取・内部送信 | Anthropic、Gemini、OpenAI | 対応する3キー | arena用 |
| `app/image/page.tsx` / `handleGenerate` | 読取・内部送信 | Gemini、OpenAI、Ideogram、OpenRouter | 対応する4キー | 選択中の画像プロバイダー用 |
| `app/novel-check/page.tsx` / `NovelCheckPage` | 読取・内部送信 | Gemini | `kabehub_gemini_key` | novel-check用 |
| `app/memory/page.tsx` / Memory画面各ハンドラー | 読取・内部送信 | OpenAI | `kabehub_openai_key` | Loreの埋め込み・学習・統合用 |
| `components/MessageBubble.tsx` / `handleLike` | 読取・内部送信 | OpenAI | `kabehub_openai_key` | LikeしたAI回答の埋め込み用 |
| `components/NovelSettingsPane.tsx` / `handleEmbed` | 読取・内部送信 | OpenAI | `kabehub_openai_key` | Loreチャンク登録用 |

LocalStorageキーは次の5種であり、名称は変更していない。

| プロバイダー | LocalStorageキー |
|---|---|
| Anthropic | `kabehub_anthropic_key` |
| Gemini | `kabehub_gemini_key` |
| OpenAI | `kabehub_openai_key` |
| Ideogram | `kabehub_ideogram_key` |
| OpenRouter | `kabehub_openrouter_key` |

### Mobile

| ファイル・関数／コンポーネント | 方向 | プロバイダー | Secure Storageキー | 用途 |
|---|---|---|---|---|
| `apps/mobile/lib/apiKeyStore.ts` / `mobileApiKeyStore` | 読取・保存・削除 | 5種すべて | `kabehub_apikey_{provider}` | `secureStorageAdapter`を通じてAndroid Keystore裏付けのSecure Storageへ保存する。未設定時の読取は`null`、ストレージ異常は呼び出し元へ伝播する |
| `apps/mobile/app/settings/page.tsx` / `MobileSettingsPage` | 読取・保存・削除 | 5種すべて | 上記5キー | `Promise.allSettled()`でproviderごとに独立して読み書きする。ユーザーが編集して`dirty`になったproviderだけを保存・削除対象にする |
| `apps/mobile/app/page.tsx` / `handleChatTest` | 読取・内部送信 | Anthropic | `kabehub_apikey_claude` | `buildApiKeyHeaders(mobileApiKeyStore, ["claude"])`でheaderを生成し、既存の`https://www.kabehub.com/api/chat`へ送信する |

MobileのSecure Storageプラグインは暗号文を`WSSecureStorageSharedPreferences.xml`へ保存し、暗号鍵をAndroid Keystoreで管理する。このSharedPreferencesはAndroid Auto Backupのcloud-backupとdevice-transferからファイル単位で除外する。Supabase認証セッションも同じSecure Storageに入るため、同時にバックアップ対象外となる。

Web/Mobileのどちらでも、BYOK APIキーをKabeHubのアプリケーションDBへ永続保存せず、アプリケーションログへ意図的に記録しない契約は共通である。

## 2. クライアントからKabeHubへの内部送信

| 送信元・関数 | 送信先 | 送信ヘッダー | 備考 |
|---|---|---|---|
| `apps/mobile/app/page.tsx` / `handleChatTest` | `https://www.kabehub.com/api/chat` | `x-anthropic-api-key` | signed-in時のClaude疎通確認。Secure Storageから読み、`buildApiKeyHeaders`が設定済みキーだけをheaderへ変換する |
| `app/page.tsx` / `getApiKeyHeaders`を使うchat送信・再生成・一時会話保存 | `/api/chat` | `x-anthropic-api-key`、`x-gemini-api-key`、`x-openai-api-key` | 設定済みの3キーを付与し、Routeが選択プロバイダーとLore用途に必要なキーを使用する |
| `app/arena/page.tsx` / `runOneTurn` | `/api/arena` | 上記3ヘッダー | 設定済みキーを付与し、現在の対戦者プロバイダーのキーだけを外部転送する |
| `app/page.tsx` / `handleExtractSettings` | `/api/extract-settings` | `x-anthropic-api-key` | 現行UIはAnthropicのみを送る。Route自体はGemini/OpenAIヘッダーも受信可能 |
| `app/image/page.tsx` / `handleGenerate` | `/api/image-gen` | 選択した1つの `x-gemini/openai/ideogram/openrouter-api-key` | 選択プロバイダーだけを送る |
| `app/page.tsx` / 画像生成ハンドラー | `/api/image-gen` | 5種のクライアント用ヘッダー | 設定済みキーを付与するが、Routeは選択プロバイダーの1キーだけを読む |
| `app/novel-check/page.tsx` / `handleStart` | `/api/novel-check` | `x-gemini-api-key` | 結果保存時の`/api/chat`メモ書込みにはAPIキーを送らない |
| `app/memory/page.tsx` / `MemoryCard.patchCard`（`update_text`のみ） | `/api/lore/[id]` | `x-openai-api-key` | メタデータ更新・pin・archive等にはキーを送らない |
| `app/memory/page.tsx` / 手動記憶追加 | `/api/lore` | `x-openai-api-key` | OpenAI embedding作成 |
| `app/memory/page.tsx`、`app/settings/page.tsx` / `handleBatchTrain` | `/api/lore/batch-train` | `x-openai-api-key` | OpenAI chat/embedding |
| `app/memory/page.tsx` / `handleDreamingBatch` | `/api/lore/dreaming-batch` | `x-openai-api-key` | OpenAI chat/embedding |
| `app/memory/page.tsx` / `handlePreviewMerge` | `/api/lore/consolidate/preview` | `x-openai-api-key` | OpenAI chat |
| `app/memory/page.tsx` / 統合確定ハンドラー | `/api/lore/consolidate/merge` | `x-openai-api-key` | OpenAI embedding |
| `components/MessageBubble.tsx` / `handleLike` | `/api/lore/like` | `x-openai-api-key` | OpenAI embedding |
| `components/NovelSettingsPane.tsx` / `handleEmbed` | `/api/lore/embed` | `x-openai-api-key` | OpenAI embedding |

クライアントからKabeHubへのカスタムヘッダー名は次の5種であり、名称は変更していない。

`x-anthropic-api-key` / `x-gemini-api-key` / `x-openai-api-key` / `x-ideogram-api-key` / `x-openrouter-api-key`

## 3. Route受信、外部転送、エラー処理、DBデータフロー

「DB書込み」欄の「キーなし」は、insert/update/upsert/RPC引数、会話本文、metadata、実行履歴のいずれにも受信キー、受信headers、送信用認証headersを渡していないことを示す。

| Route・関数 | 方向／プロバイダー | 外部送信方法 | DB書込み（キー） | ログ | 外部エラー本文 |
|---|---|---|---|---|---|
| `app/api/chat/route.ts` / `POST`、`streamClaude`、`streamGemini`、`streamOpenAI` | 受信・外部転送 / Anthropic、Gemini、OpenAI | Anthropic: `x-api-key`、Gemini: `x-goog-api-key`、OpenAI: `Authorization: Bearer` | `messages`等への書込みあり（キーなし）。Lore検索ではembeddingと検索条件だけをRPCへ渡す | キー・headers・キー入りURLなし。外部失敗はprovider/status/固定errorCodeのみ | 本文を読まず、プロバイダー名入り固定メッセージに変換。DBへ保存されうるエラー表示も固定文言 |
| `lib/github-tool-loop.ts` / `callAnthropicMessages`等（`/api/chat`内部） | 外部転送 / Anthropic | `x-api-key` | なし | 応答のstop reason等だけ。キー・認証headersなし | HTTP statusだけを含む固定warning |
| `app/api/arena/route.ts` / `POST`、`callClaude`、`callGemini`、`callOpenAI` | 受信・外部転送 / Anthropic、Gemini、OpenAI | Anthropic: `x-api-key`、Gemini: `x-goog-api-key`、OpenAI: `Authorization: Bearer` | `threads`・`messages`書込みあり（キーなし） | provider/status/固定errorCodeのみ | 本文を読まず固定メッセージ。キーを含まない固定エラー表示だけが会話本文になりうる |
| `app/api/extract-settings/route.ts` / `POST` | 受信・外部転送 / Anthropic、Gemini、OpenAI | 上記3方式 | `novel_settings.upsert`あり（抽出結果のみ、キーなし） | provider/status/固定errorCode。生本文・生成結果全文なし | 本文を読まず `{error, provider, status}` の固定メッセージ |
| `app/api/image-gen/route.ts` / `handleGemini`、`handleOpenAI`、`handleIdeogram`、`handleOpenRouter` | 受信・外部転送 / Gemini、OpenAI、Ideogram、OpenRouter | Gemini: `x-goog-api-key`、OpenAI/OpenRouter: `Authorization: Bearer`、Ideogram: `Api-Key` | `messages`・Storage書込みあり（prompt、画像、metadataのみ。キーなし） | provider/status/固定errorCodeのみ | `res.text()`を読まず `{error, provider, status}` の固定メッセージ |
| `app/api/novel-check/route.ts` / `POST` | 受信・外部転送 / Gemini | `x-goog-api-key` | なし | provider/status/固定errorCodeのみ | 本文を解析・転送せず、SSEへ固定メッセージ |
| `app/api/lore/route.ts` / `POST` | 受信・外部転送 / OpenAI | `lib/lore/openai.ts`から`Authorization: Bearer` | `lore_embeddings.insert`あり（本文・embedding・分類のみ、キーなし） | 共通helperがprovider/status/固定errorCodeのみ | 固定`OpenAI APIへのリクエストに失敗しました` |
| `app/api/lore/[id]/route.ts` / `PATCH`の`update_text` | 受信・外部転送 / OpenAI | 同上 | `lore_embeddings.update`あり（本文・embedding・分類のみ、キーなし） | 同上 | 同上 |
| `app/api/lore/embed/route.ts` / `POST` | 受信・外部転送 / OpenAI | 同上 | 既存Lore削除と`lore_embeddings.insert`あり（本文・embeddingのみ、キーなし） | provider/status/固定errorCodeのみ | `{error, provider, status}`の固定メッセージ |
| `app/api/lore/like/route.ts` / `POST` | 受信・外部転送 / OpenAI | 同上 | `lore_embeddings.insert`あり（既存message本文・embedding・由来metadataのみ、キーなし） | provider/status/固定errorCodeのみ | `{error, provider, status}`の固定メッセージ |
| `app/api/lore/batch-train/route.ts` + `lib/lore/batchTrain.ts` | 受信・外部転送 / OpenAI | Chat CompletionsとEmbeddingを`Authorization: Bearer`で送信 | `lore_embeddings.insert`、`messages.update`あり（キーなし） | 共通helperの安全なメタデータのみ | 共通helperの固定メッセージ |
| `app/api/lore/dreaming-batch/route.ts` + `lib/lore/dreaming.ts` | 受信・外部転送 / OpenAI | 同上 | Lore insert/updateと統合RPCあり。RPC引数はuser ID、Lore ID、本文、embedding、分類値のみ（キーなし） | 同上 | 結果内の失敗理由も固定メッセージ |
| `app/api/lore/consolidate/preview/route.ts` / `POST` | 受信・外部転送 / OpenAI | Chat Completionsの`Authorization: Bearer` | なし | 同上 | 固定メッセージ |
| `app/api/lore/consolidate/merge/route.ts` / `POST` | 受信・外部転送 / OpenAI | Embeddingの`Authorization: Bearer` | Lore insert/updateあり（統合本文・embedding・分類のみ、キーなし） | 同上 | 固定メッセージ |
| `lib/lore/openai.ts` / `createEmbedding`、`chatCompleteMini` | 外部転送 / OpenAI | `Authorization: Bearer` | なし | provider/status/固定errorCodeのみ | 外部本文を読まず`AiProviderRequestError`の固定文言へ変換 |

Geminiの外部転送にはURLクエリ`?key=...`を使わない。`chat`、`novel-check`、`extract-settings`、`arena`、`image-gen`の全Gemini呼び出しを`x-goog-api-key`に統一した。

## 4. DB非保存の確認

`docs/schema.sql`を`anthropic`、`gemini`、`openai`、`ideogram`、`openrouter`、`api_key`、`apiKey`で検索し、AIプロバイダーAPIキー専用のカラム・テーブルが存在しないことを確認した。

受信Routeとその下位関数について、次を確認した。

- `insert` / `update` / `upsert`のオブジェクトに`apiKey`、各provider key、`keys`、受信`headers`、送信用認証headersを含めていない。
- Lore統合・検索RPCに渡すのはuser ID、Lore ID、検索embedding、本文、分類値、limit/threshold等だけである。
- 会話本文へ入る可能性がある`chat`・`arena`の外部エラーは固定文言へ変換済みであり、外部本文・認証情報・キー入りURLは入らない。
- `image-gen`の`messages.metadata`はStorage path、MIME type、画像属性だけであり、APIキーを含まない。

## 5. ログの静的条件と運用確認

コード上、受信APIキー変数、`req.headers` / `request.headers`、送信用認証headers全体、APIキー入りURLを意図的にログ出力する経路はない。外部AI API失敗時のサーバーログはprovider、HTTP status（取得できる場合）、固定errorCode、必要な場合だけ例外型名に限定する。

これは静的コード確認であり、本番ログに過去または実行時のキーが存在しないことまで証明するものではない。デプロイ後にRui氏が次を実施・記録する。

1. テスト環境で5プロバイダーを各1回実行する。
2. VercelログをAPIキー全体、および既知の先頭・末尾断片で検索する。
3. GeminiキーがURLクエリに現れないことを確認する。

2026-07-25の実装環境にはAIプロバイダーのテスト用環境変数および利用可能なサインイン済みブラウザセッションがなかった。このため、`/api/arena`と`/api/image-gen`のGemini実API疎通は未実施であり、デプロイ後確認へ引き継ぐ。両RouteのURL、`x-goog-api-key`ヘッダー、成功時レスポンス解析は静的確認済みである。

## 6. 残存リスク

WebではAPIキーがLocalStorageに平文保存される。現在CSPはReport-Only運用中であり、同一オリジンでXSSが成立した場合に生キーを読み取られうるリスクは残る。Webの保存方式変更とCSP Enforce切替は本対応のスコープ外であり、H-21のリスク受容および将来チケットH-21Cとして管理する。

MobileではAndroid Keystore裏付けのSecure Storageを使うが、複数端末間の暗号化同期やサーバー側KMS/Vault連携は行わない。これは将来チケットH-21Cの対象である。
