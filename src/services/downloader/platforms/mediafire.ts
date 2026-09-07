import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { classifyError, mostPermanent, type FailureKind } from '../failure';
import { isUrl } from '../media-helpers';

const TYPE_ICON: Record<MediaItem['type'], string> = {
	video: '🎬',
	audio: '🎵',
	photo: '🖼',
	document: '📄',
};

/** btch reports size as a formatted string ("45.86 MB") rather than raw bytes. */
function parseHumanSize(text: unknown): number | undefined {
	if (typeof text !== 'string') return undefined;
	const match = text.match(/([\d.]+)\s*(KB|MB|GB)/i);
	if (!match) return undefined;
	const value = parseFloat(match[1]);
	const unit = match[2].toUpperCase();
	const multiplier = unit === 'GB' ? 1024 ** 3 : unit === 'MB' ? 1024 ** 2 : 1024;
	return Math.round(value * multiplier);
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * MediaFire file host. btch's dedicated endpoint resolves the share page straight to
 * the CDN download URL — files are arbitrary (apk, zip, pdf, media, …), so the media
 * type is derived from the reported mimetype rather than assumed to be a document.
 */
export class MediaFireProvider implements IDownloaderProvider {
	readonly platforms = ['mediafire.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		const failures: FailureKind[] = [];
		try {
			const res = await btchFetch('mediafire', url);
			if (isUrl(res.url)) {
				const mimetype = (res.mimetype || '').toLowerCase();
				const type: MediaItem['type'] = mimetype.startsWith('video/')
					? 'video'
					: mimetype.startsWith('audio/')
						? 'audio'
						: mimetype.startsWith('image/')
							? 'photo'
							: 'document';
				const filename = typeof res.filename === 'string' ? res.filename : undefined;
				const filesize = parseHumanSize(res.filesizeH || res.filesize);
				return {
					status: 'success',
					media: [{ type, url: res.url, filename, filesize }],
					title: filename,
					caption: `${TYPE_ICON[type]} <b>${escapeHtml(filename ?? 'MediaFire file')}</b>${res.filesizeH ? `\n${res.filesizeH}` : ''}`,
				};
			}
		} catch (e) {
			failures.push(classifyError(e));
		}
		return { status: 'error', error: 'No MediaFire file found', failureKind: mostPermanent(failures) };
	}
}
