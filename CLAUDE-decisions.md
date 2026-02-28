# Architecture Decisions

## 2026-02-14: Telegram bot modularization

**Context:** Cleaned up from a copy of the rss-bridge project. Removed all RSS, channel management, subscription, and Instagram scraping code. Simplified the bot to a single-purpose download bot.

**Current module structure:**
```
telegram-bot/
├── bot-factory.ts        # createBot(), admin middleware, global error handler
├── commands/
│   └── info-commands.ts  # /start, /help, /cancel
├── callbacks/
│   └── download-callbacks.ts  # dl:video, dl:audio, dl:hd, dl:sd, dl:yt:*, dl:confirm
├── handlers/
│   ├── text-input-handler.ts  # URL detection → platform pickers → auto-download
│   ├── download-and-send.ts   # Core download + Telegram send logic
│   └── send-media.ts          # URL-first send strategy, >50MB handling
└── storage/
    └── admin-state.ts    # KV state for multi-step download flows
```

## 2026-02-14: Double-fault protection in error handlers

**Context:** Error handlers themselves can fail (e.g., `answerCallbackQuery` fails due to network issue), creating unhandled exceptions that mask the original error.

**Decision:** Nest try-catch in all error notification code paths.

**Pattern:**
```typescript
} catch (err) {
    console.error('Original operation failed:', err);
    try {
        await notifyUser(err);
    } catch (notifyErr) {
        console.error('Notification also failed:', notifyErr);
    }
}
```

**Applied in:** `bot-factory.ts` global error handler (both callback and command paths).

**Rationale:** The worst outcome is a silent failure with no logging. Double-fault protection ensures at minimum `console.error` captures both failures.

## 2026-02-14: Defensive JSON.parse for KV operations

**Context:** KV data can become corrupted. Unhandled `JSON.parse` exceptions would crash bot commands.

**Decision:** Wrap all `JSON.parse` calls in try-catch with logging and safe defaults.

**Implementation:**
- `getAdminState`: returns `null` on parse error
- All log error with key/context: `console.error('[KV] Corrupted state for ${userId}:', err)`

## 2026-02-14: URL-first send strategy with interactive fallback

**Context:** Passing CDN URLs directly to Telegram avoids downloading files in the Worker (CPU/memory limits). But Telegram rejects URLs >20MB or with auth headers.

**Decision:** Try Telegram URL pass-through first. If `TelegramUrlFetchError` is thrown, show interactive buttons: `[📥 Download] [❌ Cancel] [📤 Send to @urluploadxbot]`. Store `directMediaUrl` in KV for `dl:confirm` callback.

**Files:** `send-media.ts` (strategy), `download-callbacks.ts` (dl:confirm handler), `admin-state.ts` (KV storage).

## 2026-02-14: btch API server failover

**Context:** Single btch API server is a SPOF. Need resilience.

**Decision:** Use 4 backends (backend1–4.tioo.eu.org). On 5xx or network/timeout errors, try next server. Non-5xx errors (4xx, parse errors) fail fast.

**Implementation:** `btchFetch()` in `media-downloader.ts` — loops over `BTCH_SERVERS` array.

## 2026-02-xx: Guest mode for non-admin users

**Context:** The bot should be usable by non-admin users for auto-downloads, but quality pickers and KV state management should remain admin-only.

**Decision:** If a non-admin user sends a supported URL, call `downloadAndSendMedia` with `guestMode: true`. Skip all pickers, always use `auto` mode (or `audio` for SoundCloud/Spotify). No KV state stored.

**Implementation:** `text-input-handler.ts` — checks `isAdmin` before showing pickers.

## 2026-02-xx: GET /setup route for bot initialization

**Context:** Bot commands and menu button need to be registered once with Telegram. Originally done via a one-off script.

**Decision:** Add `GET /setup` route handled by `src/routes/setup.ts` that calls `setMyCommands()` and `setChatMenuButton()`. Idempotent — can be called multiple times safely.

**Commands registered:** `/start`, `/help`, `/cancel`
