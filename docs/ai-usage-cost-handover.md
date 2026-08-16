# AI利用コスト計測基盤 引き継ぎ

最終確認日: 2026-08-16

## 別課題

- Managed Plan（Phase 4）: `ai_usage_events`をクレジット消費の正本候補として利用できるが、残高・予約・確定・返却を含む消費ロジックは本対応に含めない。

## v182 Arena usage収集（完了）

- `app/api/arena/route.ts`のClaude / Gemini / OpenAI（Chat Completions・Responses API）応答から実token usageを収集し、v181の`calculateTextUsageCost()` / `recordUsageEvent()`を再利用して`request_type = 'arena'`で記録するようにした。
- provider呼び出し直前にusage event IDと`priced_at`を固定し、実際に解決されたmodel IDを記録する。provider成功時だけ記録し、assistant message INSERT失敗時もusage記録をスキップせず`message_id = null`とする。
- `serviceRoleClient()`の評価を含むusage記録全体をbest-effort化し、失敗時もArenaの200レスポンスと`saved`真偽を変えない。
- `scripts/arena-usage.test.cjs`を追加し、provider別usage fixture、assistant保存成功・失敗、provider失敗、service-role client例外の10ケースを確認済み。
- 2026-08-16にtest環境でClaude Haiku 4.5を実呼び出しし、正常系で`input_tokens = 356` / `output_tokens = 102`かつassistant message ID一致、assistant INSERT失敗系で`message_id = null`かつ`input_tokens = 346` / `output_tokens = 76`を確認した。APIキーなしのcatch系ではusage件数が増えないことも確認済み。検証用の一時ユーザーと紐づく行は確認後に削除した。

## 実API確認の状態

- GPT Image 2: OpenAI公式のモデル・画像生成ページでは料金を再確認したが、`/v1/images/generations`レスポンス内のusage modalityフィールド名は一次情報で確定できなかった。実APIキーもローカル環境に無いため、実レスポンス確認は未実施。実装は `prompt_tokens_details` / `completion_tokens_details` と `input_tokens_details` / `output_tokens_details` の両方を認識し、必要な内訳が無い場合は `cost_source = 'unavailable'` とする。
- OpenRouter Flux 2 Pro: OpenRouter公式Usage Accountingは全レスポンスに`usage.cost`が含まれる仕様を明記している。ローカル環境にOpenRouter APIキーが無いため、対象モデルの実呼び出し確認は未実施。`usage.cost`が無い実レスポンスでは `cost_source = 'unavailable'` とする。
- Ideogram V3: 公式API Pricingで3.0 Turboが1枚US $0.03のままであることを再確認済み。

## DB・実機確認

v181 migrationはtest / productionへ適用済みで、`docs/schema.sql`への反映と`docs/applied/migration_v181_ai_usage_events.sql`への移動も完了している。Arenaの実機確認結果は上記「v182 Arena usage収集（完了）」を参照。

test環境では次を確認する。

1. standalone `/image`生成後、`thread_id is null`かつ`request_type = 'image_gen'`の行がある。
2. Novel Check後、`request_type = 'novel_check'`の行がある。
3. temporary chat後、`thread_id is null`かつ`request_type = 'chat'`の行がある。
4. Statsで上記3経路の件数・token・priced/unpriced・推定コストが反映される。
5. GPT Image 2とFlux 2 Proの実レスポンスを安全な開発ログで一度だけ確認し、usage parser fixtureを確定する。prompt・画像base64・APIキーはログに残さない。

## ローカル検証の既存ブロッカー

- `npx tsc --noEmit`は成功済み。
- `scripts/*.test.cjs`は35本中34本成功。既存の`scripts/lore.test.cjs`のみ、テスト変換がroute内に存在しない`normalizeTags`をexportしようとして`ReferenceError`になる。今回の変更対象外のため修正していない。
