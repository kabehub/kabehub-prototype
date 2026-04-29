# KabeHub（カベハブ）

🌐 [English README](README.en.md)

AIとの壁打ちログを永続保存し、公開・引継ぎできるオープンプラットフォーム。

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?logo=vercel)](https://kabehub.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

🌐 **本番URL**: https://kabehub.com

---

## ⚠️ 免責事項（アルファ版について）

KabeHubは現在、コンセプト検証のためのアルファ版（プロトタイプ）です。
データベースの破壊的変更、RLS（Row Level Security）の調整ミス、その他予期せぬバグにより、入力データが消失したり、プライベートな壁打ちログが意図せずパブリックに露出してしまうリスクがゼロではありません。

* 業務上の機密情報
* 個人情報・パスワード類
* 炎上リスクのある過激な発言

これらは**絶対に入力しないでください。**
「最悪、世界に公開されても笑って済まされるデータ」のみでのご利用をお願いいたします。

---

## なぜ作ったか

現代のSNSやプラットフォームは「いかに注目を集め、収益化するか」に最適化されすぎていて、純粋な「思考のプロセス」をそのまま残し、共有する場所が失われていると感じていました。昔のニコニコ動画や2ちゃんねるにあった、プロ顔負けなのに対価を求めない「職人」の文化——自己満足で作ったものが、気づけば誰かの心に刺さっている——そういう場所がまた生まれたらいいなあという気持ちはありました。

そんな問題意識を持ちながら、自分自身がAIとの壁打ちをよく使うようになって、別の不満にもぶつかりました。

会話ログが手元に残らない。エクスポートもできない。下書き保存もできない。

面白い発想が生まれても、どこかに消えていく。それがずっとイライラしていて、そのことをGeminiさんに相談したら「じゃあ作れ」と言われたので作りました。

KabeHubの裏コンセプトは「おまえのものはおまえのもの」です。某国民的アニメの名言の逆です。あなたのデータは、あなたのものです。AIとの思考のプロセスを自分の手元に残して、もし良ければ世界に放り投げられる——そういう場所を目指しています。

### このプロジェクトについて

本業は非エンジニア（税理士）です。プログラミングはほぼ未経験からスタートし、構想から約2週間でとりあえず動くものを作りました。このプロダクトはClaudeさんとGeminiさんと一緒に作っています。「AIで思考を残すツールを、AIと一緒に作った」というのは、まあ偶然です（というか私が素人だから当たり前）、そこに意味はないです。

---

## 何ができるか

|機能|説明|
|-|-|
|🤖 **マルチAI壁打ち**|Claude / Gemini / ChatGPT を1つのUIで切り替え。同じスレッドで複数AIの履歴を共有できます|
|💾 **永続保存**|会話を永続保存。フォルダ・タグで整理できます|
|🔗 **公開・引継ぎ**|壁打ちをリードオンリーURLで共有。他の人の思考を引き継いで続けることもできます|
|📤 **エクスポート**|TXT / Markdown（YAML+Obsidianコールアウト）/ CSV 形式で出力。ZIP一括エクスポートも可|
|📝 **メモモード**|AIを挟まずに自分用メモをタイムラインに記録。AIには送信されません|
|⚔️ **AI闘技場**|複数のAIを対戦させてバトル。三つ巴・人間乱入・観戦URL・タイムトラベルに対応|
|🌐 **explore**|他のユーザーの公開壁打ちを検索・閲覧・引継ぎできます|
|🎭 **なりきりモード**|AIにキャラ名とアイコンを設定。LINEライクなUIで会話できます（非公開専用）|
|📁 **プロジェクト機能**|フォルダ単位でデフォルトのシステムプロンプトを設定できます|
|🖼️ **画像アップロード**|PNG / JPEG / GIF / WebP を添付して送信できます（Claude・Gemini対応）|
|⚡ **ストリーミング**|AIの回答をリアルタイムで逐次表示。Escキーでいつでも中断できます|
|🔒 **セルフホスト**|自分のAPIキーで動かします。データはあなた自身のSupabaseに入ります|

---

## スクリーンショット

![Animation](https://github.com/user-attachments/assets/e9b2a9ea-d85d-429d-9df2-0d1c8545b388)
<img width="1081" height="663" alt="会話例" src="https://github.com/user-attachments/assets/75e9866d-6de4-4b4f-b423-42b3478348cb" />
<img width="888" height="581" alt="explore画面例" src="https://github.com/user-attachments/assets/4c573f0f-ed44-419d-8a43-b6227703468d" />

---

## Tech Stack

|レイヤー|技術|
|-|-|
|フロントエンド|Next.js 14 (App Router) + React + Tailwind CSS|
|データベース|Supabase (PostgreSQL) + RLS|
|認証|Supabase Auth（Google OAuth）|
|AI (メイン)|Anthropic Claude API（claude-sonnet-4-5 / claude-sonnet-4-6）|
|AI (サブ1)|Google Gemini API（gemini-2.5-flash / gemini-2.5-pro）|
|AI (サブ2)|OpenAI API（gpt-4o）|
|デプロイ|Vercel|

※対応AIの種類・モデルは今後増やす予定です。

---

## セルフホストする方法

### 必要なもの

* Node.js 18+
* Supabaseアカウント（無料でOK）
* Anthropic / Google / OpenAI のAPIキー（使いたいものだけでOK）

### 手順

```bash
# 1. リポジトリをクローン
git clone https://github.com/kabehub/kabehub-prototype.git
cd kabehub-prototype

# 2. 依存パッケージをインストール
npm install

# 3. 環境変数を設定
cp .env.local.example .env.local
# .env.local にSupabaseのURLとAnon Keyを記入

# 4. 開発サーバーを起動
npm run dev
# → http://localhost:3000
```

### 環境変数

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

> AIのAPIキーはブラウザのUI（設定画面）から入力します。サーバーには保存されません。

### Supabaseのセットアップ

詳細なSQLは [`docs/schema.sql`](docs/schema.sql) を参照してください。

---

## ロードマップ

* [x] マルチAI壁打ち（Claude / Gemini / ChatGPT）
* [x] 公開・引継ぎ機能
* [x] explore（公開スレッド一覧・タグ検索・ジャンル・ソート・トレンド）
* [x] AI闘技場（三つ巴・人間乱入・観戦・タイムトラベル）
* [x] ジャンル分類・いいね・トレンド
* [x] メッセージ非公開・部分マスク（`[[text]]`→████）
* [x] アカウント削除・通報機能
* [x] プロフィールページ（bio・統計情報）
* [x] ストリーミング対応・Escキャンセル
* [x] なりきりモード（LINEライクUI・非公開専用）
* [x] プロジェクト機能（フォルダ単位システムプロンプト）
* [x] 画像アップロード（PNG / JPEG / GIF / WebP）
* [x] Prompt Caching対応（Claude）
* [ ] Branching Mode
* [ ] マネタイズ（おまかせプラン・クレジット制）
* [ ] `khub` CLI

---

## コントリビューション

個人開発のプロジェクトですが、コントリビューションは歓迎です。

* バグ報告・機能要望 → [Issues](https://github.com/kabehub/kabehub-prototype/issues)
* コードの変更 → Issueで相談してからプルリクエストを送ってください

※Issueしてくださった方には素人の知識不足の質問してしまうかもしれません、申し訳ないです。

特に以下の領域について、つよつよエンジニアさんのお知恵を求めています！

* 検索の `pg_bigm` を使った Full-Text Search 化
* 会話ログのツリー構造化（Branching Mode）のUI設計
* その他もろもろセキュリティ面や機能追加など

完成形には程遠いので、皆様の知恵とお力をいただけると大変ありがたいです。

---

## ライセンス

[MIT](LICENSE)

---

## 作者

**Rui Matsumoto**

* GitHub: [@RuiMatsumoto95](https://github.com/RuiMatsumoto95)
* プロダクト: [KabeHub](https://kabehub.com)
