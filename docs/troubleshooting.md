# Troubleshooting

Known failure modes and how to check them.

## Large videos

Telegram fetches URLs up to 20MB. Above that the Worker must download the bytes and re-upload them (bots cap at 50MB), and `send-media.ts` buffers the whole file with `arrayBuffer()`. Files near 50MB risk an out-of-memory crash; the long-term fix is streaming through R2. Above 50MB nothing can be sent, so the user gets the link and the @urluploadxbot button.

## btch failures

The user sees "Download service temporarily unavailable" when all four backends fail.

1. Call a backend by hand: `curl "https://backend1.tioo.eu.org/api/downloader/{endpoint}?url=..."`.
2. Look for `code: -1`, `"limit"` or `"maintenance"` in the body; `isBtchLimitError` in `btch-client.ts` treats those as failures.
3. The default timeout per call is 12s (`btchFetch`). Raise it for an extractor that is consistently slow.

Responses are not schema-validated, so a malformed one surfaces as a `TypeError`. Check the raw response first.

## Empty 200 wins the race

`btchFetch` races all backends with `Promise.any`, so the first answer wins, even a 200 with no media. Pass an `isUsable` check (for example `hasYoutubeMedia`) so an empty answer counts as a failure and the race keeps waiting.

## YouTube timeouts

Symptom: "Downloading..." then silence or a failure.

- `/api/downloader/youtube` takes 2 to 6s, but some backends return `{"status":true}` with no `mp4` or `mp3`. The `hasYoutubeMedia` guard handles that.
- `/api/downloader/aio` is unreliable for YouTube (a Cloudflare token error after about 32s, or no answer). Its fallback is capped at 6s (`YOUTUBE_AIO_TIMEOUT_MS`).
- `downloadMedia` skips its automatic retry when the first attempt took over 15s (`RETRY_MAX_ELAPSED_MS`). Without that, the worst case passed Telegram's ~60s webhook window and the Worker was cut off with no reply.

Check: `curl -H 'User-Agent: btch/6.0.25' "https://backend{1..4}.tioo.eu.org/api/downloader/youtube?url=<encoded>"` and look for `mp4` in each body.

Open: `downloadMedia` retries `rate_limited` as well as `timeout`, but `failure.ts` says only `timeout` is retryable.

## Twitter/X caption truncated

btch cuts the tweet text in `title`. FxTwitter is the primary source and returns the full text, so a truncated caption means FxTwitter failed and a btch fallback answered. Check it: `curl "https://api.fxtwitter.com/i/status/{tweetId}"` should return `{ code: 200, tweet: { text, media } }`. See `docs/FxEmbed-API.md`.

## Webhook not receiving updates

1. `curl https://api.telegram.org/bot{TOKEN}/getWebhookInfo`. The `url` must be the bot Worker's `/telegram` (`https://download-media.dawod.workers.dev/telegram`), not `dl.engdawood.com`. A `404` or Cloudflare error `1042` there means the host is wrong or the Worker is not deployed; check the `workers.dev` host in the dashboard spelling.
2. Confirm `X-Telegram-Bot-Api-Secret-Token` matches `TELEGRAM_WEBHOOK_SECRET`.
3. Watch live logs with `pnpm exec wrangler tail`.

The secret check in `src/index.ts` only runs when `TELEGRAM_WEBHOOK_SECRET` is set. If it is missing in production, every POST is accepted.

## A new callback does nothing for guests

`bot-factory.ts` blocks guests from most callbacks. Add the callback to the exception list there (today `dl:retry` and `report:issue`).

## Stats or history stop updating

Several `.catch(() => {})` calls in `download-and-send.ts` discard database errors. Swap one for a `log('warn', ...)` temporarily to see the real error.
