# CLAUDE.md

Telegram bot on a Cloudflare Worker (Hono and grammY): send a URL, get the media back. The same Worker serves a public HTTP API and MCP endpoint.

Use the terms in `GLOSSARY.md`. Decisions live in `docs/adr/`.

## Read when

* `docs/downloader.md`: adding or changing a platform provider, fallback chains, per-platform behaviour, the request flow.
* `docs/troubleshooting.md`: failed or slow downloads, webhook problems.
* `CLAUDE-API.md`: changing the public API or MCP endpoint.
* `docs/FxEmbed-API.md`, `docs/btch-API-llms.md`, `docs/instagram-fallback.md`: the matching upstream API.

## Conventions

* Every btch call goes through `btchFetch`; never `fetch` a btch server directly.
* Platform files and `media-downloader.ts` stay under 150 lines each.
* No cheerio, no Instagram auth cookies. RSSHub is the only RSS source (Instagram Stories).
* State lives in D1. The `DOWNLOAD_CACHE` KV binding is commented out in `wrangler.jsonc`.
* Run `pnpm cf-typegen` after changing `wrangler.jsonc`. `TELEGRAM_WEBHOOK_SECRET` must be added to `worker-configuration.d.ts` by hand.
* Keep `workers_dev: true` in `wrangler.jsonc`; the Telegram webhook is registered on that host.
* MediaFire files flagged by VirusTotal sit behind a "Download Anyway" advisory. Do not automate past it.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `EngDawood/download-media` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, both created lazily. See `docs/agents/domain.md`.
