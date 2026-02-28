import { InlineKeyboard, type Bot } from 'grammy';
import { clearAdminState } from '../storage/admin-state';
import { KV_KEY_REQUIRED_CHANNEL, FREE_USES_BEFORE_GATE, CACHE_PREFIX_USER_LANG } from '../../../constants';
import { t, getLocale, localeName, SUPPORTED_LOCALES, type Locale } from '../../../i18n';
import { getStatsReport } from '../../../utils/stats';

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

	bot.command('stats', async (ctx) => {
		const locale = getLocale(ctx);
		if (ctx.from?.id !== adminId) {
			await ctx.reply(t(locale, 'stats.admin_only'));
			return;
		}

		const report = await getStatsReport(kv);
		const g = report.global;

		if (g.totalLinks === 0) {
			await ctx.reply(t(locale, 'stats.no_data'));
			return;
		}

		const lines: string[] = [
			t(locale, 'stats.header'),
			'',
			t(locale, 'stats.links', { count: String(g.totalLinks) }),
			t(locale, 'stats.success', { count: String(g.totalSuccess) }),
			t(locale, 'stats.errors', { count: String(g.totalErrors) }),
			t(locale, 'stats.users', { count: String(g.totalUniqueUsers) }),
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

		await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
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
}
