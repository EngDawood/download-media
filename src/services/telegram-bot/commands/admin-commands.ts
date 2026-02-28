import { Bot } from 'grammy';
import { KV_KEY_REQUIRED_CHANNEL, FREE_USES_BEFORE_GATE } from '../../../constants';
import { t, getLocale } from '../../../i18n';

const ADMIN_STATUSES = ['administrator', 'creator'];

export function registerAdminCommands(bot: Bot, env: Env, kv: KVNamespace): void {
	const adminId = parseInt(env.ADMIN_TELEGRAM_ID, 10);

	bot.command('setchannel', async (ctx) => {
		if (ctx.from?.id !== adminId) return;

		const locale = getLocale(ctx);
		const arg = ctx.match?.trim();
		if (!arg) {
			await ctx.reply(t(locale, 'setchannel.usage'));
			return;
		}

		const channelUsername = arg.startsWith('@') ? arg : `@${arg}`;

		let botId: number;
		try {
			const me = await bot.api.getMe();
			botId = me.id;
		} catch {
			await ctx.reply(t(locale, 'setchannel.bot_info_fail'));
			return;
		}

		try {
			const member = await bot.api.getChatMember(channelUsername, botId);
			if (!ADMIN_STATUSES.includes(member.status)) {
				await ctx.reply(
					t(locale, 'setchannel.not_admin', { channel: channelUsername }),
					{ parse_mode: 'MarkdownV2' },
				);
				return;
			}
		} catch {
			await ctx.reply(
				t(locale, 'setchannel.not_found', { channel: channelUsername }),
				{ parse_mode: 'MarkdownV2' },
			);
			return;
		}

		await kv.put(KV_KEY_REQUIRED_CHANNEL, channelUsername);

		const channelName = channelUsername.replace('@', '');
		await ctx.reply(
			t(locale, 'setchannel.success', { channel: channelUsername, channelName, freeUses: FREE_USES_BEFORE_GATE }),
			{ parse_mode: 'MarkdownV2' },
		);
	});
}
