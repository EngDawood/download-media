import { BOT_URL } from './layout';
import { SITE_COPY, localePath, type SiteLocale } from './copy';

/**
 * Platforms with dedicated extractors. Slugs are Simple Icons names.
 * The wall is logos only, so `alt` carries the platform name: it is what a screen
 * reader announces and the only text a crawler can read out of this section.
 */
const PLATFORMS: Array<{ slug: string; en: string; ar: string }> = [
	{ slug: 'tiktok', en: 'TikTok', ar: 'تيك توك' },
	{ slug: 'instagram', en: 'Instagram', ar: 'انستقرام' },
	{ slug: 'x', en: 'X', ar: 'إكس (تويتر)' },
	{ slug: 'youtube', en: 'YouTube', ar: 'يوتيوب' },
	{ slug: 'facebook', en: 'Facebook', ar: 'فيسبوك' },
	{ slug: 'threads', en: 'Threads', ar: 'ثريدز' },
	{ slug: 'soundcloud', en: 'SoundCloud', ar: 'ساوندكلاود' },
	{ slug: 'spotify', en: 'Spotify', ar: 'سبوتيفاي' },
	{ slug: 'pinterest', en: 'Pinterest', ar: 'بنترست' },
	{ slug: 'github', en: 'GitHub', ar: 'غيت هب' },
];

/**
 * Logos come from the Simple Icons CDN rather than hand drawn paths. The two colour
 * segments make the CDN embed its own prefers-color-scheme rule inside the SVG, which
 * is why the site follows the system theme instead of offering a manual toggle.
 */
function logoWall(locale: SiteLocale): string {
	const items = PLATFORMS.map(
		(p) =>
			`<li><img src="https://cdn.simpleicons.org/${p.slug}/4a4741/a9a69b" alt="${p[locale]}" width="24" height="24" loading="lazy" decoding="async"></li>`,
	).join('');
	return `<ul class="logos" role="list">${items}</ul>`;
}

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

export function renderHome(locale: SiteLocale): string {
	const t = SITE_COPY[locale].home;
	const cta = SITE_COPY[locale].cta;
	const docsHref = localePath(locale, 'docs');

	return `
<section class="hero wrap">
	<div class="hero__grid">
		<div class="hero__body">
			<h1>${t.headline[0]}<br>${t.headline[1]}</h1>
			<p>${t.sub}</p>
			<div class="hero__cta">
				<a class="btn btn--primary" href="${BOT_URL}" rel="noopener">${cta.telegram}</a>
				<a class="btn btn--ghost" href="${docsHref}">${cta.docs}</a>
			</div>
		</div>
	</div>
</section>

<section class="section section--tight" id="platforms">
	<div class="wrap">
		<p class="lead narrow platforms__lead">${t.platformsLead}</p>
		${logoWall(locale)}
	</div>
</section>

<section class="section">
	<div class="wrap">
		<div class="section__head">
			<h2>${t.whatHead}</h2>
			<p>${t.whatSub}</p>
		</div>
		<div class="grid-2">
			${t.capabilities.map(({ title, body }) => `<div><h3>${title}</h3><p>${body}</p></div>`).join('')}
		</div>
	</div>
</section>

<section class="section" id="developers">
	<div class="wrap split">
		<div>
			<h2>${t.devHead}</h2>
			<p class="muted stack-md">${t.devBody}</p>
			<p class="stack-lg"><a href="${docsHref}">${t.devLink}</a></p>
		</div>
		<div>
			<pre class="code"><span class="code__label">${t.labelRequest}</span><code>${CURL_SAMPLE}</code></pre>
			<pre class="code"><span class="code__label">${t.labelResponse}</span><code>${RESPONSE_SAMPLE}</code></pre>
		</div>
	</div>
</section>

<section class="section">
	<div class="wrap narrow">
		<h2>${t.knowHead}</h2>
		<p class="muted stack-md">${t.knowBody}</p>
		<p class="note stack-lg"><strong>${t.noteStrong}</strong> ${t.noteBody}</p>
	</div>
</section>
`;
}
