
# CLAUDE-troubleshooting.md

Known issues, production concerns, and how to debug them.

---

## Sending Large Videos >20MB

To send videos >20MB, the Worker needs to download the video bytes then re-upload them to Telegram as multipart form
data instead of passing a URL.

Here's what changes:

┌────────────────────────────────────────────┬─────────────────────────────────────────────────────────┐
│           Current (URL passing)            │                 New (download + upload)                 │
├────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ Worker sends URL string to Telegram        │ Worker downloads video bytes, re-uploads to Telegram    │
├────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ Telegram fetches video directly (max 20MB) │ Telegram receives the file directly (max 50MB for bots) │
├────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ 0 bytes through Worker                     │ Video bytes flow through Worker                         │
└────────────────────────────────────────────┴─────────────────────────────────────────────────────────┘

But there are hard limits to be aware of:

- Telegram Bot API hard limit: 50MB — videos above this cannot be sent by any bot, period
- Cloudflare Workers memory: 128MB — a 40MB video in memory is tight but fits
- `send-media.ts` uses `resp.arrayBuffer()` which loads the entire file into Worker memory — files approaching 50–100MB risk OOM crashes

So practically:
- Videos 20–50MB → show interactive fallback (Download / @urluploadxbot) via `send-media.ts`
- Videos >50MB → impossible via Telegram bot; show URL + @urluploadxbot button

Current implementation: `send-media.ts` tries URL-first, catches `TelegramUrlFetchError`, shows interactive buttons.

**⚠️ Known risk (not yet fixed):** Large files are loaded fully into Worker memory via `arrayBuffer()`. If this causes OOM, the long-term fix is streaming to Cloudflare R2 instead of buffering in memory.

---

## Twitter/X Captions Truncated

**Symptom:** Bot sends tweet media with caption ending in `...` mid-sentence.

**Cause:** The btch API truncates the `title` field for Twitter/X posts.

**Fix (already applied):** FxTwitter is now the primary strategy for Twitter downloads (`src/services/downloader/platforms/twitter.ts`). It returns the full `tweet.text` directly — no separate oEmbed call needed. Caption is always complete as long as FxTwitter responds.

**Fallback chain:**
1. **FxTwitter API** (`api.fxtwitter.com`) — full text, `media.videos[]`, `media.photos[]`, thumbnail per video. See `docs/FxEmbed-API.md`.
2. **btch AIO endpoint** — gallery support, richer metadata
3. **btch twitter endpoint** — legacy fallback

**If FxTwitter stops working:** btch fallbacks kick in automatically. Check FxTwitter manually: `curl "https://api.fxtwitter.com/i/status/{tweetId}"`. Expected response: `{ code: 200, tweet: { text, media: { videos, photos } } }`.

---

## btch API Failures

If all 4 btch backend servers fail, the user sees: *"Download service temporarily unavailable."*

**Diagnosis steps:**
1. Check if endpoint is supported (see platform table in `CLAUDE-patterns.md`)
2. Try manually: `curl "https://backend1.tioo.eu.org/api/downloader/{endpoint}?url=..."`
3. Check if the response contains `code: -1`, `"limit"`, or `"maintenance"` — these trigger server failover in `btch-client.ts:isBtchLimitError()`
4. Increase timeout (currently 30s per server) in `btch-client.ts:btchFetch()` if servers are consistently slow

**Note:** btch API response shape is not schema-validated. A malformed response can cause a `TypeError` at runtime rather than a user-friendly error. If you see unexpected TypeErrors in production logs, check the raw btch response shape first.

---

## Webhook Not Receiving Updates

1. Verify webhook is set: `curl https://api.telegram.org/bot{TOKEN}/getWebhookInfo`
2. Check `X-Telegram-Bot-Api-Secret-Token` header matches `TELEGRAM_WEBHOOK_SECRET`
3. Use `npx wrangler tail` to see live logs from the deployed Worker

**⚠️ Security note:** The webhook secret check at `src/index.ts` is guarded by `if (env.TELEGRAM_WEBHOOK_SECRET)`. If this secret is not set in production, **all POST requests are accepted without verification**. Always ensure `TELEGRAM_WEBHOOK_SECRET` is set: `pnpm exec wrangler secret put TELEGRAM_WEBHOOK_SECRET`.

---

## Telegram API Calls Hanging / Worker Timeout

**Symptom:** Worker hits the Cloudflare 30s wall-clock limit; requests time out with no user response.

**Cause:** grammy's `bot.api.*` calls (`sendMessage`, `editMessageText`, `sendVideo`, etc.) use grammy's default timeout — undefined behavior under Telegram API slowness or network stress. A stalled call can hold the Worker open until Cloudflare kills it.

**Fix (not yet applied):** Set an explicit grammy timeout in `src/services/telegram-bot/bot-factory.ts`:
```typescript
const bot = new Bot(token, {
  client: { timeoutSeconds: 10 }
});
```

---

## Telegram 429 Too Many Requests

**Symptom:** Bot stops responding to some users; Telegram API returns 429 errors in logs.

**Cause:** Telegram enforces 30 messages/second globally per bot and 1 message/second per chat. Multiple simultaneous users can hit this limit. Currently there is no retry or backoff handling for 429 responses.

**Workaround (not yet implemented):** Read `retry_after` from the 429 response body and implement a wait + retry, or at minimum log a warning and notify the user to retry.

---

## KV Write Errors Silently Swallowed

**Symptom:** Stats or download history stop updating with no error in logs.

**Cause:** Two `.catch(() => {})` calls in `src/services/telegram-bot/handlers/download-and-send.ts` discard KV errors without logging.

**How to debug:** Temporarily replace `.catch(() => {})` with `.catch((e) => log('warn', 'kv-write-failed', 'KV error', { error: e.message }))` and redeploy to surface the real error.

---

## Per-User Rate Limiting (Not Yet Implemented)

**Risk:** Any user (guest or admin) can currently send unlimited download requests with no throttle. A single malicious user can exhaust btch API quotas and inflate KV costs.

**Planned fix:** KV sliding window rate limiter. Key pattern: `rate:{userId}:{Math.floor(Date.now()/60000)}`, increment on each request with 60s TTL, reject if > 10 requests/minute. Add check to `text-input-handler.ts` before processing URLs.

---

## Callback Whitelist — Adding New Non-Admin Callbacks

Non-admin users are blocked from most callbacks by default middleware in `bot-factory.ts`. There is a hardcoded exception list for callbacks that guests are allowed to trigger (e.g. `dl:retry`, `report:issue`).

**If a new callback silently does nothing for guest users**, check `bot-factory.ts` and add the callback prefix to the whitelist exception list. Document the addition with a comment.

---

## Subscription Gate (Dead/Incomplete Code)

`src/services/telegram-bot/handlers/subscription-gate.ts` exists and defines KV keys (`KV_KEY_REQUIRED_CHANNEL`, `KV_KEY_FREE_USES`) but is **not currently integrated** into the main request flow. It is not enforced in `text-input-handler.ts` or `bot-factory.ts`.

Do not delete it — it is in-progress. Do not rely on it being active.

---

## Structured Logging Not Used Everywhere

`src/utils/logger.ts` provides structured JSON logging queryable via Cloudflare Logs. However, `bot-factory.ts` still uses raw `console.log`/`console.error` in several places, making those events unqueryable.

**Fix:** Replace `console.log`/`console.error` calls in `bot-factory.ts` with `log('info', ...)` / `log('error', ...)` from `src/utils/logger.ts`.

---

## Downloader Module Path Changes (Post-Refactor)

As of 19-03-2026, `media-downloader.ts` was refactored into a Provider Registry architecture. If you encounter import errors or "function not found" after a merge:

- `btchFetch` and `isBtchLimitError` → now in `src/services/downloader/btch-client.ts`
- `tryAIO`, `parseAioGallery`, `parseLinksSection` → now in `src/services/downloader/aio-parser.ts`
- `isUrl`, `detectMediaType`, `buildCaption`, `formatFileSize`, `decodeTiktokDirectUrl` → now in `src/services/downloader/media-helpers.ts`
- Platform handlers → `src/services/downloader/platforms/*.ts`
- All still re-exported from `media-downloader.ts` for backward compatibility — existing callers do not need to change their imports.

---

## References

- Telegram Bot API: https://core.telegram.org/bots/api#setwebhook
- grammY Webhooks: https://grammy.dev/guide/deployment-types.html#how-to-use-webhooks
- Cloudflare Workers Observability: Use `npx wrangler tail` to diagnose
- Production Readiness Report: `reports/production-readiness-report-2026-03-18.md`
