# Agent guide

This guide orients any coding agent that works in the `Gemini CLI`
download-media bot repository. Follow it to gather context quickly, use the
correct tooling, and keep documentation accurate.

## Mission

The agent keeps the Telegram downloader fast, stable, and well documented.
Focus on four habits:

- Study the latest Cloudflare Workers docs before touching Workers,
  KV, R2, D1, Durable Objects, Queues, Vectorize, Workers AI, or Agents
  SDK tasks.
- Mirror the existing TypeScript, Hono, and grammY architecture rather than
  rewriting it.
- Keep instructions synchronized by editing Markdown with the
  `docs-writer` standards from `.agents/skills/docs-writer/SKILL.md`.
- Communicate absolute dates (for example, March 13, 2026) so history stays
  clear.

## Cloudflare-first workflow

Your first stop is always the official Cloudflare documentation:
`https://developers.cloudflare.com/workers/`. Fetch limits from the relevant
`/platform/limits/` page and keep the MCP mirror
(`https://docs.mcp.cloudflare.com/mcp`) handy when the network blocks the
primary site.

Run `npx wrangler types` whenever `wrangler.jsonc` bindings change so
`worker-configuration.d.ts` stays aligned. Use `npx wrangler dev` for local
testing and `npx wrangler deploy` when shipping.

## Project snapshot

The worker exposes a Hono app that processes Telegram updates and returns
download links for TikTok, Instagram, Twitter/X, YouTube, Facebook, Threads,
SoundCloud, Spotify, and Pinterest.
`src/services/media-downloader.ts` wraps the btch API with failover across four
upstream servers. Telegram command and callback handlers live under
`src/services/telegram-bot`.

## Repository map

Review these paths before digging in:

- `src/index.ts`: Entry worker wiring `GET /health`, `GET /setup`, and
  `POST /telegram`.
- `src/services/telegram-bot/`: grammY bot factory, commands, callbacks,
  and handler glue.
- `src/services/media-downloader.ts`: Platform-aware download orchestration.
- `src/utils/`: URL detection and KV cache helpers.
- `worker-configuration.d.ts`: Typings generated from Wrangler bindings.

## Local development workflow

Follow this order when you start a task:

1.  Install dependencies with `npm install`.
2.  Copy `.dev.vars` and fill in `TELEGRAM_BOT_TOKEN` plus `ADMIN_TELEGRAM_ID`.
3.  Run `npm run dev` (wrapping `npx wrangler dev`) to emulate Workers on
    port 8787.
4.  Execute targeted tests with `npm test` via Vitest.
5.  After editing docs, ask whether to run `npm run format` before opening
    a pull request.

## Deployment and configuration

Use `npm run deploy` to publish the worker named `download-media-bot`.
Secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`) belong in Wrangler
through `npx wrangler secret put`. The KV namespace is `DOWNLOAD_CACHE`, and
the only environment variable in `wrangler.jsonc` is `ADMIN_TELEGRAM_ID`.

## Diagnostics and support

Investigate download failures by tracing `src/services/telegram-bot/handlers`
logs. If Cloudflare reports Error 1102 or similar, confirm the current CPU
and memory quotas from `/workers/platform/limits/`. For Telegram callback
issues, inspect KV state under `telegram:state:{userId}`.

## Next steps

- Verify any new feature idea with product requirements before touching code.
- Confirm test coverage for new handlers or download flows.
- Capture notable findings back in `CLAUDE*.md` or `README.md` so future
  agents inherit the context.
