# CLAUDE-API.md — Public Download API

Guidelines for the `download-media-bot` public HTTP API. This file has two audiences:

1. **External consumers** (apps, scripts, AI agents) that want to download media without the Telegram bot.
2. **Maintainers** (Claude / agents working in this repo) who change the API and must keep it consistent.

---

## 1. Overview

`download-media-bot` exposes one public, key-protected endpoint that runs the same
downloader pipeline as the Telegram bot. Send a URL, get back **direct media links** as JSON.
Your app downloads/streams the files itself — no file bytes pass through the Worker, so there
is no upload size limit on the API side.

- **Base URL:** `https://download-media-bot.engdawood.workers.dev`
- **Endpoint:** `POST /api/download`
- **Auth:** `X-API-Key` header (required)
- **Content-Type:** `application/json`

The endpoint is **disabled unless the `PUBLIC_API_KEY` secret is set** (fails closed → `503`).

---

## 2. Authentication

Every request must include the API key:

```
X-API-Key: <PUBLIC_API_KEY>
```

- Missing/empty server-side key → `503 { "error": "API is not enabled" }`
- Wrong/missing header → `401 { "error": "Unauthorized" }`

Set the key (admin, one-time):

```bash
pnpm exec wrangler secret put PUBLIC_API_KEY
pnpm deploy
```

> The key is a single static shared secret. Treat it like a password: send it only over HTTPS,
> never embed it in client-side/browser code, and rotate it with `wrangler secret put` if leaked.

---

## 3. Request

```jsonc
POST /api/download
{
  "url": "https://www.tiktok.com/@user/video/123",  // required
  "mode": "auto",                                     // optional, default "auto"
  "platform": "TikTok"                                // optional, auto-detected if omitted
}
```

| Field      | Type   | Required | Notes |
|------------|--------|----------|-------|
| `url`      | string | yes      | The media URL. Protocol-less URLs (`tiktok.com/...`) are accepted and normalized. |
| `mode`     | string | no       | One of `auto`, `audio`, `hd`, `sd`. Invalid values fall back to `auto`. |
| `platform` | string | no       | Hint that skips hostname re-detection. Usually unnecessary — leave it out. |

**Modes:**
- `auto` — best video/photo (default).
- `audio` — audio-only extraction (e.g. YouTube/TikTok/SoundCloud/Spotify).
- `hd` / `sd` — quality hint for platforms that expose both (e.g. Facebook).

---

## 4. Response

On success (HTTP `200`), the body is the downloader result plus the resolved `platform`:

```jsonc
{
  "status": "success",
  "platform": "TikTok",
  "media": [
    {
      "type": "video",            // "video" | "photo" | "audio" | "document"
      "url": "https://...",       // direct, downloadable link
      "quality": "720p",          // optional
      "filesize": 1048576          // optional, bytes
    }
  ],
  "caption": "original post text", // optional
  "thumbnail": "https://...",      // optional
  "mp3Url": "https://..."          // optional (YouTube/TikTok audio companion)
}
```

**Consumer contract:**
- Always read media from `media[].url`. Iterate `media[]` — galleries/albums return multiple items.
- `media[].type` tells you how to handle each file.
- Ignore internal fields if present (`buffer`, `filename`) — they are Telegram-upload plumbing
  and are not meaningful to API consumers; rely on `url`.
- `caption`, `thumbnail`, `mp3Url`, `quality`, `filesize` are all optional — code defensively.

---

## 5. Status codes

| HTTP | Body `status` | Meaning | Action |
|------|---------------|---------|--------|
| 200  | `success`     | Media found. | Use `media[].url`. |
| 400  | `error`       | `Invalid JSON body` / `url is required` / `No supported URL found`. | Fix the request. |
| 401  | `error`       | `Unauthorized` — bad/missing API key. | Check `X-API-Key`. |
| 403  | `error`       | `This content is not allowed` — blocked (adult) domain. | Do not retry. |
| 502  | `error`       | Downloader failed (backend down, unsupported, no media). | Retry if `retryable: true`. |
| 503  | `error`       | `API is not enabled` — `PUBLIC_API_KEY` unset server-side. | Contact admin. |

On `502`, the body may include `"retryable": true` when the backend is still extracting —
retry after a short delay (a few seconds). Without `retryable`, treat the error as final.

---

## 6. Examples

**curl**
```bash
curl -X POST https://download-media-bot.engdawood.workers.dev/api/download \
  -H "X-API-Key: $PUBLIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://youtu.be/dQw4w9WgXcQ","mode":"audio"}'
```

**JavaScript (fetch)**
```js
const res = await fetch("https://download-media-bot.engdawood.workers.dev/api/download", {
  method: "POST",
  headers: { "X-API-Key": process.env.PUBLIC_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ url, mode: "auto" }),
});
const data = await res.json();
if (data.status === "success") {
  for (const item of data.media) console.log(item.type, item.url);
}
```

**Python (requests)**
```python
import os, requests
r = requests.post(
    "https://download-media-bot.engdawood.workers.dev/api/download",
    headers={"X-API-Key": os.environ["PUBLIC_API_KEY"]},
    json={"url": url, "mode": "auto"},
)
data = r.json()
if data["status"] == "success":
    for item in data["media"]:
        print(item["type"], item["url"])
```

---

## 7. Guidelines for AI agents consuming this API

- **Always check `status`** before reading `media`; never assume success from HTTP 200 alone
  (though they align, prefer the body field).
- **Iterate `media[]`** — do not hard-code `media[0]`; posts can be multi-image/video.
- **Respect blocked content:** a `403` is policy, not a transient error. Do not retry or work around it.
- **Backoff on `502 retryable`:** retry at most a few times with a delay; give up otherwise.
- **Direct links can expire.** Some provider URLs are short-lived/signed — download promptly,
  don't store the link long-term. Re-request if a stored link 404s.
- **Don't leak the key.** Never print `PUBLIC_API_KEY` in logs or echo it back to end users.
- **One URL per request.** There is no batch endpoint; send concurrent requests sparingly to
  avoid overloading the shared backends.

---

## 8. Supported platforms

TikTok, Instagram, X/Twitter, YouTube, Facebook, Threads, SoundCloud, Spotify, Pinterest, GitHub.
Any other URL is attempted via the generic AIO fallback — it may or may not return media.

---

## 9. Limitations

- **No rate limiting.** The endpoint currently has no per-key quota. The shared btch backends
  can be overloaded by abuse. (A D1-backed per-key/day quota can be added if the key is shared.)
- **Backend dependency.** Downloads rely on external btch servers (4-server failover) and, for
  some platforms, RSSHub/FxTwitter. Transient `502`s are expected when those are down.
- **No `picker` flow.** Quality pickers are a Telegram-only UX. The API resolves a single best
  result per `mode`; it does not return interactive choices.

---

## 10. MCP server

The same pipeline is also exposed as an **MCP server** so AI agents can call it as a tool.

- **Endpoint:** `POST /mcp` (Streamable HTTP transport, **stateless** — no sessions, no SSE stream)
- **Auth:** same `PUBLIC_API_KEY`, supplied **any** of three ways:
  1. `X-API-Key: <key>` header
  2. `Authorization: Bearer <key>` header
  3. as the last path segment — `POST /mcp/<key>`
- `GET`/`DELETE` return `405` by design; there is no stream to resume and no session to delete.
- Disabled (`503`) whenever `PUBLIC_API_KEY` is unset, exactly like the REST route.

### Why the path form exists

claude.ai custom connectors only recently gained request-header auth, and it is a
**gated beta** with known bugs where the configured header is dropped and the client falls
back to an OAuth flow. The path form sidesteps that entirely: paste the URL and connect.

It makes the URL a **capability URL** — the secret is the address. Treat it like a password:
do not paste it into anything that logs full URLs, and rotate with `wrangler secret put` if
it leaks. Header auth remains preferred wherever the client supports it.

**Connect from Claude Code** (headers work fine here):

```bash
claude mcp add --transport http download-media \
  https://dl.engdawood.com/mcp \
  --header "X-API-Key: $PUBLIC_API_KEY"
```

**Connect from claude.ai** — *Customize → Connectors → Add custom connector*, and paste:

```
https://dl.engdawood.com/mcp/<PUBLIC_API_KEY>
```

**Tools:**

| Tool | Arguments | Returns |
|------|-----------|---------|
| `download_media` | `url` (required), `mode` (`auto`\|`audio`\|`hd`\|`sd`) | `{ platform, media[], caption?, thumbnail?, mp3Url? }` |
| `get_media_info` | `url` | Caption + available qualities. Real preview only for TikTok and Facebook; other platforms return `preview: null`. |
| `list_supported_platforms` | — | The platform list plus a note about the generic fallback. |

Results are returned both as text and as `structuredContent`. **Links only — no file bytes pass
through the Worker**, matching the REST design. Download failures come back as `isError: true`
tool results (so the model can read and react to them), not as JSON-RPC protocol errors; malformed
requests and unknown tools *are* protocol errors.

`MediaItem.buffer` (a `Uint8Array` used for Telegram uploads) is stripped before serialising —
buffer-only items have no link, so they are omitted and counted in `omittedBinaryItems`.

> **Caveat:** for YouTube, the shared pipeline prefers the largest variant under ~45MB because of
> Telegram's upload cap. MCP consumers have no such limit, so they may get a lower quality than the
> best available. Changing this would affect the bot, so it is left as-is deliberately.

---

## 11. Maintainer notes (for Claude / repo agents)

Implementation lives in:

| File | Role |
|------|------|
| `src/routes/api.ts` | `handleApiDownload` — auth, validation, blocked-domain check, calls `downloadMedia`. |
| `src/routes/mcp.ts` | `handleMcp` — JSON-RPC over Streamable HTTP; tool defs + dispatch. Same auth and content policy. |
| `test/mcp.spec.ts` | Protocol-layer tests (handshake, auth, transport, tool dispatch) — no network. |
| `src/index.ts` | Route wiring: `app.post('/api/download', handleApiDownload)`, `app.post('/mcp', handleMcp)`. |
| `src/env.d.ts` | Declares the `PUBLIC_API_KEY?` secret on `Cloudflare.Env`. |
| `src/services/media-downloader.ts` | `downloadMedia(url, mode, platform?, env)` — the shared pipeline (bot + API). |
| `src/utils/url-detector.ts` | `detectMediaUrl` (normalize + platform), `isBlockedDomain` (content policy). |

Rules when changing the API:
- **Keep it failing closed.** If `PUBLIC_API_KEY` is unset, the endpoint must stay disabled (`503`).
  Never compare `undefined === undefined` into an open state.
- **Reuse the shared pipeline.** Do not duplicate download logic in the route — call `downloadMedia`.
- **Mirror the bot's content policy.** Keep the `isBlockedDomain` check so the API can't bypass it.
- **Keep REST and MCP in step.** They are two skins over the same `downloadMedia` call; a change to
  auth, modes or content policy must land in both `api.ts` and `mcp.ts`.
- **Never serialise `MediaItem.buffer`.** It is a `Uint8Array`; JSON-encoding it produces a huge
  object. `mcp.ts` strips it in `toPublicMedia`.
- **The `/mcp/:token` route is auth, not a namespace.** Do not add real sub-routes under `/mcp/`;
  the segment is compared against `PUBLIC_API_KEY` in `isAuthorized`. Any new path there would
  become a way to reach the handler without the key.
- **Update this file** whenever the request/response shape, status codes, or auth change.
- After editing `wrangler.jsonc` bindings, run `pnpm cf-typegen` (secrets are added manually in `src/env.d.ts`).
- This is a `CLAUDE-*.md` file: **exclude it from commits**, and never delete it.
