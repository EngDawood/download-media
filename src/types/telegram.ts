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
	action: 'downloading_media';
	context?: {
		downloadUrl?: string;
		downloadPlatform?: string;
		/** Available video qualities for YouTube picker */
		qualities?: Array<{ quality: string; url: string; size?: string }>;
		/** Cached caption from quality fetch */
		downloadCaption?: string;
		/** Direct CDN media URL that Telegram rejected (for dl:confirm fallback) */
		directMediaUrl?: string;
		/** YouTube mp3 URL for audio button after video send */
		mp3Url?: string;
	};
}

// Formatted Telegram media message
export interface TelegramMediaMessage {
	type: 'photo' | 'video' | 'audio' | 'mediagroup' | 'text';
	url?: string;
	thumbnailUrl?: string;
	caption: string;
	media?: Array<{
		type: 'photo' | 'video';
		media: string;
		caption?: string;
		parse_mode?: string;
	}>;
}
