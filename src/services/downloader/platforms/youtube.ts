import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { cobaltFetch, cobaltQualityOf } from '../cobalt-client';
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

const stillProcessing = (kind: FailureKind): DownloaderResult => ({
	status: 'error',
	error: 'YouTube is still processing this video',
	retryable: true,
	failureKind: kind,
});

/** Telegram caps bot uploads at 50MB; stay under it so multipart overhead cannot tip us over. */
const MAX_SENDABLE_BYTES = 45 * 1024 * 1024;

/** Heights the quality picker can offer, best first. */
const QUALITY_RUNGS = [2160, 1440, 1080, 720, 480, 360, 240, 144] as const;

/** Default rendition for a plain video request: sharp enough to look right, small enough for Telegram. */
const DEFAULT_VIDEO_HEIGHT = 720;

/** cobalt processes on its side (ffmpeg remux / MP3 conversion), so it gets more room than a btch race. */
const COBALT_TIMEOUT_MS = 25_000;

/** The ladder probe only reads a filename, never a download — a short cap keeps it cheap. */
const COBALT_LADDER_TIMEOUT_MS = 5_000;

/** "Title (720p, h264).mp4" / "Title.mp3" → "Title". cobalt puts the title only in the filename. */
const titleFromCobaltFilename = (filename?: string): string | undefined => {
	if (!filename) return undefined;
	const title = filename
		.replace(/\.[a-z0-9]+$/i, '')
		.replace(/\s*\(\d{3,4}p, [^)]+\)$/, '')
		.trim();
	return title || undefined;
};

/**
 * The picker's rungs for a cobalt delivery: every rung up to the best quality the
 * video really has, except the one already sent, plus the MP3 as the last rung.
 * Rungs are unresolved — tapping one re-runs the download in that rung's mode.
 */
const cobaltAltQualities = (delivered: number, maxKnown: number): NonNullable<DownloaderResult['altQualities']> => [
	...QUALITY_RUNGS.filter((h) => h <= maxKnown && h !== delivered).map((h) => ({
		label: `${h}p`,
		mode: `${h}` as DownloaderMode,
	})),
	{ label: 'MP3', mode: 'audio' as DownloaderMode },
];

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

	/**
	 * cobalt is the default backend: it converts on its side, so audio comes back
	 * as a real MP3 (Telegram's sendAudio accepts nothing else) and video as a
	 * clean h264 MP4 at a chosen height. Any failure throws and the caller falls
	 * through to the btch chain unchanged.
	 */
	private async viaCobalt(url: string, mode: DownloaderMode): Promise<DownloaderResult> {
		if (mode === 'audio') {
			const media = await cobaltFetch(url, { downloadMode: 'audio', audioFormat: 'mp3', audioBitrate: '128' }, COBALT_TIMEOUT_MS);
			const title = titleFromCobaltFilename(media.filename);
			return {
				status: 'success',
				media: [{ type: 'audio', url: media.url, filename: media.filename }],
				caption: buildCaption(title),
				title,
			};
		}

		const explicit = mode === 'hd' ? 1080 : mode === 'sd' ? 480 : mode === 'auto' ? null : parseInt(mode, 10);
		if (explicit !== null) {
			const media = await cobaltFetch(url, { videoQuality: String(explicit), youtubeVideoCodec: 'h264' }, COBALT_TIMEOUT_MS);
			const delivered = cobaltQualityOf(media.filename) ?? explicit;
			const title = titleFromCobaltFilename(media.filename);
			return {
				status: 'success',
				media: [{ type: 'video', url: media.url, filename: media.filename, quality: `${delivered}p` }],
				caption: buildCaption(title),
				title,
				altQualities: cobaltAltQualities(delivered, delivered),
			};
		}

		// 'auto': fetch the delivery rendition first. The old max-first probe
		// let the slow liubquanti relay time out on its 8.3s slice while rue
		// answered in ~1s — and rue's tunnels were empty for some videos
		// (November 13, 2026), so the fast answer won and the bot sent 0 bytes.
		// The ladder is learned afterwards from a cheap max probe whose URL is
		// discarded; only its filename matters, so the probe skips the bytes
		// check and a failed probe just means rungs up to the delivered height.
		const delivery = await cobaltFetch(url, { videoQuality: String(DEFAULT_VIDEO_HEIGHT), youtubeVideoCodec: 'h264' }, COBALT_TIMEOUT_MS);
		const delivered = cobaltQualityOf(delivery.filename) ?? DEFAULT_VIDEO_HEIGHT;
		const title = titleFromCobaltFilename(delivery.filename);
		let max = delivered;
		if (delivered >= DEFAULT_VIDEO_HEIGHT) {
			try {
				const ladder = await cobaltFetch(url, { videoQuality: 'max', youtubeVideoCodec: 'h264' }, COBALT_LADDER_TIMEOUT_MS, undefined, {
					verifyBytes: false,
				});
				max = cobaltQualityOf(ladder.filename) ?? delivered;
			} catch {
				/* Ladder unknown — offer rungs up to what was delivered. */
			}
		}
		return {
			status: 'success',
			media: [{ type: 'video', url: delivery.url, filename: delivery.filename, quality: `${delivered}p` }],
			caption: buildCaption(title),
			title,
			altQualities: cobaltAltQualities(delivered, max),
		};
	}

	async download(url: string, mode: DownloaderMode): Promise<DownloaderResult> {
		const failures: FailureKind[] = [];
		try {
			return await this.viaCobalt(url, mode);
		} catch (e) {
			failures.push(classifyError(e));
		}

		try {
			const res = await btchFetch('youtube', url, YOUTUBE_TIMEOUT_MS, hasYoutubeMedia, 'timeout');
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
			if (isRetryable(kind)) return stillProcessing(kind);
		}

		try {
			const aio = await btchFetch('aio', url, YOUTUBE_AIO_TIMEOUT_MS);
			const data = aio.data;
			if (data?.links) {
				const caption = buildCaption(data.title);
				const thumbnail = data.thumbnail;
				const audioItems = parseLinksSection(data.links.audio, 'audio');
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
		if (isRetryable(kind)) return stillProcessing(kind);
		return { status: 'error', error: 'No YouTube media found', failureKind: kind };
	}
}
