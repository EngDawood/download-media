// D1 app_config keys
export const KV_KEY_REQUIRED_CHANNEL = 'telegram:config:required_channel';
export const KV_KEY_FREE_USES = 'telegram:config:free_uses';
export const FREE_USES_BEFORE_GATE = 5;

// Stats history limits
export const DOWNLOAD_HISTORY_LIMIT = 100;
export const FAILED_DOWNLOAD_LIMIT = 200;

// Telegram Bot API caps bot uploads at 50 MB — the bot and any caller that
// forwards files to Telegram must stay under this.
export const TELEGRAM_UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;
// Default ceiling for the public API / MCP, which hand back links instead of
// uploading to Telegram. Override per-deploy with the API_MAX_FILE_MB var.
export const DEFAULT_API_MAX_FILE_MB = 150;

/**
 * Resolve the max file size (bytes) the public API / MCP may return for one
 * item. Reads the API_MAX_FILE_MB worker var; falls back to 150 MB on any
 * missing or invalid value.
 */
export function apiMaxFileBytes(env: { API_MAX_FILE_MB?: string | number }): number {
	const mb = Number(env.API_MAX_FILE_MB ?? DEFAULT_API_MAX_FILE_MB);
	if (!Number.isFinite(mb) || mb <= 0) return DEFAULT_API_MAX_FILE_MB * 1024 * 1024;
	return Math.floor(mb * 1024 * 1024);
}

// Footer config keys
export const KV_KEY_INSTAGRAM_FOOTER = 'config:footer:instagram';
export const DEFAULT_INSTAGRAM_FOOTER = '📥 @download_media_4bot | 📢 t.me/dawo5d';

// RSSHub Public Instances for Fallbacks
export const RSSHUB_SERVERS = [
	'https://rsshub.rssforever.com',
	'https://hub.slarker.me',
	'https://rsshub.pseudoyu.com',
	'https://rsshub.ktachibana.party',
	'https://rss.owo.nz',
	'https://rsshub.umzzz.com',
	'https://rsshub.isrss.com',
	'https://rsshub-balancer.virworks.moe',
	'https://rss.spriple.org',
	'https://rsshub.cups.moe',
	'https://rss.4040940.xyz',
];
