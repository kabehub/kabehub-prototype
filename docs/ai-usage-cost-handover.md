# AI利用コスト計測基盤 引き継ぎ

最終確認日: 2026-08-15

## 別課題

- Arena: Claude / Gemini / OpenAI のいずれも現状は実token usageを保存していない。`ai_usage_events`への記録は、Arenaの各非ストリーミングprovider応答からusageを新規収集する別課題として扱う。
- Managed Plan（Phase 4）: `ai_usage_events`をクレジット消費の正本候補として利用できるが、残高・予約・確定・返却を含む消費ロジックは本対応に含めない。

## 実API確認の状態

- GPT Image 2: OpenAI公式のモデル・画像生成ページでは料金を再確認したが、`/v1/images/generations`レスポンス内のusage modalityフィールド名は一次情報で確定できなかった。実APIキーもローカル環境に無いため、実レスポンス確認は未実施。実装は `prompt_tokens_details` / `completion_tokens_details` と `input_tokens_details` / `output_tokens_details` の両方を認識し、必要な内訳が無い場合は `cost_source = 'unavailable'` とする。
- OpenRouter Flux 2 Pro: OpenRouter公式Usage Accountingは全レスポンスに`usage.cost`が含まれる仕様を明記している。ローカル環境にOpenRouter APIキーが無いため、対象モデルの実呼び出し確認は未実施。`usage.cost`が無い実レスポンスでは `cost_source = 'unavailable'` とする。
- Ideogram V3: 公式API Pricingで3.0 Turboが1枚US $0.03のままであることを再確認済み。

## DB・実機確認

この作業環境にはPostgres接続情報、Supabase Management API、利用可能なログイン済みブラウザが無いため、test / productionへのmigration適用とログイン必須の実機確認は未実施。

適用対象は `docs/migration_v181_ai_usage_events.sql`。ファイル内のpreflight → migration本体 → postflightの順で、test環境で確認後にproductionへ適用する。適用・canonical schema反映後は既存運用どおり `docs/applied/` へ移動する。

test環境では次を確認する。

1. standalone `/image`生成後、`thread_id is null`かつ`request_type = 'image_gen'`の行がある。
2. Novel Check後、`request_type = 'novel_check'`の行がある。
3. temporary chat後、`thread_id is null`かつ`request_type = 'chat'`の行がある。
4. Statsで上記3経路の件数・token・priced/unpriced・推定コストが反映される。
5. GPT Image 2とFlux 2 Proの実レスポンスを安全な開発ログで一度だけ確認し、usage parser fixtureを確定する。prompt・画像base64・APIキーはログに残さない。

## ローカル検証の既存ブロッカー

- `npx tsc --noEmit`と`npm run build`は、作業開始前から未追跡だったルート直下の`temp_check.tsx`が存在しない相対moduleを6件importしているため、TypeScript段階で停止する。`temp_check.tsx`だけを除いた一時tsconfigでは型検査成功、`npm run build`もWebpackコンパイルまでは成功済み。ユーザー作業物のため削除・変更していない。
- `scripts/*.test.cjs`は33本中32本成功。作業開始前から存在する`scripts/lore.test.cjs`のみ、テスト変換がroute内に存在しない`normalizeTags`をexportしようとして`ReferenceError`になる。今回の変更対象外のため修正していない。
- 検証で更新された`tsconfig.tsbuildinfo`はリポジトリ版へ復元済み。作業開始前から変更・未追跡だった監査文書、`next-env.d.ts`、`tsconfig.json`、`app/test-login/`、`temp_*`は今回の差分に含めていない。
