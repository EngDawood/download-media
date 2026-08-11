import { BOT_URL } from './layout';

/** Platforms with dedicated extractors. Slugs are Simple Icons names. */
const PLATFORMS: Array<{ slug: string; name: string }> = [
	{ slug: 'tiktok', name: 'TikTok' },
	{ slug: 'instagram', name: 'Instagram' },
	{ slug: 'x', name: 'X' },
	{ slug: 'youtube', name: 'YouTube' },
	{ slug: 'facebook', name: 'Facebook' },
	{ slug: 'threads', name: 'Threads' },
	{ slug: 'soundcloud', name: 'SoundCloud' },
	{ slug: 'spotify', name: 'Spotify' },
	{ slug: 'pinterest', name: 'Pinterest' },
	{ slug: 'github', name: 'GitHub' },
];

/**
 * Logos come from the Simple Icons CDN rather than hand drawn paths. The two colour
 * segments make the CDN embed its own prefers-color-scheme rule inside the SVG, which
 * is why the site follows the system theme instead of offering a manual toggle.
 */
function logoWall(): string {
	const items = PLATFORMS.map(
		({ slug, name }) =>
			`<li><img src="https://cdn.simpleicons.org/${slug}/4a4741/a9a69b" alt="${name}" width="24" height="24" loading="lazy" decoding="async"></li>`,
	).join('');
	return `<ul class="logos" role="list">${items}</ul>`;
}

const CAPABILITIES: Array<{ title: string; body: string }> = [
	{
		title: 'Video without the watermark',
		body: 'TikTok comes back clean. Everything else comes back at the best quality the platform exposes.',
	},
	{
		title: 'Audio on its own',
		body: 'Pull the track out of a YouTube video, a TikTok, a SoundCloud upload, or a Spotify link.',
	},
	{
		title: 'Whole galleries, not the first frame',
		body: 'Carousels, albums, and photo slideshows return every item in the post.',
	},
	{
		title: 'Instagram stories by username',
		body: 'Send <code>/story</code> with a handle and the current stories arrive as albums.',
	},
	{
		title: 'Long reads stay readable',
		body: 'X articles and self-reply threads are published to Telegraph so the full text is actually reachable.',
	},
	{
		title: 'English and Arabic',
		body: 'The bot picks the language from your Telegram client, and <code>/lang</code> changes it.',
	},
];

const CURL_SAMPLE = `curl -X POST https://dl.engdawood.com/api/download \\
  -H "X-API-Key: $PUBLIC_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://www.tiktok.com/@user/video/123"}'`;

const RESPONSE_SAMPLE = `{
  "status": "success",
  "platform": "TikTok",
  "media": [
    {
      "type": "video",
      "url": "https://...",
      "quality": "720p",
      "filesize": 1048576
    }
  ],
  "caption": "original post text"
}`;

export function renderHome(): string {
	return `
<section class="hero wrap">
	<div class="hero__grid">
		<div class="hero__body">
			<h1>Paste a link.<br>Get the file.</h1>
			<p>A Telegram bot that pulls video, photo, and audio off ten platforms. No ads, no watermarks, no signup.</p>
			<div class="hero__cta">
				<a class="btn btn--primary" href="${BOT_URL}" rel="noopener">Open in Telegram</a>
				<a class="btn btn--ghost" href="/docs">Read the docs</a>
			</div>
		</div>
	</div>
</section>

<section class="section section--tight" id="platforms">
	<div class="wrap">
		<p class="lead narrow" style="margin-bottom: 1.75rem;">Ten platforms have a dedicated extractor. Any other link is still attempted through a generic fallback.</p>
		${logoWall()}
	</div>
</section>

<section class="section">
	<div class="wrap">
		<div class="section__head">
			<h2>What comes back</h2>
			<p>Send the link, get the media. The bot works out the platform, the type, and the best available quality on its own.</p>
		</div>
		<div class="grid-2">
			${CAPABILITIES.map(({ title, body }) => `<div><h3>${title}</h3><p>${body}</p></div>`).join('')}
		</div>
	</div>
</section>

<section class="section" id="developers">
	<div class="wrap split">
		<div>
			<h2>Same pipeline, over HTTP</h2>
			<p class="muted" style="margin-top: 1rem;">
				The downloader is also a REST endpoint and an MCP server, so scripts and AI agents can use it
				without going through Telegram. Both return links, never file bytes, and both stay disabled
				until the operator sets an API key.
			</p>
			<p style="margin-top: 1.5rem;"><a href="/docs">Read the full reference</a></p>
		</div>
		<div>
			<pre class="code"><span class="code__label">Request</span><code>${CURL_SAMPLE}</code></pre>
			<pre class="code"><span class="code__label">Response</span><code>${RESPONSE_SAMPLE}</code></pre>
		</div>
	</div>
</section>

<section class="section">
	<div class="wrap narrow">
		<h2>Worth knowing before you start</h2>
		<p class="muted" style="margin-top: 1rem;">
			Media links are handed back as direct URLs from the source platform. They are usually signed and
			short lived, so save the file when you get it rather than storing the link. Anything over Telegram's
			50 MB upload ceiling arrives as a link instead of a file, and adult domains are refused outright.
		</p>
		<p class="note" style="margin-top: 1.75rem;">
			<strong>This is a personal project.</strong> There is no uptime promise and no quota, and the
			downloads lean on external backends that occasionally go down. If a link fails, try it again in a minute.
		</p>
	</div>
</section>
`;
}
