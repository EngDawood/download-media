import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { log } from '../../../utils/logger';
import { btchFetch } from '../btch-client';
import { classifyError, mostPermanent, type FailureKind } from '../failure';
import { BROWSER_UA, buildCaption, isUrl, metaContent } from '../media-helpers';

const decodeAmp = (s?: string) => s?.replace(/&amp;/g, '&');

/** The template page carries its signed CDN video and cover as og:video:url / og:image — no cookies needed. */
async function tryDirect(url: string): Promise<DownloaderResult | null> {
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' },
			redirect: 'follow',
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return null;

		const html = await res.text();
		const video = decodeAmp(metaContent(html, 'og:video:url') ?? metaContent(html, 'og:video'));
		if (!isUrl(video)) return null;
		const cover = decodeAmp(metaContent(html, 'og:image'));
		const title = metaContent(html, 'og:title')
			?.replace(/^CapCut template:\s*/i, '')
			.trim();
		// A removed template still serves a placeholder video, with an empty title.
		if (!title) return null;
		return {
			status: 'success',
			media: [{ type: 'video', url: video }],
			caption: buildCaption(title),
			thumbnail: isUrl(cover) ? cover : undefined,
		};
	} catch (e) {
		log('warn', 'downloader:CapCut', 'direct fetch failed', { error: (e as Error).message });
		return null;
	}
}

/** CapCut template shares — read straight from the page, with btch resolving the CDN URL if that fails. */
export class CapCutProvider implements IDownloaderProvider {
	readonly platforms = ['capcut.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		const direct = await tryDirect(url);
		if (direct) return direct;

		const failures: FailureKind[] = [];
		try {
			const res = await btchFetch('capcut', url);
			if (isUrl(res.originalVideoUrl)) {
				return {
					status: 'success',
					media: [{ type: 'video', url: res.originalVideoUrl }],
					caption: buildCaption(res.title),
					thumbnail: isUrl(res.coverUrl) ? res.coverUrl : undefined,
				};
			}
		} catch (e) {
			failures.push(classifyError(e));
		}
		return { status: 'error', error: 'No CapCut video found', failureKind: mostPermanent(failures) };
	}
}
