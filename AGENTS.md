# Codex agent playbook

This guide equips every Codex agent who works inside `download-media`
(Gemini CLI). Follow it to keep Cloudflare Worker knowledge current and to
mirror the repo's conventions.

## Cloudflare reality check

Use these guardrails to ensure every Worker change reflects current limits.

- Treat Cloudflare's public docs as the source of truth.
- Before touching Workers, KV, R2, D1, Durable Objects, Queues, Vectorize,
  Workers AI, or Agents SDK, fetch the latest pages from
  `https://developers.cloudflare.com/workers/`.
- Look up quotas on the relevant `/platform/limits/` page. Example:
  `https://developers.cloudflare.com/workers/platform/limits/`.
- Keep the MCP mirror `https://docs.mcp.cloudflare.com/mcp` ready when the
  main site is unreachable.

## Codex workflow basics

Stick to these habits to stay aligned with Codex repository expectations.

- Use `rg` for file and text searches; fall back to other tools only if `rg`
  is unavailable.
- Prefer `apply_patch` for single-file edits that aren't auto-generated.
- Never revert user changes or run destructive git commands unless explicitly
  requested.
- Communicate absolute dates (for example, March 13, 2026) when referencing
  history or schedules.
- Respect docs-writer standards for every Markdown edit and keep line length at
  80 characters.

## Project snapshot

`download-media` is a Cloudflare Worker Telegram bot built with Hono and grammY.
`src/index.ts` wires `GET /health`, `GET /setup`, and `POST /telegram`. The bot
routes live under `src/services/telegram-bot` and the btch-powered downloader
lives in `src/services/media-downloader.ts`. Supported platforms: TikTok,
Instagram, Twitter/X, YouTube, Facebook, Threads, SoundCloud, Spotify, and
Pinterest.

## Commands

Reference this table whenever you need to run local or deployment workflows.

| Command | Purpose |
| ------- | ------- |
| `npx wrangler dev` | Local development |
| `npx wrangler deploy` | Deploy to Cloudflare |
| `npx wrangler types` | Regenerate `worker-configuration.d.ts` |
| `npm run dev` | Starts Wrangler dev server via package script |
| `npm test` | Run Vitest suite |

Run `npx wrangler types` after any change to `wrangler.jsonc` bindings so the
typings stay synchronized.

## Configuration and secrets

Keep these values aligned across Wrangler, local dev, and production.

- Wrangler vars: `ADMIN_TELEGRAM_ID`.
- Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (set with
  `npx wrangler secret put`).
- KV namespace: `DOWNLOAD_CACHE` (state + cache for download flows).
- Local dev: populate `.dev.vars` with the same keys before running tests.

## Error references

When incidents occur, start with these documentation entry points.

- Error 1102 (CPU or memory exceeded): confirm Worker quotas on the `/limits/`
  page before attempting fixes.
- For any other runtime issue, consult the Cloudflare error catalogue:
  `https://developers.cloudflare.com/workers/observability/errors/`.

## Documentation standards

Always load `.agents/skills/docs-writer/SKILL.md` before editing Markdown.
Adhere to BLUF structure, wrap text at 80 characters, and close with actionable
next steps when relevant. Use descriptive link text and avoid tables of
contents.

## Verification checklist

Before you request review, walk through this quick validation list.

1.  Confirm the latest Cloudflare references are cited for every dependency or
    quota you mention.
2.  Ensure `worker-configuration.d.ts` matches `wrangler.jsonc`.
3.  Validate Telegram command/callback flows in `src/services/telegram-bot`.
4.  Run targeted tests (`npm test`) for affected handlers.
5.  Ask if `npm run format` should run after documentation updates.

