// Telegram cache key prefixes
export const CACHE_PREFIX_TELEGRAM_STATE = 'telegram:state:';
export const CACHE_PREFIX_USAGE_COUNT = 'telegram:usage:';
export const CACHE_PREFIX_USER_LANG = 'telegram:lang:';
export const KV_KEY_REQUIRED_CHANNEL = 'telegram:config:required_channel';
export const KV_KEY_FREE_USES = 'telegram:config:free_uses';
export const FREE_USES_BEFORE_GATE = 5;

// Stats KV keys
export const KV_KEY_STATS_GLOBAL = 'stats:global';
export const KV_KEY_STATS_DAY_PREFIX = 'stats:day:';
export const KV_KEY_STATS_USER_PREFIX = 'stats:user:';
export const KV_KEY_DOWNLOAD_HISTORY = 'stats:history';
export const KV_KEY_BLOCKED_USERS = 'users:blocked';
export const DOWNLOAD_HISTORY_LIMIT = 100;
export const KV_KEY_FAILED_DOWNLOADS = 'stats:failed';
export const FAILED_DOWNLOAD_LIMIT = 200;
export const CACHE_PREFIX_BLOCKED_URL = 'blocked:url:';
export const CACHE_PREFIX_DOWNLOAD_LOCK = 'telegram:lock:';
export const CACHE_PREFIX_LOCK_PENDING = 'telegram:lock:pending:';
export const CACHE_PREFIX_REPORT = 'report:';
export const CACHE_PREFIX_REPORT_SENT = 'report:sent:';
export const CACHE_PREFIX_REPORT_PENDING = 'report:pending:';
export const KV_KEY_DOMAIN_ALLOWLIST = 'blocked:allowlist';
export const KV_KEY_STATS_STARTED_PREFIX = 'stats:started:';

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
