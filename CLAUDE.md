
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Code Official Documentation

When working on Claude Code features (hooks, skills, subagents, MCP servers, etc.), use the `claude-docs-consultant` skill to selectively fetch official documentation from docs.claude.com.

## Project Overview

**download-media-bot** is a Cloudflare Worker — a Telegram bot for downloading media from 9 platforms. Send a URL, get the media back.

Any user can send a URL for auto-download. The admin gets extra controls: quality pickers for YouTube/TikTok/Facebook.

No RSS. No channel subscriptions. No cron jobs. Download only.

## Commands

* `npm run dev` — Start local dev server (port 8787)
* `npm run deploy` — Deploy to Cloudflare Workers
* `npm run cf-typegen` — Regenerate worker-configuration.d.ts from wrangler.jsonc
* `npx wrangler secret put TELEGRAM_BOT_TOKEN` — Set bot token
* `npx wrangler secret put TELEGRAM_WEBHOOK_SECRET` — Set webhook secret

## Architecture

```
src/
├── index.ts                  # Hono app: GET /health, GET /setup, POST /telegram
├── constants.ts              # CACHE_PREFIX_TELEGRAM_STATE only
├── routes/
│   └── setup.ts              # GET /setup — registers bot commands + menu button via Telegram API
├── types/
│   └── telegram.ts           # AdminState (downloading_media), TelegramMediaMessage, FormatSettings
├── services/
│   ├── media-downloader.ts   # btch API wrapper (4 servers, failover), 9 platforms
│   └── telegram-bot/
│       ├── bot-factory.ts    # Bot creation, admin middleware, handler registration
│       ├── commands/
│       │   └── info-commands.ts      # /start, /help, /cancel
│       ├── callbacks/
│       │   └── download-callbacks.ts # dl:video, dl:audio, dl:hd, dl:sd, dl:yt:*, dl:confirm
│       ├── handlers/
│       │   ├── text-input-handler.ts # URL detection → platform pickers → auto-download (admin+guest)
│       │   ├── download-and-send.ts  # Core download + Telegram send logic
│       │   └── send-media.ts         # URL-first send strategy, >50MB handling
│       └── storage/
│           └── admin-state.ts        # KV state for multi-step download flows
└── utils/
    ├── url-detector.ts       # Platform URL detection (9 platforms)
    └── cache.ts              # KV get/set helpers
```

## Conventions

* TypeScript strict mode
* Hono framework for routing
* KV binding: `DOWNLOAD_CACHE` (separate from other projects)
* Env type from worker-configuration.d.ts (run `npm run cf-typegen` after changing wrangler.jsonc)
* No cheerio, no RSS XML, no Instagram auth cookies


## Deployment

* **Worker name:** `download-media-bot`
* **URL:** `https://download-media-bot.engdawood.workers.dev`
* **Webhook:** `POST /telegram` (verified via `X-Telegram-Bot-Api-Secret-Token`)
* **KV namespace:** `DOWNLOAD_CACHE` (id: `6769aec205aa4557ab05757c559c9618`)

## Environment

### Secrets (wrangler secret put)

* `TELEGRAM_BOT_TOKEN` — bot token from BotFather
* `TELEGRAM_WEBHOOK_SECRET` — random hex, must match setWebhook `secret_token` param

### Vars (wrangler.jsonc)

* `ADMIN_TELEGRAM_ID` — Telegram user ID allowed to use the bot

### Local dev (.dev.vars)

* `TELEGRAM_BOT_TOKEN`
* `ADMIN_TELEGRAM_ID`

## Bot behaviour

**Supported platforms:** TikTok, Instagram, X/Twitter, YouTube, Facebook, Threads, SoundCloud, Spotify, Pinterest

**Platform-specific UX:**
* **YouTube** — fetches quality list, shows picker (up to 4 + Audio button)
* **TikTok** — slideshows auto-download; videos show Video/Audio picker
* **Facebook** — shows HD/SD picker if multiple qualities available
* **SoundCloud / Spotify** — audio auto-download
* **All others** — auto-download best quality

**Guest mode:** Non-admin users can send supported URLs and receive auto-downloads (no quality pickers, no KV state). SoundCloud/Spotify force `audio` mode; all others use `auto`. Pickers (YouTube, TikTok, Facebook) are admin-only.

**Media send strategy (URL-first):** `send-media.ts` tries Telegram URL pass-through first. If rejected, interactive mode shows `[📥 Download] [❌ Cancel] [📤 Send to @urluploadxbot]`. Files >50MB show URL + @urluploadxbot button. `TelegramUrlFetchError` triggers fallback; `directMediaUrl` stored in KV for `dl:confirm` callback.

**Admin state:** Stored in `DOWNLOAD_CACHE` under key `telegram:state:{userId}` (TTL 1h). Only action is `downloading_media`.

## Data flow

1. User sends URL → `text-input-handler.ts` detects platform
2. YouTube/TikTok/Facebook → show quality picker, store state in KV
3. Other platforms → call `downloadAndSendMedia` directly
4. Callback (`dl:*`) → read state from KV → download → send to chat
