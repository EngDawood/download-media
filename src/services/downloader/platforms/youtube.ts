import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { classifyError, isRetryable, mostPermanent, type FailureKind } from '../failure';
import { parseLinksSection } from '../aio-parser';
import { buildCaption, isUrl } from '../media-helpers';

/** YouTube extraction is the slowest btch operation; give it more headroom than the 8s default. */
const YOUTUBE_TIMEOUT_MS = 20_000;

/**
 * The AIO fallback for YouTube answers "Failed to obtain Cloudflare token" after ~30s or never
 * answers at all, so it is a last-ditch attempt rather than a real second path. Keep it short
 * so a failed primary call does not burn another 20s of the webhook budget on it.
 */
const YOUTUBE_AIO_TIMEOUT_MS = 6_000;

/**
 * Some btch backends answer the youtube endpoint with `{status: true}` and no links.
 * Without this the race is won by whichever backend answered emptiest and fastest.
 */
const hasYoutubeMedia = (data: { mp4?: unknown; mp3?: unknown } | undefined): boolean => isUrl(data?.mp4) || isUrl(data?.mp3);

const stillProcessing = (kind: FailureKind, url?: string): DownloaderResult => ({
	status: 'error',
	error: 'YouTube is still processing this video',
	retryable: true,
	failureKind: kind,
	// A /live/ link that no backend can extract is almost always a broadcast still on air.
	liveStream: url ? isLivePathUrl(url) : undefined,
});

/** Telegram caps bot uploads at 50MB; stay under it so multipart overhead cannot tip us over. */
const MAX_SENDABLE_BYTES = 45 * 1024 * 1024;

/**
 * The extension matching the audio btch actually returned. Its "mp3" field is
 * a vidsnap proxy link wrapping a googlevideo stream — and that stream is
 * usually itag 249 (audio/webm, Opus), not MP3 at all. Telegram's sendAudio
 * accepts only MP3/M4A and rejects WebM outright, so callers need the truth:
 * unwrap the proxy link and read the wrapped stream's mime/itag.
 */
export function youtubeAudioExt(url: string): 'mp3' | 'm4a' | 'webm' | 'opus' {
	try {
		const outer = new URL(url);
		const inner = outer.searchParams.get('u');
		const target = inner ? new URL(inner) : outer;
		const mime = target.searchParams.get('mime') ?? '';
		const itag = target.searchParams.get('itag') ?? '';
		if (mime.includes('webm') || ['249', '250', '251'].includes(itag)) return 'webm';
		if (mime.includes('mp4') || itag === '140') return 'm4a';
		if (mime.includes('mpeg')) return 'mp3';
		const suffix = target.pathname.split('.').pop()?.toLowerCase();
		if (suffix === 'webm' || suffix === 'm4a' || suffix === 'mp3' || suffix === 'opus') return suffix;
	} catch {
		/* not a URL we can read — fall through to the historical default */
	}
	return 'mp3';
}

/**
 * True when a btch link points at a broadcast that is still on air. Live googlevideo
 * streams are segmented (DASH/HLS): fetching one returns a single few-second chunk, so
 * the bot used to deliver a ~30 KB "proxy.m4a" for a live link. Unwrap the vidsnap
 * proxy and read the wrapped stream's markers.
 */
export function isYoutubeLiveStreamUrl(url: string | undefined): boolean {
	if (!url) return false;
	try {
		const outer = new URL(url);
		const inner = outer.searchParams.get('u');
		const target = inner ? new URL(inner) : outer;
		const q = target.searchParams;
		const source = q.get('source') ?? '';
		const path = target.pathname;
		return (
			source.includes('yt_live') ||
			q.get('live') === '1' ||
			q.has('sq') ||
			q.get('noclen') === '1' ||
			/\/(manifest|hls_playlist|hls_variant|dash)\//.test(path) ||
			/\/(sq|live)\/\d/.test(path)
		);
	} catch {
		return false;
	}
}

/** youtube.com/live/<id> is how YouTube shares broadcasts; it stays the URL after the stream ends too. */
const isLivePathUrl = (url: string): boolean => {
	try {
		return /^\/live\//.test(new URL(url).pathname);
	} catch {
		return false;
	}
};

const liveStream = (): DownloaderResult => ({
	status: 'error',
	error: 'YouTube live stream is still on air',
	failureKind: 'unsupported',
	liveStream: true,
});

/** Title → filesystem-safe base name (same sanitising the bot's audio sender applies). */
const audioBaseName = (title?: string): string =>
	(title ?? '')
		// eslint-disable-next-line no-control-regex -- stripping control chars is the point
		.replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 64)
		.trim();

/** The audio item with a filename whose extension tells the truth about the stream. */
const audioItem = (url: string, title?: string): MediaItem => {
	const base = audioBaseName(title);
	return { type: 'audio', url, filename: base ? `${base}.${youtubeAudioExt(url)}` : undefined };
};

/**
 * Pick the best variant Telegram will actually accept.
 * btch lists variants best-first, but the best is routinely far over the upload
 * limit when a lower one would sail through — so prefer the largest variant that
 * still fits. Variants with no reported size keep the old best-first behaviour;
 * if every known size is over the limit we take the smallest, which at least has
 * a chance of being sent.
 */
function pickSendableVideo(videos: MediaItem[]): MediaItem {
	const sized = videos.filter((v): v is MediaItem & { filesize: number } => typeof v.filesize === 'number' && v.filesize > 0);
	if (!sized.length) return videos[0];
	const fitting = sized.filter((v) => v.filesize <= MAX_SENDABLE_BYTES);
	if (fitting.length) return fitting.reduce((best, v) => (v.filesize > best.filesize ? v : best));
	return sized.reduce((smallest, v) => (v.filesize < smallest.filesize ? v : smallest));
}

export class YouTubeProvider implements IDownloaderProvider {
	readonly platforms = ['youtube.com', 'youtu.be', 'music.youtube.com'];

	async download(url: string, mode: DownloaderMode): Promise<DownloaderResult> {
		const failures: FailureKind[] = [];
		try {
			const res = await btchFetch('youtube', url, YOUTUBE_TIMEOUT_MS, hasYoutubeMedia, 'timeout');
			if (isYoutubeLiveStreamUrl(res.mp3) || isYoutubeLiveStreamUrl(res.mp4)) return liveStream();
			const caption = buildCaption(res.title);
			const thumbnail = res.thumbnail;
			if (mode === 'audio' && isUrl(res.mp3))
				return { status: 'success', media: [audioItem(res.mp3, res.title)], caption, title: res.title, thumbnail };
			if (isUrl(res.mp4)) {
				return {
					status: 'success',
					media: [{ type: 'video', url: res.mp4 }],
					caption,
					title: res.title,
					thumbnail,
					mp3Url: isUrl(res.mp3) ? res.mp3 : undefined,
				};
			}
		} catch (e) {
			const kind = classifyError(e);
			failures.push(kind);
			// Every backend empty or too slow means the extraction is not ready yet. The AIO
			// endpoint cannot do better (it fails for YouTube) and its "gone" error would outrank
			// this and turn a retryable miss into "No YouTube media found".
			if (isRetryable(kind)) return stillProcessing(kind, url);
		}

		try {
			const aio = await btchFetch('aio', url, YOUTUBE_AIO_TIMEOUT_MS);
			const data = aio.data;
			if (isYoutubeLiveStreamUrl(aio.mp3) || isYoutubeLiveStreamUrl(aio.mp4)) return liveStream();
			if (data?.links) {
				const caption = buildCaption(data.title);
				const thumbnail = data.thumbnail;
				const audioItems = parseLinksSection(data.links.audio, 'audio');
				const videoItems = parseLinksSection(data.links.video, 'video');
				if ([...audioItems, ...videoItems].some((m) => isYoutubeLiveStreamUrl(m.url))) return liveStream();
				const mp3Url = audioItems[0]?.url;
				if (mode === 'audio') {
					if (audioItems.length)
						return {
							status: 'success',
							media: [{ ...audioItems[0], filename: audioItems[0].filename ?? audioItem(audioItems[0].url, data.title).filename }],
							caption,
							title: data.title,
							thumbnail,
						};
				}
				const videos: MediaItem[] = parseLinksSection(data.links.video, 'video');
				if (videos.length) {
					if (mode !== 'auto' && mode !== 'audio') {
						const match = videos.find((v) => v.quality?.includes(mode));
						if (match) return { status: 'success', media: [match], caption, title: data.title, thumbnail, mp3Url };
					}
					return { status: 'success', media: [pickSendableVideo(videos)], caption, title: data.title, thumbnail, mp3Url };
				}
			}
			// btch AIO for YouTube sometimes returns { mp4, mp3, title } at the top level
			const flatTitle = aio.title || data?.title;
			const flatCaption = buildCaption(flatTitle);
			const flatThumb = aio.thumbnail || data?.thumbnail;
			if (isUrl(aio.mp4)) {
				return {
					status: 'success',
					media: [{ type: 'video', url: aio.mp4 }],
					caption: flatCaption,
					title: flatTitle,
					thumbnail: flatThumb,
					mp3Url: isUrl(aio.mp3) ? aio.mp3 : undefined,
				};
			}
			if (isUrl(aio.mp3)) {
				return {
					status: 'success',
					media: [audioItem(aio.mp3, flatTitle)],
					caption: flatCaption,
					title: flatTitle,
					thumbnail: flatThumb,
				};
			}
		} catch (e) {
			failures.push(classifyError(e)); /* all failed */
		}

		// Most-permanent-wins: if one attempt got a definitive "not found" and the other
		// merely timed out, this is a dead link, not a slow extraction.
		const kind = mostPermanent(failures);
		if (isRetryable(kind)) return stillProcessing(kind, url);
		return { status: 'error', error: 'No YouTube media found', failureKind: kind };
	}
}
