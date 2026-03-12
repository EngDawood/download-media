import { InlineKeyboard, type Bot } from 'grammy';
import { clearAdminState, getAdminState, setAdminState } from '../storage/admin-state';
import { KV_KEY_REQUIRED_CHANNEL, FREE_USES_BEFORE_GATE, CACHE_PREFIX_USER_LANG, CACHE_PREFIX_BLOCKED_URL, KV_KEY_STATS_USER_PREFIX, KV_KEY_STATS_STARTED_PREFIX } from '../../../constants';
import { t, getLocale, localeName, SUPPORTED_LOCALES, type Locale } from '../../../i18n';
import { getStatsReport, getDownloadHistory, getBlockedUsers, blockUser, unblockUser, addDomainToAllowlist, removeDomainFromAllowlist, getAllowlist, getFailedDownloads, incrementStartUsers, getDailyStats } from '../../../utils/stats';
import type { StatsReport } from '../../../utils/stats';

/**
 * Register basic information and control commands.
 */
export function registerInfoCommands(bot: Bot, env: Env, kv: KVNamespace): void {
	const adminId = parseInt(env.ADMIN_TELEGRAM_ID, 10);

	bot.command('start', async (ctx) => {
		const isAdmin = ctx.from?.id === adminId;
		const name = ctx.from?.first_name || '';
		const locale = getLocale(ctx);
		const greeting = name ? t(locale, 'start.admin.greeting', { firstName: name }) : '';

		// Track unique /start users (fire-and-forget)
		if (ctx.from?.id) void incrementStartUsers(kv, ctx.from.id);

		if (isAdmin) {
			await ctx.reply(greeting + t(locale, 'start.admin.body'), { parse_mode: 'HTML' });
			return;
		}

		// Guest: show channel requirement if configured
		const channelUsername = await kv.get(KV_KEY_REQUIRED_CHANNEL);
		const channelLine = channelUsername
			? t(locale, 'start.guest.channel_line', { freeUses: FREE_USES_BEFORE_GATE, channel: channelUsername })
			: '';

		await ctx.reply(
			greeting +
				t(locale, 'start.guest.body') +
				channelLine +
				t(locale, 'start.guest.help_hint'),
			{ parse_mode: 'HTML' },
		);
	});

	bot.command('help', async (ctx) => {
		const isAdmin = ctx.from?.id === adminId;
		const name = ctx.from?.first_name || '';
		const locale = getLocale(ctx);
		const namePrefix = name ? t(locale, 'help.name_prefix', { firstName: name }) : '';

		if (isAdmin) {
			await ctx.reply(
				namePrefix + t(locale, 'help.admin.body', { freeUses: FREE_USES_BEFORE_GATE }),
				{ parse_mode: 'HTML' },
			);
			return;
		}

		// Guest
		const channelUsername = await kv.get(KV_KEY_REQUIRED_CHANNEL);
		const freeTierLine = channelUsername
			? t(locale, 'help.guest.free_tier', { freeUses: FREE_USES_BEFORE_GATE, channel: channelUsername })
			: '';

		await ctx.reply(
			namePrefix + t(locale, 'help.guest.body') + freeTierLine,
			{ parse_mode: 'HTML' },
		);
	});

	bot.command('cancel', async (ctx) => {
		const locale = getLocale(ctx);
		await clearAdminState(kv, adminId);
		await ctx.reply(t(locale, 'cancel.done'));
	});

	// --- Stats helpers ---
	function buildStatsText(report: StatsReport, locale: Locale): string {
		const g = report.global;
		const rate = g.totalLinks > 0 ? Math.round((g.totalSuccess / g.totalLinks) * 100) : 0;
		const lines: string[] = [
			t(locale, 'stats.header'),
			'',
			t(locale, 'stats.start_users', { count: String(g.totalStartUsers ?? 0) }),
			t(locale, 'stats.users', { count: String(g.totalUniqueUsers) }),
			'',
			t(locale, 'stats.links', { count: String(g.totalLinks) }),
			t(locale, 'stats.success', { count: String(g.totalSuccess), rate: String(rate) }),
			t(locale, 'stats.errors', { count: String(g.totalErrors) }),
			'',
			t(locale, 'stats.today', { links: String(report.today.links), success: String(report.today.success) }),
		];
		const sortedPlatforms = Object.entries(g.platforms).sort((a, b) => b[1] - a[1]);
		if (sortedPlatforms.length > 0) {
			lines.push('', t(locale, 'stats.platforms_header'));
			for (const [platform, count] of sortedPlatforms.slice(0, 7)) {
				lines.push(`• ${platform}: ${count}`);
			}
		}
		if (g.topUsers.length > 0) {
			lines.push('', t(locale, 'stats.top_users_header'));
			for (let i = 0; i < Math.min(g.topUsers.length, 5); i++) {
				const u = g.topUsers[i];
				lines.push(t(locale, 'stats.user_row', { rank: String(i + 1), firstName: u.firstName, count: String(u.count) }));
			}
		}
		return lines.join('\n');
	}

	function buildStatsKeyboard(locale: Locale): InlineKeyboard {
		return new InlineKeyboard()
			.text(t(locale, 'stats.btn_daily'), 'stats:daily')
			.text(t(locale, 'stats.btn_history'), 'stats:history')
			.row()
			.text(t(locale, 'stats.btn_blocked'), 'stats:blocked')
			.text(t(locale, 'stats.btn_failed'), 'stats:failed');
	}

	bot.command('stats', async (ctx) => {
		const locale = getLocale(ctx);
		if (ctx.from?.id !== adminId) {
			await ctx.reply(t(locale, 'stats.admin_only'));
			return;
		}

		const report = await getStatsReport(kv);
		if (report.global.totalLinks === 0 && (report.global.totalStartUsers ?? 0) === 0) {
			await ctx.reply(t(locale, 'stats.no_data'));
			return;
		}

		await ctx.reply(buildStatsText(report, locale), { parse_mode: 'HTML', reply_markup: buildStatsKeyboard(locale) });
	});

	// Stats callback: show daily breakdown (last 7 days)
	bot.callbackQuery('stats:daily', async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t(getLocale(ctx), 'stats.admin_only') });
			return;
		}
		const locale = getLocale(ctx);
		const daily = await getDailyStats(kv, 7);

		const lines: string[] = [t(locale, 'stats.daily_header'), ''];
		let hasData = false;
		for (let i = 0; i < daily.length; i++) {
			const entry = daily[i];
			let label: string;
			if (i === 0) label = t(locale, 'stats.today_label');
			else if (i === 1) label = t(locale, 'stats.yesterday_label');
			else {
				const d = new Date(entry.date + 'T00:00:00Z');
				label = d.toLocaleDateString('en-GB', { month: 'short', day: '2-digit', timeZone: 'UTC' });
			}
			if (entry.links === 0) {
				lines.push(t(locale, 'stats.daily_row_empty', { label }));
			} else {
				hasData = true;
				lines.push(t(locale, 'stats.daily_row', { label, links: String(entry.links), success: String(entry.success) }));
			}
		}
		if (!hasData) {
			await ctx.answerCallbackQuery({ text: t(locale, 'stats.no_data') });
			return;
		}

		const keyboard = new InlineKeyboard().text(t(locale, 'stats.btn_back'), 'stats:back');
		await ctx.answerCallbackQuery();
		await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: keyboard });
	});

	// Stats callback: show download history
	bot.callbackQuery('stats:history', async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t(getLocale(ctx), 'stats.admin_only') });
			return;
		}
		const locale = getLocale(ctx);
		const history = await getDownloadHistory(kv, 15);
		if (history.length === 0) {
			await ctx.answerCallbackQuery({ text: t(locale, 'stats.no_history') });
			return;
		}

		const lines: string[] = [t(locale, 'stats.history_header'), ''];
		for (const entry of history) {
			const date = new Date(entry.timestamp).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });
			const userDisplay = entry.username ? `@${entry.username}` : entry.firstName;
			const status = entry.success ? '✅' : '❌';
			lines.push(`${status} <b>${userDisplay}</b> (${entry.platform})`);
			lines.push(`   <code>${entry.url}</code>`);
			lines.push(`   ${date} • ID: <code>${entry.userId}</code>`);
			lines.push('');
		}

		const keyboard = new InlineKeyboard().text(t(locale, 'stats.btn_back'), 'stats:back');
		await ctx.answerCallbackQuery();
		await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: keyboard });
	});

	// Stats callback: show blocked users
	bot.callbackQuery('stats:blocked', async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t(getLocale(ctx), 'stats.admin_only') });
			return;
		}
		const locale = getLocale(ctx);
		const blocked = await getBlockedUsers(kv);

		const lines: string[] = [t(locale, 'stats.blocked_header'), ''];
		if (blocked.length === 0) {
			lines.push(t(locale, 'stats.no_blocked'));
		} else {
			for (const user of blocked) {
				const date = new Date(user.blockedAt).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'short' });
				const userDisplay = user.username ? `@${user.username}` : user.firstName;
				lines.push(`🚫 <b>${userDisplay}</b>`);
				lines.push(`   ID: <code>${user.userId}</code> • ${date}`);
				lines.push('');
			}
			lines.push(t(locale, 'stats.unblock_hint'));
		}

		const keyboard = new InlineKeyboard().text(t(locale, 'stats.btn_back'), 'stats:back');
		await ctx.answerCallbackQuery();
		await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: keyboard });
	});

	// Stats callback: show failed downloads
	bot.callbackQuery('stats:failed', async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t(getLocale(ctx), 'stats.admin_only') });
			return;
		}
		const locale = getLocale(ctx);
		const failed = await getFailedDownloads(kv, 15);

		if (failed.length === 0) {
			await ctx.answerCallbackQuery({ text: t(locale, 'stats.no_failed') });
			return;
		}

		const lines: string[] = [t(locale, 'stats.failed_header'), ''];
		for (const entry of failed) {
			const date = new Date(entry.timestamp).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });
			const userDisplay = entry.username ? `@${entry.username}` : entry.firstName;
			lines.push(`❌ <b>${userDisplay}</b> (${entry.platform})`);
			lines.push(`   <i>${entry.errorReason}</i>`);
			lines.push(`   <code>${entry.url}</code>`);
			lines.push(`   ${date}`);
			lines.push('');
		}

		const keyboard = new InlineKeyboard().text(t(locale, 'stats.btn_back'), 'stats:back');
		await ctx.answerCallbackQuery();
		await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: keyboard });
	});

	// Stats callback: back to main stats
	bot.callbackQuery('stats:back', async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t(getLocale(ctx), 'stats.admin_only') });
			return;
		}
		const locale = getLocale(ctx);
		const report = await getStatsReport(kv);
		await ctx.answerCallbackQuery();
		await ctx.editMessageText(buildStatsText(report, locale), { parse_mode: 'HTML', reply_markup: buildStatsKeyboard(locale) });
	});

	// /block command
	bot.command('block', async (ctx) => {
		const locale = getLocale(ctx);
		if (ctx.from?.id !== adminId) {
			await ctx.reply(t(locale, 'stats.admin_only'));
			return;
		}

		const arg = ctx.match?.trim();
		if (!arg) {
			await ctx.reply(t(locale, 'block.usage'));
			return;
		}

		const userId = parseInt(arg, 10);
		if (isNaN(userId)) {
			await ctx.reply(t(locale, 'block.invalid_id'));
			return;
		}

		// Try to find user's name from stats
		const userKey = `${KV_KEY_STATS_USER_PREFIX}${userId}`;
		const userRaw = await kv.get(userKey);
		let firstName = 'Unknown';
		if (userRaw) {
			try {
				const userStats = JSON.parse(userRaw) as { firstName: string };
				firstName = userStats.firstName;
			} catch {}
		}

		await blockUser(kv, userId, { firstName });
		await ctx.reply(t(locale, 'block.success', { userId: String(userId) }));
	});

	// /unblock command
	bot.command('unblock', async (ctx) => {
		const locale = getLocale(ctx);
		if (ctx.from?.id !== adminId) {
			await ctx.reply(t(locale, 'stats.admin_only'));
			return;
		}

		const arg = ctx.match?.trim();
		if (!arg) {
			await ctx.reply(t(locale, 'unblock.usage'));
			return;
		}

		const userId = parseInt(arg, 10);
		if (isNaN(userId)) {
			await ctx.reply(t(locale, 'block.invalid_id'));
			return;
		}

		const removed = await unblockUser(kv, userId);
		if (removed) {
			await ctx.reply(t(locale, 'unblock.success', { userId: String(userId) }));
		} else {
			await ctx.reply(t(locale, 'unblock.not_found', { userId: String(userId) }));
		}
	});

	// Callback: user claims their blocked URL is not adult content
	bot.callbackQuery('report:notadult', async (ctx) => {
		const userId = ctx.from?.id;
		const locale = getLocale(ctx);
		if (!userId) {
			await ctx.answerCallbackQuery();
			return;
		}

		const url = await kv.get(`${CACHE_PREFIX_BLOCKED_URL}${userId}`);
		if (!url) {
			await ctx.answerCallbackQuery({ text: t(locale, 'callback.session_expired') });
			return;
		}

		const userDisplay = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
		const adminKeyboard = new InlineKeyboard()
			.text('✅ Accept (one-time)', `report:accept:${userId}`).row()
			.text('✅ Whitelist domain', `report:whitelist:${userId}`).row()
			.text('❌ Deny', `report:deny:${userId}`);

		await bot.api.sendMessage(
			adminId,
			t('en', 'report.admin_notify', { user: userDisplay, userId: String(userId), url }),
			{ parse_mode: 'HTML', reply_markup: adminKeyboard },
		);

		await ctx.answerCallbackQuery({ text: t(locale, 'report.sent') });
		await ctx.editMessageReplyMarkup({ reply_markup: undefined });
	});

	// Callback: admin accepts one-time — remove cached URL so user can retry once
	bot.callbackQuery(/^report:accept:(\d+)$/, async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t('en', 'stats.admin_only') });
			return;
		}
		const reportedUserId = ctx.match[1];
		await kv.delete(`${CACHE_PREFIX_BLOCKED_URL}${reportedUserId}`);
		await ctx.answerCallbackQuery({ text: '✅ Accepted — user can retry the link.' });
		await ctx.editMessageText(`${ctx.message?.text ?? ''}\n\n✅ <b>Accepted (one-time)</b> by admin.`, { parse_mode: 'HTML' });
	});

	// Callback: admin whitelists the domain permanently
	bot.callbackQuery(/^report:whitelist:(\d+)$/, async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t('en', 'stats.admin_only') });
			return;
		}
		const reportedUserId = ctx.match[1];
		const url = await kv.get(`${CACHE_PREFIX_BLOCKED_URL}${reportedUserId}`);
		if (!url) {
			await ctx.answerCallbackQuery({ text: '⚠️ URL expired, cannot whitelist.' });
			return;
		}
		const hostname = new URL(url).hostname.replace(/^www\./, '');
		await Promise.all([
			addDomainToAllowlist(kv, hostname),
			kv.delete(`${CACHE_PREFIX_BLOCKED_URL}${reportedUserId}`),
		]);
		await ctx.answerCallbackQuery({ text: `✅ ${hostname} added to allowlist.` });
		await ctx.editMessageText(`${ctx.message?.text ?? ''}\n\n✅ <b>Whitelisted: <code>${hostname}</code></b> by admin.`, { parse_mode: 'HTML' });
	});

	// Callback: admin denies the report
	bot.callbackQuery(/^report:deny:(\d+)$/, async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t('en', 'stats.admin_only') });
			return;
		}
		await ctx.answerCallbackQuery({ text: '❌ Report denied.' });
		await ctx.editMessageText(`${ctx.message?.text ?? ''}\n\n❌ <b>Denied</b> by admin.`, { parse_mode: 'HTML' });
	});

	// /allowlist — view and manage whitelisted domains
	bot.command('allowlist', async (ctx) => {
		const locale = getLocale(ctx);
		if (ctx.from?.id !== adminId) {
			await ctx.reply(t(locale, 'stats.admin_only'));
			return;
		}
		const list = await getAllowlist(kv);
		if (list.length === 0) {
			await ctx.reply(`${t(locale, 'allowlist.header')}\n\n${t(locale, 'allowlist.empty')}`, { parse_mode: 'HTML' });
			return;
		}
		const keyboard = new InlineKeyboard();
		for (const hostname of list) {
			keyboard.text(`🗑 ${hostname}`, `allowlist:rm:${hostname}`).row();
		}
		await ctx.reply(t(locale, 'allowlist.header'), { parse_mode: 'HTML', reply_markup: keyboard });
	});

	// Callback: remove a domain from the allowlist
	bot.callbackQuery(/^allowlist:rm:(.+)$/, async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t('en', 'stats.admin_only') });
			return;
		}
		const locale = getLocale(ctx);
		const hostname = ctx.match[1];
		const removed = await removeDomainFromAllowlist(kv, hostname);
		if (removed) {
			await ctx.answerCallbackQuery({ text: `🗑 ${hostname} removed.` });
			// Refresh the list
			const list = await getAllowlist(kv);
			if (list.length === 0) {
				await ctx.editMessageText(`${t(locale, 'allowlist.header')}\n\n${t(locale, 'allowlist.empty')}`, { parse_mode: 'HTML' });
			} else {
				const keyboard = new InlineKeyboard();
				for (const h of list) {
					keyboard.text(`🗑 ${h}`, `allowlist:rm:${h}`).row();
				}
				await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
			}
		} else {
			await ctx.answerCallbackQuery({ text: t(locale, 'allowlist.not_found') });
		}
	});

	bot.command('lang', async (ctx) => {
		const locale = getLocale(ctx);
		const keyboard = new InlineKeyboard()
			.text('English', 'lang:en')
			.text('العربية', 'lang:ar');

		await ctx.reply(
			t(locale, 'lang.current', { language: localeName(locale) }) +
				'\n\n' +
				t(locale, 'lang.pick'),
			{ parse_mode: 'HTML', reply_markup: keyboard },
		);
	});

	bot.callbackQuery(/^lang:(\w+)$/, async (ctx) => {
		const newLocale = ctx.match[1] as Locale;
		if (!SUPPORTED_LOCALES.includes(newLocale)) {
			await ctx.answerCallbackQuery({ text: 'Unknown language.' });
			return;
		}
		const userId = ctx.from.id;
		await kv.put(`${CACHE_PREFIX_USER_LANG}${userId}`, newLocale);
		// Update ctx locale for the response
		(ctx as any).locale = newLocale;
		await ctx.editMessageText(
			t(newLocale, 'lang.changed', { language: localeName(newLocale) }),
			{ parse_mode: 'HTML' },
		);
		await ctx.answerCallbackQuery();
	});

	// /broadcast — admin sends a message to all users
	bot.command('broadcast', async (ctx) => {
		const locale = getLocale(ctx);
		if (ctx.from?.id !== adminId) {
			await ctx.reply(t(locale, 'stats.admin_only'));
			return;
		}
		await setAdminState(kv, adminId, { action: 'awaiting_broadcast' });
		await ctx.reply(t(locale, 'broadcast.prompt'), { parse_mode: 'HTML' });
	});

	// Callback: admin confirms broadcast
	bot.callbackQuery('broadcast:confirm', async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t(getLocale(ctx), 'stats.admin_only') });
			return;
		}
		const locale = getLocale(ctx);
		const state = await getAdminState(kv, adminId);
		if (!state || state.action !== 'awaiting_broadcast' || !state.context?.broadcastMessage) {
			await ctx.answerCallbackQuery({ text: t(locale, 'callback.session_expired') });
			return;
		}
		const message = state.context.broadcastMessage;
		await clearAdminState(kv, adminId);
		await ctx.answerCallbackQuery();
		await ctx.editMessageText(t(locale, 'broadcast.sending'), { parse_mode: 'HTML' });

		// Collect all user IDs from stats:started:* keys
		const userIds: number[] = [];
		let cursor: string | undefined;
		do {
			const result: KVNamespaceListResult<unknown, string> = cursor
				? await kv.list({ prefix: KV_KEY_STATS_STARTED_PREFIX, cursor })
				: await kv.list({ prefix: KV_KEY_STATS_STARTED_PREFIX });
			for (const key of result.keys) {
				const idStr = key.name.slice(KV_KEY_STATS_STARTED_PREFIX.length);
				const id = parseInt(idStr, 10);
				if (!isNaN(id) && id !== adminId) userIds.push(id);
			}
			cursor = result.list_complete ? undefined : (result as any).cursor;
		} while (cursor);

		if (userIds.length === 0) {
			await ctx.editMessageText(t(locale, 'broadcast.no_users'));
			return;
		}

		let sent = 0;
		let failed = 0;
		for (const userId of userIds) {
			try {
				await bot.api.sendMessage(userId, message);
				sent++;
			} catch {
				failed++;
			}
		}

		await ctx.editMessageText(
			t(locale, 'broadcast.done', { sent: String(sent), failed: String(failed) }),
			{ parse_mode: 'HTML' },
		);
	});

	// Callback: admin cancels broadcast
	bot.callbackQuery('broadcast:cancel', async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t(getLocale(ctx), 'stats.admin_only') });
			return;
		}
		const locale = getLocale(ctx);
		await clearAdminState(kv, adminId);
		await ctx.answerCallbackQuery();
		await ctx.editMessageText(t(locale, 'broadcast.cancelled'));
	});
}
