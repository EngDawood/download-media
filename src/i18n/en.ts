export const en = {
	// --- /start command (admin) ---
	'start.admin.greeting': 'Hi {firstName}! 👋\n\n',
	'start.admin.body':
		'<b>Media Download Bot — Admin</b>\n\n' +
		'Send any supported URL to download media.\n\n' +
		'<b>Platforms:</b>\n' +
		'• YouTube — Auto-download video (🎵 MP3 button after)\n' +
		'• TikTok — Video/Audio picker (slideshows auto-download)\n' +
		'• Facebook — HD/SD picker when available\n' +
		'• Instagram — Auto-download\n' +
		'• X / Twitter — Auto-download\n' +
		'• Threads — Auto-download\n' +
		'• SoundCloud — Audio\n' +
		'• Spotify — Audio\n' +
		'• Pinterest — Auto-download\n\n' +
		'<b>Admin commands:</b>\n' +
		'/setchannel @username — Set subscription channel\n' +
		'/stats — View usage statistics\n' +
		'/lang — Change bot language\n' +
		'/cancel — Cancel current action\n' +
		'/block {userId} — Block a user\n' +
		'/unblock {userId} — Unblock a user\n' +
		'/allowlist — Manage whitelisted domains\n' +
		'/help — Full details',

	// --- /start command (guest) ---
	'start.guest.body':
		'<b>Media Download Bot</b>\n\n' +
		"Send a URL from any supported platform and I'll download the media for you.\n\n" +
		'<b>Supported:</b> TikTok, Instagram, X/Twitter, YouTube, Facebook, Threads, SoundCloud, Spotify, Pinterest\n',
	'start.guest.channel_line': '\n⚡ <b>{freeUses} free downloads</b> — then join {channel} to keep going.\n',
	'start.guest.help_hint': '\n/help — More info',

	// --- /help command (admin) ---
	'help.admin.body':
		'<b>How to use — Admin</b>\n\n' +
		'Send any supported URL. TikTok and Facebook show quality pickers; all others auto-download.\n\n' +
		'• <b>YouTube</b> — Auto-downloads video, offers 🎵 MP3 button\n' +
		'• <b>TikTok</b> — Video/Audio (slideshows skip the picker)\n' +
		'• <b>Facebook</b> — HD/SD when multiple qualities available\n' +
		'• Large files (&gt;50MB) show the direct URL to download manually\n\n' +
		'<b>Admin commands:</b>\n' +
		'<code>/setchannel @username</code> — Require users to join a channel after {freeUses} free downloads. Bot must be admin in that channel.\n' +
		'<code>/stats</code> — View bot usage statistics.\n' +
		'<code>/lang</code> — Change bot language.\n' +
		'<code>/cancel</code> — Cancel the current download flow.\n' +
		'<code>/block {userId}</code> — Block a user from using the bot.\n' +
		'<code>/unblock {userId}</code> — Restore access for a user.\n' +
		'<code>/allowlist</code> — View and remove whitelisted domains.',

	// --- /help command (guest) ---
	'help.guest.body':
		'<b>How to use</b>\n\n' +
		'Send a URL and the bot downloads it for you.\n' +
		'Large files (&gt;50MB) show the direct URL to download manually.',
	'help.guest.free_tier': '\n<b>Free tier:</b> {freeUses} downloads — then join {channel} to keep using the bot.',
	'help.name_prefix': "{firstName}, here's how it works:\n\n",

	// --- /cancel ---
	'cancel.done': 'Action cancelled.',

	// --- text-input-handler ---
	'input.no_action': 'No active action. Send a supported URL to download media.',
	'input.fetching_post': 'Fetching post info...',
	'input.fetching_video': 'Fetching video info...',
	'input.choose_format': '<b>{platform}</b> — Choose format:',
	'input.choose_quality': '<b>{platform}</b> — Choose quality:',
	'input.btn_video': 'Video',
	'input.btn_audio': 'Audio',

	// --- download-and-send ---
	'download.status': 'Downloading {modeText} from {platform}...',
	'download.mode_audio': 'audio',
	'download.mode_media': 'media',
	'download.done': 'Done.',
	'download.done_info': 'Done. ({info})',
	'download.sent_album': 'Sent {count} items as album.',
	'download.failed': 'Download failed: {error}',
	'download.no_media': 'No media found.',
	'download.error': 'Error: {message}',
	'download.too_large': '😔 This file is too large for Telegram.',
	'download.too_large_name': '😔 Sorry {firstName}, this file is too large for Telegram.',
	'download.too_large_limit': '😔 This file is too large for Telegram (50MB limit).',
	'download.too_large_limit_name': '😔 Sorry {firstName}, this file is too large for Telegram (50MB limit).',
	'download.copy_url_hint': 'Copy the URL below, then send the link to @urluploadxbot',
	'download.btn_urluploadxbot': '🤖 Open @urluploadxbot',
	'download.btn_browser': '🌐 Open in Browser',
	'download.btn_mp3': '🎵 MP3',

	// --- callbacks ---
	'callback.session_expired': 'Session expired. Send the link again.',
	'callback.cancelled': 'Cancelled.',

	// --- subscription gate ---
	'gate.blocked':
		"🔒 You've used your {freeUses} free downloads\\!\n\n" +
		'Join our channel to keep downloading:\n' +
		'👉 [t\\.me/{channelName}](https://t.me/{channelName})',
	'gate.btn_join': '📢 Join Channel',
	'gate.btn_verify': '✅ I Joined',

	// --- subscription callbacks ---
	'gate.access_granted_alert': '✅ Access granted!',
	'gate.welcome_alert': '✅ Welcome! You can now use the bot.',
	'gate.subscribed':
		"✅ *Access granted\\!*\n\nYou're subscribed to [{channel}](https://t.me/{channelName})\\.\nSend a URL to download media\\.",
	'gate.not_joined': "⚠️ You haven't joined yet. Please join the channel first!",
	'gate.verify_failed': '⚠️ Verification failed. Try again.',

	// --- bot-factory errors ---
	'error.callback': '⚠️ Error occurred. Please try again.',
	'error.general': '⚠️ An unexpected error occurred. Please try again.',
	'error.unauthorized': 'Unauthorized',

	// --- admin commands ---
	'setchannel.usage': 'Usage: /setchannel @channelname',
	'setchannel.bot_info_fail': '⚠️ Could not get bot info. Try again.',
	'setchannel.not_admin':
		"⚠️ I'm in *{channel}* but I'm not an administrator there\\.\n\n" +
		'Please promote me to admin in the channel, then try again\\.',
	'setchannel.not_found':
		"❌ Could not find channel *{channel}* or I don't have access\\.\n\n" +
		'Make sure:\n' +
		'1\\. The channel exists\n' +
		'2\\. You added me as an administrator',
	'setchannel.success':
		'✅ Required channel set to [{channel}](https://t.me/{channelName})\\.\n\n' +
		'Users will need to join it after {freeUses} free downloads\\.',

	// --- /lang command ---
	'lang.current': '🌐 Current language: <b>{language}</b>',
	'lang.pick': 'Choose your language:',
	'lang.changed': '✅ Language changed to <b>{language}</b>.',

	// --- /stats command (admin only) ---
	'stats.header': '📊 <b>Bot Statistics</b>',
	'stats.links': '📥 Links submitted: <b>{count}</b>',
	'stats.success': '✅ Successful: <b>{count}</b>',
	'stats.errors': '❌ Errors: <b>{count}</b>',
	'stats.users': '👥 Unique users: <b>{count}</b>',
	'stats.today': '📅 Today: <b>{links}</b> links, <b>{success}</b> successful',
	'stats.platforms_header': '📱 <b>By Platform:</b>',
	'stats.top_users_header': '👤 <b>Top Users:</b>',
	'stats.user_row': '{rank}. {firstName} — {count} downloads',
	'stats.no_data': 'No statistics yet. Send some links to start tracking.',
	'stats.admin_only': '🔒 This command is for admins only.',
	'stats.btn_history': '📜 History',
	'stats.btn_blocked': '🚫 Blocked',
	'stats.btn_back': '⬅️ Back',
	'stats.history_header': '📜 <b>Recent Downloads</b>',
	'stats.no_history': 'No download history yet.',
	'stats.blocked_header': '🚫 <b>Blocked Users</b>',
	'stats.no_blocked': 'No users are blocked.',
	'stats.unblock_hint': '<i>Use /unblock {userId} to unblock a user.</i>',

	// --- /block & /unblock commands ---
	'block.usage': 'Usage: /block {userId}',
	'block.invalid_id': '⚠️ Invalid user ID. Must be a number.',
	'block.success': '✅ User <code>{userId}</code> has been blocked.',
	'unblock.usage': 'Usage: /unblock {userId}',
	'unblock.success': '✅ User <code>{userId}</code> has been unblocked.',
	'unblock.not_found': '⚠️ User <code>{userId}</code> was not in the blocklist.',

	// --- blocked user message ---
	'input.blocked': '🚫 You are blocked from using this bot.',
	'allowlist.header': '✅ <b>Whitelisted Domains</b>',
	'allowlist.empty': 'No domains are whitelisted yet.',
	'allowlist.removed': '🗑 <b>{hostname}</b> removed from allowlist.',
	'allowlist.not_found': '⚠️ Domain not found in allowlist.',
	'input.blocked_domain': '🚫 This domain is not allowed.',
	'input.blocked_domain_btn': '✋ This is not adult content',
	'report.sent': '✅ Your report has been sent to the admin.',
	'report.admin_notify': '🚨 <b>Domain report</b>\n\nUser <b>{user}</b> (ID: <code>{userId}</code>) says this URL was wrongly blocked:\n<code>{url}</code>',
} as const;

export type TranslationKey = keyof typeof en;
export type Translations = Record<TranslationKey, string>;
