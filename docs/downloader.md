# Downloader reference

The downloader uses a **Provider Registry + Strategy Pattern**. `media-downloader.ts` is a thin entry point that delegates to platform-specific providers via `ProviderRegistry`.

**Adding a new platform:**
1. Create `src/services/downloader/platforms/<name>.ts` implementing `IDownloaderProvider`
2. Register it in `media-downloader.ts` inside the `ProviderRegistry` constructor
3. Add URL patterns to `src/utils/url-detector.ts` if needed for the picker flow

**Key modules:**
- `btch-client.ts`: all HTTP calls to the btch API go through here. Races the 4 backends in parallel (first usable answer wins) and handles timeouts and limit/maintenance detection. Never call `fetch` against btch servers directly.
- `aio-parser.ts`: `tryAIO` is the shared fallback used by most platforms. `parseAioGallery` and `parseLinksSection` are the extracted helpers that eliminate duplicated response-parsing logic.
- `media-helpers.ts`: pure utility functions (no side effects, fully unit-tested). Also holds `BROWSER_UA` and `metaContent` (reads an `<meta property|name>` tag in either attribute order) for providers that read a page directly.
- `IDownloaderProvider`: each platform implements `download(url, mode)` and optionally `fetchInfo(url)` for picker UIs (TikTok, Facebook).

**Fallback pattern used by most platforms:**
```
try AIO (richer data, caption, gallery) → fallback to platform-specific btch endpoint → error
```
**Direct-first platforms:** where the share page itself carries the media URL, the provider fetches it with `BROWSER_UA` and parses it before touching btch/AIO, returning `null` on any miss so the fallbacks run. Verified this way: Pinterest, CapCut, SnackVideo. Checked and not viable (empty JS shell, login wall or blocked): Instagram, Threads, YouTube, Facebook. TikTok's page works but its mp4 needs the page's cookies, so Telegram cannot fetch it by URL (the Worker would have to download the bytes).
* **Pinterest**: video `.mp4` via regex over the page (`v1.pinimg.com/videos/...mp4`, 720p preferred); photo is the `/originals/` URL matching the og:image hash. Pinterest sometimes serves a video pin's page with only the `.m3u8`, so a page with HLS but no mp4 is refetched (3 attempts) and never sent as its thumbnail. A dead pin redirects to the homepage, which counts as a miss.
* **CapCut**: `og:video:url`; an empty `og:title` means a removed template (placeholder video) and counts as a miss.
* **SnackVideo**: the page's `contentUrl` (VideoObject), else the first `video-0` player; the page also lists other videos' mp4s.

Twitter is the exception: `FxTwitter API (primary) → btch AIO → btch twitter endpoint`. FxTwitter is used first because it returns full tweet text, per-video thumbnails, and properly separated `videos[]`/`photos[]` arrays. See `docs/FxEmbed-API.md`.


## Per-platform behaviour

**Supported platforms:** TikTok, Instagram, X/Twitter, YouTube, Facebook, Threads, SoundCloud, Spotify, Pinterest, Douyin, GitHub, Google Drive, MediaFire, CapCut, SnackVideo, Internet Archive

**Platform-specific UX:**
* **GitHub**: public repos, folders and files need no token. With the `GITHUB_TOKEN` secret set, only the admin's own requests use it, so private repos (whole-repo zip, `/tree/` folder, `/blob/` file) download for the admin and fail for everyone else. The token never reaches the API or MCP endpoints. Use a fine-grained token with `Contents: Read-only`. Code: `github-private.ts`, `GitHubProvider`.
* **YouTube**: fetches quality list, shows picker (up to 4 + Audio button)
* **TikTok**: slideshows auto-download; videos show Video/Audio picker
* **Facebook**: shows HD/SD picker if multiple qualities available
* **Instagram Stories**: fetched via RSSHub/picnob.info; sent in media groups of 4. `/story` command available to all users (accepts `@username`, plain username, or URL). Optional custom footer via `/footer` (admin).
* **SoundCloud / Spotify**: audio auto-download
* **Internet Archive**: `archive.org/details|download|stream|embed/<id>` resolved through `archive.org/metadata/<id>`; sends the PDF (EPUB if there is none) with the other as a `dl:alt` button (`download.btn_epub`). Direct `ia*.us.archive.org/<n>/items/<id>/<file>` links pass through as-is; borrow-only items return an `unsupported` error. Large PDFs follow the usual >20MB/>50MB paths in `send-media.ts`.
* **MediaFire**: files flagged by VirusTotal sit behind a "Download Anyway" malware advisory; do not automate past it.
* **All others**: auto-download best quality

**Guest mode:** Guests get automatic downloads only: no Pickers, no stored state. SoundCloud and Spotify force `audio`; everything else uses `auto`.

**Send strategy:** URL-first, see `docs/adr/0001-url-first-send.md`. `directMediaUrl` is stored in flow state for the `dl:confirm` callback.

**Flow state:** `AdminState` per user, 1h TTL, kept by `storage/session-store.ts`. Actions: `downloading_media`, `awaiting_broadcast`, `awaiting_story_username`. The `awaiting_story_username` action is set per-user (not just admin) so any user can use the two-step `/story` flow.


## Data flow

1. User sends URL → `text-input-handler.ts` detects platform
2. YouTube/TikTok/Facebook → show quality picker, store flow state
3. Other platforms → call `downloadAndSendMedia` directly
4. Callback (`dl:*`) → read flow state → download → send to chat
