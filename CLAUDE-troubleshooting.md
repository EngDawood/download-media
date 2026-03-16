
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
- Cloudflare free tier CPU: 10ms — downloading + uploading a 40MB video is risky, may timeout
- Cloudflare Workers memory: 128MB — a 40MB video in memory is tight but fits

So practically:
- Videos 20–50MB → show interactive fallback (Download / @urluploadxbot) via `send-media.ts`
- Videos >50MB → impossible via Telegram bot; show URL + @urluploadxbot button

Current implementation: `send-media.ts` tries URL-first, catches `TelegramUrlFetchError`, shows interactive buttons.

## Twitter/X Captions Truncated

**Symptom:** Bot sends tweet media with caption ending in `...` mid-sentence.

**Cause:** The btch API truncates the `title` field for Twitter/X posts.

**Fix (already applied):** `fetchTwitterFullCaption()` in `media-downloader.ts` calls `https://publish.twitter.com/oembed?url=...` to get the full text. Runs in parallel with `tryAIO()` — no latency added.

**If oEmbed stops working:** The function returns `''` on any error, and the code falls back to btch `title` (`caption ?? buildCaption(res.title)`). Check oEmbed manually: `curl "https://publish.twitter.com/oembed?url={tweetUrl}"`.

## btch API Failures

If all 4 btch backend servers fail:
- Check if endpoint is supported (see platform table in `CLAUDE-patterns.md`)
- Try accessing `https://backend1.tioo.eu.org/api/downloader/{endpoint}?url=...` manually
- Increase timeout (currently 30s per server) in `btchFetch()` if servers are slow

## Webhook Not Receiving Updates

1. Verify webhook is set: `curl https://api.telegram.org/bot{TOKEN}/getWebhookInfo`
2. Check `X-Telegram-Bot-Api-Secret-Token` header matches `TELEGRAM_WEBHOOK_SECRET`
3. Use `npx wrangler tail` to see live logs from the deployed Worker

## References

- Telegram Bot API: https://core.telegram.org/bots/api#setwebhook
- grammY Webhooks: https://grammy.dev/guide/deployment-types.html#how-to-use-webhooks
- Cloudflare Workers Observability: Use `npx wrangler tail` to diagnose

---
