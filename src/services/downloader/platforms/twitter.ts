import { log } from '../../../utils/logger';
import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { buildCaption, isUrl, detectMediaType } from '../media-helpers';

async function fetchTwitterFullCaption(url: string): Promise<string> {
	try {
		const resp = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`);
		if (!resp.ok) return '';
		const data = await resp.json() as { html?: string };
		if (!data.html) return '';
		const match = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/);
		if (!match) return '';
		return match[1]
			.replace(/<a[^>]*>([^<]*)<\/a>/g, '$1')
			.replace(/<[^>]+>/g, '')
			.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
			.trim();
	} catch { return ''; }
}

function pickBestVideo(result: DownloaderResult, caption?: string): DownloaderResult | null {
	if (!result?.media) return null;
	const videos = result.media.filter(m => m.type === 'video');
	const base = videos.length > 0 ? { ...result, media: [videos[0]] } : result;
	return caption ? { ...base, caption } : base;
}

async function tryViaBtch(url: string, caption?: string): Promise<DownloaderResult | null> {
	try {
		const res = await btchFetch('twitter', url, true);
		const cap = caption ?? buildCaption(res.title);
		const thumb = isUrl(res.thumbnail) ? res.thumbnail : undefined;
		const media: MediaItem[] = [];
		if (Array.isArray(res.url) && res.url.length > 0) {
			for (const item of res.url) {
				if (typeof item === 'object' && item !== null && Object.keys(item).length > 0) {
					const u = isUrl(item.hd) ? item.hd : isUrl(item.sd) ? item.sd : null;
					if (u) media.push({ type: detectMediaType(u), url: u });
				} else if (typeof item === 'string' && isUrl(item)) {
					media.push({ type: detectMediaType(item), url: item });
				}
			}
		}
		if (!media.length && isUrl(res.url)) media.push({ type: detectMediaType(res.url), url: res.url });
		if (!media.length && Array.isArray(res.images)) {
			res.images
				.filter((img: any) => isUrl(typeof img === 'string' ? img : img?.url))
				.forEach((img: any) => media.push({ type: 'photo', url: typeof img === 'string' ? img : img.url }));
		}
		if (!media.length && isUrl(res.image)) media.push({ type: 'photo', url: res.image });
		if (media.length) return { status: 'success', media: [media[0]], caption: cap, thumbnail: thumb };
	} catch (e) { log('warn', 'downloader:Twitter', 'btch failed', { error: (e as Error).message }); }
	return null;
}

async function tryViaFxTwitter(url: string, caption?: string): Promise<DownloaderResult | null> {
	try {
		const match = url.match(/(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/i);
		if (!match) return null;
		const fxRes = await fetch(`https://api.fxtwitter.com/i/status/${match[2]}`, {
			headers: { 'User-Agent': 'DownloadMediaBot/1.0' },
			signal: AbortSignal.timeout(10_000),
		});
		if (fxRes.status === 401) return { status: 'error', error: 'This tweet is from a private account and cannot be downloaded.' };
		if (fxRes.status === 404) return { status: 'error', error: 'This tweet no longer exists or has been deleted.' };
		if (!fxRes.ok) return null;
		const data: any = await fxRes.json();
		const cap = caption ?? (data.tweet.text ? `<b>${data.tweet.text}</b>` : '');
		const avatar = data.tweet.author?.avatar_url;
		if (data.tweet?.media?.all?.length > 0) {
			return {
				status: 'success',
				media: data.tweet.media.all.map((m: any) => ({
					type: (m.type === 'video' || m.type === 'gif') ? 'video' as const : 'photo' as const,
					url: m.url,
				})),
				caption: cap, thumbnail: avatar,
			};
		}
		if (cap) return { status: 'success', media: avatar ? [{ type: 'photo', url: avatar }] : [], caption: cap, thumbnail: avatar };
	} catch (e) { log('warn', 'downloader:Twitter', 'fxtwitter failed', { error: (e as Error).message }); }
	return null;
}

export class TwitterProvider implements IDownloaderProvider {
	readonly platforms = ['twitter.com', 'x.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		const [aioSettled, textSettled] = await Promise.allSettled([tryAIO(url), fetchTwitterFullCaption(url)]);
		const aio = aioSettled.status === 'fulfilled' ? aioSettled.value : null;
		const caption = textSettled.status === 'fulfilled' && textSettled.value ? `<b>${textSettled.value}</b>` : undefined;
		return (
			(aio ? pickBestVideo(aio, caption) : null) ??
			await tryViaBtch(url, caption) ??
			await tryViaFxTwitter(url, caption) ??
			{ status: 'error', error: 'No Twitter media found' }
		);
	}
}
