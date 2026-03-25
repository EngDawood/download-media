import { log } from '../../../utils/logger';
import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { parseAioGallery, parseLinksSection } from '../aio-parser';
import { buildCaption, isUrl, detectMediaType } from '../media-helpers';
import { RSSHUB_SERVERS } from '../../../constants';

// ─── RSSHub Stories (primary for /stories/ URLs) ────────────────────────────

function extractStoryUsername(url: string): string | null {
	const match = url.match(/instagram\.com\/stories\/([^/?]+)/i);
	return match ? match[1] : null;
}

interface RssItem {
	url: string;
	type: 'video' | 'photo';
	thumbnail?: string;
}

// The description is HTML-encoded in the RSS, and the inner media URLs are
// double-encoded (e.g. &amp;amp; in XML → &amp; → & after two decode passes).
function decodeEntities(str: string): string {
	return str
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

function parseDescHtmlRegex(desc: string): RssItem | null {
	const videoSrc = desc.match(/<source\s+src="([^"]+)"/)?.[1];
	if (videoSrc && isUrl(videoSrc)) {
		const poster = desc.match(/<video[^>]+poster="([^"]+)"/)?.[1];
		return { url: videoSrc, type: 'video', thumbnail: poster };
	}
	const imgSrc = desc.match(/<img\s+[^>]*src="([^"]+)"/)?.[1];
	if (imgSrc && isUrl(imgSrc)) return { url: imgSrc, type: 'photo' };
	return null;
}

async function parseDescHtmlRewriter(html: string): Promise<RssItem | null> {
	let videoSrc: string | undefined;
	let poster: string | undefined;
	let imgSrc: string | undefined;

	await new HTMLRewriter()
		.on('source', { element(el) { videoSrc ??= el.getAttribute('src') ?? undefined; } })
		.on('video',  { element(el) { poster ??= el.getAttribute('poster') ?? undefined; } })
		.on('img',    { element(el) { imgSrc ??= el.getAttribute('src') ?? undefined; } })
		.transform(new Response(html, { headers: { 'content-type': 'text/html' } }))
		.arrayBuffer();

	if (videoSrc && isUrl(videoSrc)) return { url: videoSrc, type: 'video', thumbnail: poster };
	if (imgSrc && isUrl(imgSrc))     return { url: imgSrc,   type: 'photo' };
	return null;
}

async function parseRssItems(xml: string): Promise<RssItem[]> {
	const items: RssItem[] = [];
	for (const itemMatch of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
		const itemXml = itemMatch[1];
		const descRaw = itemXml.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '';
		// Two decode passes: XML entities first, then inner HTML attribute encoding
		const desc = decodeEntities(decodeEntities(descRaw));
		const item = parseDescHtmlRegex(desc) ?? await parseDescHtmlRewriter(desc);
		if (item) items.push(item);
	}
	return items;
}

async function fetchStoriesFromServer(server: string, username: string): Promise<DownloaderResult> {
	const res = await fetch(`${server}/picnob.info/user/${username}/stories`, {
		signal: AbortSignal.timeout(10_000),
		headers: { 'User-Agent': 'DownloadMediaBot/1.0' },
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const xml = await res.text();
	const items = await parseRssItems(xml);
	if (items.length === 0) throw new Error('empty feed');
	const media: MediaItem[] = items.map(({ url, type }) => ({ url, type }));
	const thumbnail = items.find(i => i.thumbnail)?.thumbnail;
	return { status: 'success', media, caption: `<a href="https://www.instagram.com/${username}/">@${username}</a> • Stories`, thumbnail };
}

async function tryViaRSSHub(username: string): Promise<DownloaderResult | null> {
	try {
		// Race all servers in parallel — return first success, max wait = 10s
		return await Promise.any(RSSHUB_SERVERS.map(server => fetchStoriesFromServer(server, username)));
	} catch {
		log('warn', 'instagram', 'All RSSHub servers failed for stories', { username });
		return null;
	}
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class InstagramProvider implements IDownloaderProvider {
	readonly platforms = ['instagram.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		// Stories: use RSSHub as primary method (returns all current stories for the user)
		const username = extractStoryUsername(url);
		if (username) {
			const result = await tryViaRSSHub(username);
			if (result) return result;
			return { status: 'error', error: 'Could not fetch stories. The account may be private, have no active stories, or be unknown to the service.' };
		}

		// Non-story posts: btch AIO → btch igdl
		try {
			const res = await btchFetch('aio', url, true);
			const data = res.data;
			if (data) {
				const media: MediaItem[] = [];
				if (data.gallery?.items?.length > 0) media.push(...parseAioGallery(data.gallery.items));
				if (media.length === 0 && data.links) media.push(...parseLinksSection(data.links.video, 'video'));
				if (media.length > 0) {
					return { status: 'success', media, caption: buildCaption(data.title), thumbnail: data.thumbnail };
				}
			}
		} catch { /* fall through to igdl */ }

		const res = await btchFetch('igdl', url, true);
		const items = Array.isArray(res) ? res : Array.isArray(res.result) ? res.result : null;
		if (items?.length > 0 && isUrl(items[0]?.url)) {
			return {
				status: 'success',
				media: items.filter((i: any) => isUrl(i.url)).map((i: any) => ({ type: detectMediaType(i.url), url: i.url })),
				caption: '',
				thumbnail: items[0]?.thumbnail,
			};
		}
		return { status: 'error', error: 'No Instagram media found' };
	}
}
