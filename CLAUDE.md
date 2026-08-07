
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Code Official Documentation

When working on Claude Code features (hooks, skills, subagents, MCP servers, etc.), use the `claude-docs-consultant` skill to selectively fetch official documentation from docs.claude.com.

## Project Overview

**download-media-bot** is a Cloudflare Worker — a Telegram bot for downloading media from 9 platforms. Send a URL, get the media back.

Any user can send a URL for auto-download. The admin gets extra controls: quality pickers for YouTube/TikTok/Facebook.

No channel subscriptions. No cron jobs. Download only. Instagram Stories use public RSSHub instances (picnob.info bridge) as the primary source.

## Commands

* `pnpm dev` — Start local dev server (port 8787)
* `pnpm deploy` — Deploy to Cloudflare Workers
* `pnpm cf-typegen` — Regenerate worker-configuration.d.ts from wrangler.jsonc
* `pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN` — Set bot token
* `pnpm exec wrangler secret put TELEGRAM_WEBHOOK_SECRET` — Set webhook secret

## Architecture

```
src/
├── index.ts                        # Hono app: GET /health, GET /setup, POST /telegram
├── constants.ts                    # Shared constants: KV prefixes, RSSHUB_SERVERS, KV_KEY_INSTAGRAM_FOOTER
├── routes/
│   └── setup.ts                    # GET /setup — registers bot commands + menu button via Telegram API
├── types/
│   ├── telegram.ts                 # AdminState, TelegramMediaMessage, FormatSettings
│   ├── downloader.ts               # MediaItem, DownloaderResult, DownloaderMode (shared types)
│   └── downloader-provider.ts      # IDownloaderProvider interface
├── services/
│   ├── media-downloader.ts         # Entry point only (~110 lines): registry wiring, downloadMedia, fetchTikTokInfo, fetchFacebookInfo
│   ├── downloader/
│   │   ├── btch-client.ts          # btchFetch (4-server failover) + isBtchLimitError
│   │   ├── aio-parser.ts           # tryAIO, parseAioGallery, parseLinksSection
│   │   ├── media-helpers.ts        # isUrl, detectMediaType, detectTypeFromJwtUrl, buildCaption, formatFileSize, decodeTiktokDirectUrl
│   │   ├── provider-registry.ts    # ProviderRegistry class (findForUrl, download)
│   │   └── platforms/
│   │       ├── tiktok.ts           # TikTokProvider (+ fetchInfo for picker UI)
│   │       ├── instagram.ts        # InstagramProvider (RSSHub/picnob.info primary for stories; btch AIO → igdl for posts)
│   │       ├── twitter.ts          # TwitterProvider (AIO → btch → fxtwitter fallback chain)
│   │       ├── youtube.ts          # YouTubeProvider
│   │       ├── facebook.ts         # FacebookProvider (+ fetchInfo for HD/SD picker)
│   │       ├── threads.ts          # ThreadsProvider
│   │       ├── soundcloud.ts       # SoundCloudProvider
│   │       ├── spotify.ts          # SpotifyProvider
│   │       └── pinterest.ts        # PinterestProvider
│   └── telegram-bot/
│       ├── bot-factory.ts          # Bot creation, admin middleware, handler registration
│       ├── commands/
│       │   └── info-commands.ts    # /start, /help, /cancel, /story (all users), /footer (admin)
│       ├── callbacks/
│       │   └── download-callbacks.ts # dl:video, dl:audio, dl:hd, dl:sd, dl:yt:*, dl:confirm
│       ├── handlers/
│       │   ├── text-input-handler.ts  # URL detection → platform pickers → auto-download
│       │   ├── download-and-send.ts   # Core download + Telegram send logic
│       │   └── send-media.ts          # URL-first send strategy, >50MB handling
│       └── storage/
│           └── admin-state.ts         # KV state for multi-step download flows
└── utils/
    ├── url-detector.ts             # Platform URL detection + normalization (9 platforms)
    └── cache.ts                    # KV get/set helpers
```

## Downloader Architecture

The downloader uses a **Provider Registry + Strategy Pattern**. `media-downloader.ts` is a thin entry point that delegates to platform-specific providers via `ProviderRegistry`.

**Adding a new platform:**
1. Create `src/services/downloader/platforms/<name>.ts` implementing `IDownloaderProvider`
2. Register it in `media-downloader.ts` inside the `ProviderRegistry` constructor
3. Add URL patterns to `src/utils/url-detector.ts` if needed for the picker flow

**Key modules:**
- `btch-client.ts` — all HTTP calls to the btch API go through here. Handles 4-server failover, timeouts, limit/maintenance detection. Never call `fetch` against btch servers directly.
- `aio-parser.ts` — `tryAIO` is the shared fallback used by most platforms. `parseAioGallery` and `parseLinksSection` are the extracted helpers that eliminate duplicated response-parsing logic.
- `media-helpers.ts` — pure utility functions (no side effects, fully unit-tested).
- `IDownloaderProvider` — each platform implements `download(url, mode)` and optionally `fetchInfo(url)` for picker UIs (TikTok, Facebook).

**Fallback pattern used by most platforms:**
```
try AIO (richer data, caption, gallery) → fallback to platform-specific btch endpoint → error
```
Twitter is the exception: `FxTwitter API (primary) → btch AIO → btch twitter endpoint`. FxTwitter is used first because it returns full tweet text, per-video thumbnails, and properly separated `videos[]`/`photos[]` arrays. See `docs/FxEmbed-API.md`.

## Conventions

* TypeScript strict mode
* Hono framework for routing
* KV binding: `DOWNLOAD_CACHE` (separate from other projects)
* Env type from worker-configuration.d.ts (run `pnpm run cf-typegen` after changing wrangler.jsonc)
* No cheerio, no Instagram auth cookies
* Instagram Stories use RSSHub (picnob.info bridge) — RSS XML is only used here; all other platforms use btch API
* Platform files stay under 150 lines each; `media-downloader.ts` stays under 150 lines

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
* **Instagram Stories** — fetched via RSSHub/picnob.info; sent in media groups of 4. `/story` command available to all users (accepts `@username`, plain username, or URL). Optional custom footer via `/footer` (admin).
* **SoundCloud / Spotify** — audio auto-download
* **All others** — auto-download best quality

**Guest mode:** Non-admin users can send supported URLs and receive auto-downloads (no quality pickers, no KV state). SoundCloud/Spotify force `audio` mode; all others use `auto`. Pickers (YouTube, TikTok, Facebook) are admin-only.

**Media send strategy (URL-first):** `send-media.ts` tries Telegram URL pass-through first. If rejected, interactive mode shows `[📥 Download] [❌ Cancel] [📤 Send to @urluploadxbot]`. Files >50MB show URL + @urluploadxbot button. `TelegramUrlFetchError` triggers fallback; `directMediaUrl` stored in KV for `dl:confirm` callback.

**Admin state:** Stored in `DOWNLOAD_CACHE` under key `telegram:state:{userId}` (TTL 1h). Actions: `downloading_media`, `awaiting_broadcast`, `awaiting_story_username`. The `awaiting_story_username` action is set per-user (not just admin) so any user can use the two-step `/story` flow.

## Data flow

1. User sends URL → `text-input-handler.ts` detects platform
2. YouTube/TikTok/Facebook → show quality picker, store state in KV
3. Other platforms → call `downloadAndSendMedia` directly
4. Callback (`dl:*`) → read state from KV → download → send to chat
