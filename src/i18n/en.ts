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
		'/setfreeuses {count} — Set free downloads limit\n' +
		'/adminstats — View detailed statistics\n' +
		'/stats — View usage statistics\n' +
		'/lang — Change bot language\n' +
		'/cancel — Cancel current action\n' +
		'/block {userId} — Block a user\n' +
		'/unblock {userId} — Unblock a user\n' +
		'/allowlist — Manage whitelisted domains\n' +
		'/broadcast — Send a message to all users\n' +
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
		'<code>/setchannel @username</code> — Require users to join a channel after {freeUses} free downloads.\n' +
		'<code>/setfreeuses {count}</code> — Change the number of free downloads allowed.\n' +
		'<code>/stats</code> or <code>/adminstats</code> — View bot usage statistics.\n' +
		'<code>/lang</code> — Change bot language.\n' +
		'<code>/cancel</code> — Cancel the current download flow.\n' +
		'<code>/block {userId}</code> — Block a user from using the bot.\n' +
		'<code>/unblock {userId}</code> — Restore access for a user.\n' +
		'<code>/allowlist</code> — View and remove whitelisted domains.\n' +
		'<code>/broadcast</code> — Send a message to all users.',

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
	'input.btn_video': 'Download Video',
	'input.btn_audio': 'Download Audio',

	// --- download-and-send ---
	'download.status': 'Downloading {modeText} from {platform}...',
	'download.mode_audio': 'audio',
	'download.mode_media': 'media',
	'download.done': 'Done.',
	'download.done_info': 'Done. ({info})',
	'download.sent_album': 'Sent {count} items as album.',
	'download.failed': "❌ Download failed. The link might be invalid or unsupported. Please check the link and try again.\n<i>Error: {error}</i>",
	'download.no_media': "😕 No media found. The post might be private, deleted, or from an unsupported platform. Please check the link and try again.",
	'download.error': "⚠️ Download failed. An unexpected error occurred. Please try again.",
	'download.too_large': '😔 File too large. Telegram limits file uploads to 50MB. Please download it manually using the link below.',
	'download.too_large_name': '😔 Sorry {firstName}, the file is too large. Telegram limits file uploads to 50MB. Please download it manually using the link below.',
	'download.too_large_limit': '😔 File too large. Telegram limits file uploads to 50MB. Please download it manually using the link below.',
	'download.too_large_limit_name': '😔 Sorry {firstName}, the file is too large. Telegram limits file uploads to 50MB. Please download it manually using the link below.',
	'download.copy_url_hint': 'Copy the URL below, then send the link to @urluploadxbot',
	'download.btn_urluploadxbot': '🤖 Send to @urluploadxbot',
	'download.btn_browser': '🌐 Open in Browser',
	'download.btn_mp3': '🎵 Extract Audio',
	'download.btn_retry': '🔄 Retry Download',
	'download.btn_report_admin': '📬 Report Issue',
	'download.contact_admin': 'If you believe this is a bot error, you can report it to the admin.',
	'download.report_sent': '✅ Your report has been sent to the admin.',
	'download.admin_error_report': '🚨 <b>Failed Download Report</b>\n\n👤 User: {user}\n📱 Platform: {platform}\n🔗 URL: <code>{url}</code>\n❌ Error: <code>{error}</code>',

	// --- callbacks ---
	'callback.session_expired': "⏱ Session expired. Please send the link again to start fresh.",
	'callback.cancelled': 'Cancelled.',

	// --- subscription gate ---
	'gate.blocked':
		"🔒 Free limit reached\\. You've used your {freeUses} free downloads\\!\n\n" +
		'Join our channel to continue downloading:\n' +
		'👉 [t\\.me/{channelName}](https://t.me/{channelName})',
	'gate.btn_join': '📢 Join Channel',
	'gate.btn_verify': '✅ Verify Subscription',

	// --- subscription callbacks ---
	'gate.access_granted_alert': '✅ Access granted!',
	'gate.welcome_alert': '✅ Welcome! You can now use the bot.',
	'gate.subscribed':
		"✅ *Access granted\\!*\n\nYou're subscribed to [{channel}](https://t.me/{channelName})\\.\nSend a URL to download media\\.",
	'gate.not_joined': "⚠️ Subscription not found. Please join the channel first, then tap Verify.",
	'gate.verify_failed': "⚠️ Verification failed. We couldn't confirm your subscription. Please try again.",

	// --- bot-factory errors ---
	'error.callback': '⚠️ Action failed. An unexpected error occurred. Please try again.',
	'error.general': '⚠️ Action failed. An unexpected error occurred. Please try again.',
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
	'setfreeuses.usage': 'Usage: /setfreeuses {number}',
	'setfreeuses.success': '✅ Free uses limit updated to <b>{count}</b>.',
	'setfreeuses.invalid': '⚠️ Invalid number.',

	// --- /lang command ---
	'lang.current': '🌐 Current language: <b>{language}</b>',
	'lang.pick': 'Choose your language:',
	'lang.changed': '✅ Language changed to <b>{language}</b>.',

	// --- /stats command (admin only) ---
	'stats.header': '📊 <b>Bot Statistics</b>',
	'stats.start_users': '🚀 Users started bot: <b>{count}</b>',
	'stats.links': '📥 Links submitted: <b>{count}</b>',
	'stats.success': '✅ Successful: <b>{count}</b> ({rate}%)',
	'stats.errors': '❌ Errors: <b>{count}</b>',
	'stats.users': '👥 Unique downloaders: <b>{count}</b>',
	'stats.today': '📅 Today: <b>{links}</b> links · <b>{success}</b> ✅ · <b>{errors}</b> ❌',
	'stats.platforms_header': '📱 <b>Top Platforms:</b>',
	'stats.top_users_header': '👤 <b>Top Downloaders:</b>',
	'stats.user_row': '{rank}. {userDisplay} — {count}',
	'stats.no_data': 'No statistics yet. Send some links to start tracking.',
	'stats.admin_only': '🔒 This command is for admins only.',
	'stats.gate_header': '🚪 <b>Subscription Gate:</b>',
	'stats.gate_shown': '🔒 Gate shown: <b>{count}</b>',
	'stats.gate_verified': '✅ Verified: <b>{count}</b> ({rate}%)',
	'stats.gate_still_blocked': '↩️ Still blocked: <b>{count}</b>',
	'stats.channel_subscribers': '📢 Channel: {channel} · <b>{count}</b> subscribers',
	'stats.btn_daily': '📅 Daily',
	'stats.btn_hourly': '⏰ Hourly',
	'stats.btn_history': '📋 History',
	'stats.btn_gate': '🚪 Gate',
	'stats.btn_users': '👥 Users',
	'stats.btn_blocked': '🚫 Blocked',
	'stats.btn_failed': '❌ Failed',
	'stats.btn_back': '⬅️ Back',
	'stats.daily_header': '📅 <b>Daily Stats — Last 7 Days</b>',
	'stats.today_label': 'Today',
	'stats.yesterday_label': 'Yesterday',
	'stats.daily_row': '<b>{label}:</b> {links} links · {success} ✅ · {errors} ❌',
	'stats.daily_row_empty': '<b>{label}:</b> —',
	'stats.daily_summary': '7-day total: <b>{links}</b> links · <b>{success}</b> ✅ ({rate}%)',
	'stats.hourly_header': '⏰ <b>Downloads by Hour (UTC)</b>',
	'stats.hourly_peak': '🏆 Peak: <b>{hour}:00 UTC</b> ({count} downloads)',
	'stats.hourly_no_data': 'No hourly data yet.',
	'stats.history_header': '📋 <b>Recent Downloads</b>',
	'stats.no_history': 'No download history yet.',
	'stats.blocked_header': '🚫 <b>Blocked Users</b>',
	'stats.no_blocked': 'No users are blocked.',
	'stats.unblock_hint': '<i>Use /unblock {userId} to unblock a user.</i>',
	'stats.failed_header': '❌ <b>Failed Downloads</b>',
	'stats.no_failed': 'No failed downloads recorded.',
	'stats.gate_funnel_header': '🚪 <b>Gate Conversion Funnel</b>',
	'stats.gate_funnel_shown': '🔒 Gate shown: <b>{count}</b>',
	'stats.gate_funnel_verified': '✅ Verified: <b>{verified}</b>',
	'stats.gate_funnel_blocked': '❌ Still not subscribed: <b>{count}</b>',
	'stats.gate_funnel_rate': '📊 Conversion rate: <b>{rate}%</b>',
	'stats.gate_today': '📅 Today: <b>{blocked}</b> blocked · <b>{verified}</b> verified',
	'stats.gate_no_data': 'No gate data yet. Set a channel with /setchannel first.',
	'stats.users_header': '👥 <b>User Overview</b>',
	'stats.users_activity': '📊 <b>By Activity:</b>',
	'stats.users_active_7d': '🟢 Active (7d): <b>{count}</b>',
	'stats.users_active_30d': '🟡 Recent (30d): <b>{count}</b>',
	'stats.users_inactive': '⚫ Inactive (30d+): <b>{count}</b>',
	'stats.users_power': '🏆 <b>Power Users (top 10):</b>',
	'stats.users_power_row': '{rank}. {userDisplay} — {count} ✅ · {failures} ❌ · {topPlatform}',
	'stats.users_no_data': 'No user data yet.',
	'stats.today_history_header': '📜 <b>Downloads Today</b>',

	// --- /block & /unblock commands ---
	'block.usage': 'Usage: /block {userId}',
	'block.invalid_id': '⚠️ Invalid user ID. Must be a number.',
	'block.success': '✅ User <code>{userId}</code> has been blocked.',
	'unblock.usage': 'Usage: /unblock {userId}',
	'unblock.success': '✅ User <code>{userId}</code> has been unblocked.',
	'unblock.not_found': '⚠️ User <code>{userId}</code> was not in the blocklist.',

	// --- blocked user message ---
	'input.blocked': '🚫 Access denied. You have been blocked from using this bot.',
	'allowlist.header': '✅ <b>Whitelisted Domains</b>',
	'allowlist.empty': 'No domains are whitelisted yet.',
	'allowlist.removed': '🗑 <b>{hostname}</b> removed from allowlist.',
	'allowlist.not_found': '⚠️ Domain not found in allowlist.',
	'input.instagram_story_unsupported': "📖 Unsupported format. Instagram Stories are not supported yet.",
	'input.blocked_domain': '🚫 Content blocked. This domain is not allowed due to safety policies.',
	'input.blocked_domain_btn': '✋ Report Safe Content',
	'report.sent': '✅ Your report has been sent to the admin.',
	'report.admin_notify': '🚨 <b>Domain report</b>\n\nUser <b>{user}</b> (ID: <code>{userId}</code>) says this URL was wrongly blocked:\n<code>{url}</code>',

	// --- /broadcast command ---
	'broadcast.prompt': '📣 Type the message you want to broadcast to all users.\n\nUse /cancel to abort.',
	'broadcast.preview': '📣 <b>Broadcast Preview:</b>\n\n{message}\n\n<i>Send this to all users?</i>',
	'broadcast.btn_confirm': '✅ Send',
	'broadcast.btn_cancel': '❌ Cancel',
	'broadcast.sending': '📤 Sending to all users...', 
	'broadcast.done': '✅ Broadcast sent to <b>{sent}</b> users. <b>{failed}</b> failed.',
	'broadcast.no_users': '⚠️ No users to broadcast to yet.',
	'broadcast.cancelled': '❌ Broadcast cancelled.',
} as const;

export type TranslationKey = keyof typeof en;
export type Translations = Record<TranslationKey, string>;
