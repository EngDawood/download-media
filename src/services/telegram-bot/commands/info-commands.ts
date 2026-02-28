import { InlineKeyboard, type Bot } from 'grammy';
import { clearAdminState } from '../storage/admin-state';
import { KV_KEY_REQUIRED_CHANNEL, FREE_USES_BEFORE_GATE, CACHE_PREFIX_USER_LANG } from '../../../constants';
import { t, getLocale, localeName, SUPPORTED_LOCALES, type Locale } from '../../../i18n';

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
