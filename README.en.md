# KabeHub

An open platform to save, share, and fork your AI brainstorming logs.

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?logo=vercel)](https://kabehub.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

🌐 **Live**: https://kabehub.com | 🇯🇵 [日本語版 README](README.md)

---

## ⚠️ Alpha Disclaimer

KabeHub is currently an alpha prototype for concept validation.
There is a non-zero risk of data loss or unintended exposure of private logs due to breaking schema changes, RLS misconfiguration, or other unexpected bugs.

**Please do not enter:**
* Confidential business information
* Personal information or passwords
* Anything you would not want made public

Only use data you would be comfortable with the world seeing.

---

## Why I Built This

The name "KabeHub" comes from the Japanese word "Kabe-uchi" (hitting a tennis ball against a wall). In Japanese business culture, it means bouncing raw ideas off someone to clarify your thinking—very similar to the concept of "Rubber Ducking" in software engineering, but for general brainstorming.

Modern social platforms are over-optimized for attention and monetization, leaving little room for sharing raw thought processes. I wanted to bring back the culture of "craftsmen" — people who create something purely for the joy of it, and somehow it resonates with others anyway.

At the same time, I kept running into a personal frustration: my AI conversation logs just disappeared. No export, no drafts, no way to keep what I built with the AI.

I complained about this to Gemini, and it told me to just build it. So I did.

KabeHub's hidden motto is: **"What's yours is yours."** Your thinking process, your data — it belongs to you. Save it, and share it with the world if you want.

### About This Project

I'm not an engineer by trade — I'm a tax accountant. I started from nearly zero programming experience and had a working prototype within about two weeks. This product was built together with Claude and Gemini. "Using AI to build a tool for saving AI conversations" — that's not intentional irony, it's just what happens when a non-engineer tries to build something.

---

## Features

> **Note:** The KabeHub UI is currently available only in Japanese, but you can converse with the AIs in any language.

|Feature|Description|
|-|-|
|🤖 **Multi-AI Chat**|Switch between Claude / Gemini / ChatGPT in a single UI. Share conversation history across multiple AIs in the same thread|
|💾 **Persistent Storage**|Save conversations permanently. Organize with folders and tags|
|🔗 **Share & Fork**|Share threads via read-only URL. Others can fork your thinking and continue from where you left off|
|📤 **Export**|Export as TXT / Markdown (YAML + Obsidian callout) / CSV. Bulk ZIP export also available|
|📝 **Memo Mode**|Add personal notes to the timeline without sending them to the AI|
|⚔️ **AI Arena**|Pit multiple AIs against each other. Supports 3-way battles, human intervention, spectator URLs, and time travel|
|🌐 **Explore**|Browse, search, and fork public threads from other users|
|🎭 **Roleplay Mode**|Give your AI a custom name and icon. Chat in a LINE-style UI (private only)|
|📁 **Project Mode**|Set a default system prompt per folder|
|🖼️ **Image Upload**|Attach PNG / JPEG / GIF / WebP images (Claude, Gemini, and ChatGPT supported)|
|⚡ **Streaming**|AI responses appear in real time. Press Esc to cancel at any time|
|🔒 **Self-Hostable**|Run with your own API keys. Your data stays in your own Supabase instance|

---

## Screenshots

![Animation](https://github.com/user-attachments/assets/e9b2a9ea-d85d-429d-9df2-0d1c8545b388)
<img width="1081" height="663" alt="Chat example" src="https://github.com/user-attachments/assets/75e9866d-6de4-4b4f-b423-42b3478348cb" />
<img width="888" height="581" alt="Explore screen" src="https://github.com/user-attachments/assets/4c573f0f-ed44-419d-8a43-b6227703468d" />

---

## Tech Stack

|Layer|Technology|
|-|-|
|Frontend|Next.js 14 (App Router) + React + Tailwind CSS|
|Database|Supabase (PostgreSQL) + RLS|
|Auth|Supabase Auth (Google OAuth)|
|AI (Primary)|Anthropic Claude API (claude-sonnet-4-5 / claude-sonnet-4-6)|
|AI (Secondary)|Google Gemini API (gemini-2.5-flash / gemini-2.5-pro)|
|AI (Tertiary)|OpenAI API (gpt-4o / gpt-5.4-mini / gpt-5.4 / gpt-5.5)|
|Deploy|Vercel|

---

## Self-Hosting

### Requirements

* Node.js 18+
* Supabase account (free tier works)
* API keys for Anthropic / Google / OpenAI (only the ones you want to use)

### Steps

```bash
# 1. Clone the repository
git clone [https://github.com/kabehub/kabehub-prototype.git](https://github.com/kabehub/kabehub-prototype.git)
cd kabehub-prototype

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.local.example .env.local
# Fill in your Supabase URL and Anon Key in .env.local

# 4. Start the development server
npm run dev
# → http://localhost:3000

### Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=[https://your-project.supabase.co](https://your-project.supabase.co)
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

> AI API keys are entered through the in-browser settings UI. They are not stored on the server.

### Supabase Setup

See [`docs/schema.sql`](docs/schema.sql) for the full SQL schema.

---

## Roadmap

* [x] Multi-AI chat (Claude / Gemini / ChatGPT)
* [x] Share & fork
* [x] Explore (public thread feed, tag search, genre filter, sort, trending)
* [x] AI Arena (3-way battles, human intervention, spectator URLs, time travel)
* [x] Genre classification, likes, trending
* [x] Message privacy & partial masking (`[[text]]` → ████)
* [x] Account deletion & report feature
* [x] Profile page (bio, stats)
* [x] Streaming responses & Esc cancel
* [x] Roleplay mode (LINE-style UI, private only)
* [x] Project mode (folder-level system prompts)
* [x] Image upload (PNG / JPEG / GIF / WebP)
* [x] Prompt Caching (Claude)
* [ ] Branching Mode
* [ ] Monetization (managed plan, credit system)
* [ ] `khub` CLI

---

## Contributing

This is a personal project, but contributions are welcome.

* Bug reports & feature requests → [Issues](https://github.com/kabehub/kabehub-prototype/issues)
* Code changes → Please open an Issue to discuss before submitting a pull request

I'm not a professional engineer, so I may ask some basic questions — apologies in advance!

Areas where I'd especially love help from experienced engineers:

* Full-text search using `pg_bigm`
* UI design for threaded conversation trees (Branching Mode)
* Security improvements and general code quality

This project is far from finished. Any help or ideas are very much appreciated.

---

## License

[MIT](LICENSE)

---

## Author

**Rui Matsumoto**

* GitHub: [@RuiMatsumoto95](https://github.com/RuiMatsumoto95)
* Product: [KabeHub](https://kabehub.com)
