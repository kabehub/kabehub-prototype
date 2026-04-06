# KabeHub（カベハブ）

AIとの壁打ちログを、残す。共有する。引き継ぐ。

[!\[Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[!\[Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)
[!\[Vercel](https://img.shields.io/badge/Deployed-Vercel-black?logo=vercel)](https://kabehub-prototype-6lud.vercel.app)
[!\[License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

🔗 **デモ**: https://kabehub-prototype-6lud.vercel.app

\---

## なぜ作ったか

現代のSNSやプラットフォームは「いかに注目を集め、収益化するか」に最適化されすぎていて、純粋な「思考のプロセス」をそのまま残し、共有する場所が失われていると感じていました。昔のニコニコ動画や2ちゃんねるにあった、プロ顔負けなのに対価を求めない「職人」の文化——自己満足で作ったものが、気づけば誰かの心に刺さっている——そういう場所を取り戻したかった。

そんな問題意識を持ちながら、自分自身がAIとの壁打ちをよく使うようになって、別の不満にもぶつかりました。

**会話ログが手元に残らない。エクスポートもできない。下書き保存もできない。**

面白い発想が生まれても、どこかに消えていく。それがずっとイライラしていて、「じゃあ作ろう」となりました。

KabeHubの裏コンセプトは「おまえのものはおまえのもの」です。某国民的アニメの名言の逆です。あなたのデータは、あなたのものです。AIとの思考のプロセスを自分の手元に残して、もし良ければ世界に放り投げられる——そういう場所を目指しています。

### このプロジェクトについて

本業は非エンジニア（税理士）です。プログラミングはほぼ未経験からスタートし、構想から約1ヶ月でここまで作りました。このプロダクトはClaudeさんとGeminiさんと一緒に作っています。「AIで思考を残すツールを、AIと一緒に作った」というのは、偶然ではなくこのプロジェクトの本質だと思っています。

\---

## 何ができるか

|機能|説明|
|-|-|
|🤖 **マルチAI壁打ち**|Claude / Gemini / ChatGPT を1つのUIで切り替え。同じスレッドで複数AIの履歴を共有できます|
|💾 **永続保存**|会話を自動保存。フォルダ・タグで整理できます|
|🌍 **公開・フォーク**|壁打ちをリードオンリーURLで共有。他の人の思考を引き継いで続けることもできます|
|📤 **エクスポート**|TXT / Markdown（YAML+Obsidianコールアウト）/ CSV 形式で出力できます|
|📝 **メモモード**|AIを呼ばず、思考メモをタイムラインに記録できます|
|⚔️ **AI闘技場**|複数のAIを対話させてバトル。三つ巴・人間乱入・観戦URLシェアに対応しています|
|🔍 **explore**|他のユーザーの公開壁打ちを検索・閲覧・フォークできます|
|🔑 **セルフプラン**|自分のAPIキーで動かします。データはあなた自身のSupabaseに入ります|

\---

## スクリーンショット

> \*(追加予定)\*

\---

## Tech Stack

|レイヤー|技術|
|-|-|
|フロントエンド|Next.js 14 (App Router) + React + Tailwind CSS|
|データベース|Supabase (PostgreSQL) + RLS|
|認証|Supabase Auth（Google OAuth）|
|AI|Anthropic Claude / Google Gemini / OpenAI GPT-4o|
|デプロイ|Vercel|

\---

## セルフホストする場合

### 必要なもの

* Node.js 18+
* Supabaseアカウント（無料枠でOK）
* Anthropic / Google / OpenAI のAPIキー（使いたいものだけでOK）

### 手順

```bash
# 1. リポジトリをクローン
git clone https://github.com/RuiMatsumoto95/kabehub-prototype.git
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
NEXT\_PUBLIC\_SUPABASE\_URL=https://your-project.supabase.co
NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY=your-anon-key
```

> AIのAPIキーはブラウザのUI（設定ドロワー）から入力します。サーバーには保存されません。

### Supabaseのセットアップ

詳細なSQLは [`docs/schema.sql`](docs/schema.sql) を参照してください。

\---

## ロードマップ

* \[x] マルチAI壁打ち（Claude / Gemini / ChatGPT）
* \[x] 公開・フォーク機能
* \[x] explore（公開スレッド一覧）
* \[x] AI闘技場（三つ巴・人間乱入・観戦）
* \[ ] ジャンル分類（explore絞り込み）
* \[ ] いいね・評価機能
* \[ ] 公開プロフィールページ（`/@handle`）
* \[ ] Branching Mode
* \[ ] `khub` CLI

\---

## コントリビューション

個人開発のプロジェクトですが、コントリビューションは歓迎です。

* バグ報告・機能提案 → [Issues](https://github.com/RuiMatsumoto95/kabehub-prototype/issues)
* コードの変更 → Issueで相談してからPRを送ってください

特に以下の課題について、つよつよエンジニアさんのお力添えをお待ちしています！

* 検索の `pg\_bigm` を用いた Full-Text Search 化
* 会話ログのツリー構造化（Branching Mode）のUI設計

まだ荒削りなところが多いですが、育てていくものだと思っています。

\---

## ライセンス

[MIT](LICENSE)

\---

## 作者

**Rui Matsumoto**

* GitHub: [@RuiMatsumoto95](https://github.com/RuiMatsumoto95)
* プロダクト: [KabeHub](https://kabehub-prototype-6lud.vercel.app)

