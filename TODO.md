# TODO.md
**Source:** Production Readiness Report (`reports/production-readiness-report-2026-03-18.md`)
**Created:** 2026-03-19

Items are ordered by impact vs effort. Blockers must ship before opening the bot to a general audience.

---

## 🔴 Blockers — Must Fix Before General Audience

### 1. Enforce webhook secret — reject if unset
**File:** `src/index.ts:16`
**Effort:** ~5 min

Current code only validates the secret *if* it is set. A missing `TELEGRAM_WEBHOOK_SECRET` env var silently disables webhook authentication — any POST request is accepted.

```typescript
// BEFORE (line 16)
if (c.env.TELEGRAM_WEBHOOK_SECRET && secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {

// AFTER — reject with 403 if secret is not configured at all
if (!c.env.TELEGRAM_WEBHOOK_SECRET) {
  return c.json({ error: 'Forbidden' }, 403);
}
if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
  return c.json({ error: 'Unauthorized' }, 401);
}
```

Also verify the secret is set before deploying:
```
pnpm exec wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

---

### 2. Per-user rate limiting
**File:** `src/services/telegram-bot/handlers/text-input-handler.ts` (after user-blocked check, ~line 55)
**Effort:** ~2–3h

No throttle exists. One user spamming 100 URLs/second can exhaust btch API quotas and inflate KV costs.

**Implementation plan — KV sliding window:**
```typescript
// src/utils/rate-limiter.ts (new file)
export async function isRateLimited(kv: KVNamespace, userId: number, maxPerMinute = 10): Promise<boolean> {
  const key = `rate:${userId}:${Math.floor(Date.now() / 60_000)}`;
  const count = parseInt((await kv.get(key)) ?? '0', 10);
  if (count >= maxPerMinute) return true;
  await kv.put(key, String(count + 1), { expirationTtl: 60 });
  return false;
}
```

Add the check in `text-input-handler.ts` after the user-blocked check:
```typescript
if (!isAdmin && userId) {
  if (await isRateLimited(kv, userId)) {
    await ctx.reply(t(locale, 'input.rate_limited')); // add translation key
    return;
  }
}
```

Add translation key `input.rate_limited` to `src/i18n/` for both `en` and `ar`.

---

### 3. Write core unit tests
**Files:** `test/url-detector.spec.ts` (new), existing `test/media-downloader-pure.spec.ts` (extend)
**Effort:** ~4–6h

`vitest` is installed and CI runs it, but for the original codebase there were zero test files — CI always passed silently. We now have 34 tests for pure downloader helpers. The remaining gap:

- [ ] `src/utils/url-detector.ts` — platform detection + URL normalization (10–15 cases per platform)
- [ ] `src/services/downloader/btch-client.ts` — failover logic with mocked `fetch` (server 500 → next server, limit response → next server, all fail → throw)
- [ ] `src/utils/stats.ts` — `isUserBlocked`, history cap logic
- [ ] `src/utils/rate-limiter.ts` — once implemented (item 2 above)

Target: **≥60% coverage** on `src/utils/` and `src/services/downloader/`.

---

## 🟡 Warnings — Fix Soon

### 4. Set grammy API timeout
**File:** `src/services/telegram-bot/bot-factory.ts:16`
**Effort:** ~10 min

All `bot.api.*` calls (sendMessage, editMessageText, sendVideo) use grammy's default timeout. A stalled Telegram response can hold a Worker open until Cloudflare kills it at 30s wall-clock.

```typescript
// BEFORE
const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// AFTER
const bot = new Bot(env.TELEGRAM_BOT_TOKEN, {
  client: { timeoutSeconds: 10 },
});
```

---

### 5. Handle Telegram 429 Too Many Requests
**File:** `src/services/telegram-bot/bot-factory.ts` — global error handler (~line 22)
**Effort:** ~1h

Telegram enforces 30 msg/s per bot globally. No retry or backoff exists. Under load the bot goes silent.

Add to the global `bot.catch` handler:
```typescript
bot.catch(async (err) => {
  if (err.error instanceof GrammyError && err.error.error_code === 429) {
    const retryAfter = err.error.parameters?.retry_after ?? 5;
    log('warn', 'bot', 'Telegram 429 — rate limited', { retryAfter });
    // optionally notify user: "Bot is busy, please retry in Xs"
    return;
  }
  // existing handler...
});
```

---

### 6. Log swallowed KV errors
**File:** `src/services/telegram-bot/handlers/download-and-send.ts` (~lines 59, 113)
**Effort:** ~10 min

Two `.catch(() => {})` silently discard KV write errors, making silent failures invisible in logs.

```typescript
// BEFORE
kv.put(...).catch(() => {});

// AFTER
kv.put(...).catch((e: Error) => log('warn', 'kv-write', 'KV write failed', { error: e.message }));
```

---

### 7. Replace console.log/error in bot-factory.ts with structured logger
**File:** `src/services/telegram-bot/bot-factory.ts` — lines 25, 30, 35, 45, 75, 100, 108
**Effort:** ~20 min

Raw `console.log`/`console.error` calls are not queryable via Cloudflare Logs. Replace all with `log()` from `src/utils/logger.ts`:

```typescript
// BEFORE
console.error(`[bot] Unhandled error | userId=${userId}:`, err.error);
console.log('[DEBUG] Incoming Callback:', ctx.callbackQuery.data);

// AFTER
import { log } from '../../utils/logger';
log('error', 'bot', 'Unhandled error', { userId, error: String(err.error) });
log('debug', 'bot', 'Incoming callback', { data: ctx.callbackQuery.data, userId });
```

---

## 🔵 Recommended — Post-Launch Polish

### 8. Document subscription gate status
**File:** `src/services/telegram-bot/handlers/subscription-gate.ts`
**Effort:** ~5 min

`subscription-gate.ts` is in-progress code — KV keys are defined in `constants.ts` but the gate is not enforced anywhere. Add a comment so the next person doesn't waste time debugging why it has no effect:

```typescript
// TODO: Not yet active — subscription gate is in-progress.
// KV keys defined (KV_KEY_REQUIRED_CHANNEL, KV_KEY_FREE_USES) but
// not enforced in text-input-handler.ts or bot-factory.ts.
// See production-readiness-report-2026-03-18.md for context.
```

---

### 9. Add Telegram API retry with exponential backoff
**File:** `src/services/telegram-bot/handlers/download-and-send.ts`
**Effort:** ~2h

`bot.api.sendMessage` / `editMessageText` have no retry. A transient Telegram API blip will surface as an error to the user. Add 2–3 retries with exponential backoff for send operations.

---

### 10. Batch KV stat writes
**File:** `src/utils/stats.ts`
**Effort:** ~2–3h

`incrementLinkStats()` writes to KV on every download. At scale this inflates KV operation costs. Buffer 10 events and flush every 5s using `waitUntil`.

---

### 11. Document Cloudflare spending limit
**File:** `CLAUDE.md` or `README.md`
**Effort:** ~10 min

Document the Cloudflare Workers spending limit (set in Cloudflare dashboard → Workers → Usage limits) to prevent runaway costs. Note the btch API upstream rate limits if known.

---

## Progress Tracker

| # | Item | Status | Priority |
|---|---|---|---|
| 1 | Enforce webhook secret | ⬜ todo | 🔴 blocker |
| 2 | Per-user rate limiting | ⬜ todo | 🔴 blocker |
| 3 | Write core unit tests | ⬜ todo | 🔴 blocker |
| 4 | Set grammy API timeout | ⬜ todo | 🟡 warning |
| 5 | Handle Telegram 429 | ⬜ todo | 🟡 warning |
| 6 | Log swallowed KV errors | ⬜ todo | 🟡 warning |
| 7 | Replace console.log in bot-factory | ⬜ todo | 🟡 warning |
| 8 | Document subscription gate | ⬜ todo | 🔵 polish |
| 9 | Telegram retry + backoff | ⬜ todo | 🔵 polish |
| 10 | Batch KV stat writes | ⬜ todo | 🔵 polish |
| 11 | Document spending limit | ⬜ todo | 🔵 polish |
