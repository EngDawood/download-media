// Format settings for controlling Telegram message appearance
export interface FormatSettings {
	notification: 'normal' | 'muted';
	media: 'enable' | 'disable' | 'only_media';
	author: 'enable' | 'disable';
	sourceFormat: 'title_link' | 'link_only' | 'bare_url' | 'disable';
	linkPreview: 'enable' | 'disable';
	lengthLimit: number; // 0 = unlimited, or 256/512/1024
}

// Admin conversation state for multi-step flows
export interface AdminState {
	action: 'downloading_media' | 'awaiting_broadcast' | 'awaiting_story_username';
	context?: {
		downloadUrl?: string;
		downloadPlatform?: string;
		/**
		 * Renditions offered by the quality picker. `url` is present when the provider already
		 * extracted the rendition (YouTube, X); when it is absent the rung is unresolved and
		 * `mode` says how to re-run the original link to get it (Facebook, where every
		 * rendition costs another extractor call).
		 */
		qualities?: Array<{ quality: string; url?: string; size?: string; mode?: 'auto' | 'audio' | 'hd' | 'sd' }>;
		/** Cached caption from quality fetch */
		downloadCaption?: string;
		/** YouTube mp3 URL for audio button after video send */
		mp3Url?: string;
		/** Raw title of the pending media, so the mp3 button can name the audio file */
		mediaTitle?: string;
		/** Pending broadcast message text */
		broadcastMessage?: string;
		/** Download mode stored for retry button */
		downloadMode?: 'auto' | 'audio' | 'hd' | 'sd';
		/** Alternate rendering offered after the send (Google Docs/Slides → PDF) */
		altFormat?: { label: string; url: string; filename: string };
	};
}

// Formatted Telegram media message
export interface TelegramMediaMessage {
	type: 'photo' | 'video' | 'audio' | 'document' | 'mediagroup' | 'text';
	url?: string;
	buffer?: Uint8Array; // in-memory binary (used instead of url for document uploads)
	filename?: string;
	/** Measured byte size, when known — lets the sender skip a URL pass-through that is certain to fail. */
	filesize?: number;
	thumbnailUrl?: string;
	/** Track title — shown by Telegram as the audio name instead of the raw filename. */
	title?: string;
	caption: string;
	media?: Array<{
		type: 'photo' | 'video';
		media: string;
		caption?: string;
		parse_mode?: string;
	}>;
}
