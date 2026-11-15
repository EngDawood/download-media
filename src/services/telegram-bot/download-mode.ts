/**
 * Per-user preferred download type. 'video' is the default — the bot behaves
 * exactly as before until a user picks 'mp3' with /mode.
 */
import type { DownloadMode } from '../../utils/db';

/**
 * The downloader mode for a link, from the user's preference.
 *
 * Only YouTube and TikTok return a real audio track in 'audio' mode; their
 * providers fall back to video themselves when a link has no audio, so the
 * preference is "mp3 if available, else video". SoundCloud and Spotify are
 * audio-only services and always resolve to 'audio'. Every other platform
 * ignores the audio mode in its provider, so the preference stays 'auto'
 * there — asking for audio would only mislabel the status message.
 */
export function resolveDownloadMode(preference: DownloadMode | null | undefined, platform: string): 'auto' | 'audio' {
	if (platform === 'SoundCloud' || platform === 'Spotify') return 'audio';
	if (preference === 'mp3' && (platform === 'YouTube' || platform === 'TikTok')) return 'audio';
	return 'auto';
}
