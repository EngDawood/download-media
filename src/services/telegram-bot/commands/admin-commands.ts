import { Bot } from 'grammy';
import { KV_KEY_REQUIRED_CHANNEL, FREE_USES_BEFORE_GATE } from '../../../constants';

const ADMIN_STATUSES = ['administrator', 'creator'];

export function registerAdminCommands(bot: Bot, env: Env, kv: KVNamespace): void {
	const adminId = parseInt(env.ADMIN_TELEGRAM_ID, 10);

	bot.command('setchannel', async (ctx) => {
		if (ctx.from?.id !== adminId) return;

		const arg = ctx.match?.trim();
		if (!arg) {
			await ctx.reply('Usage: /setchannel @channelname');
			return;
		}

		const channelUsername = arg.startsWith('@') ? arg : `@${arg}`;

		let botId: number;
		try {
			const me = await bot.api.getMe();
			botId = me.id;
		} catch {
			await ctx.reply('⚠️ Could not get bot info. Try again.');
			return;
		}

		try {
			const member = await bot.api.getChatMember(channelUsername, botId);
			if (!ADMIN_STATUSES.includes(member.status)) {
				await ctx.reply(
					`⚠️ I'm in *${channelUsername}* but I'm not an administrator there\\.\n\n` +
					`Please promote me to admin in the channel, then try again\\.`,
					{ parse_mode: 'MarkdownV2' }
				);
				return;
			}
		} catch {
			await ctx.reply(
				`❌ Could not find channel *${channelUsername}* or I don't have access\\.\n\n` +
				`Make sure:\n` +
				`1\\. The channel exists\n` +
				`2\\. You added me as an administrator`,
				{ parse_mode: 'MarkdownV2' }
			);
			return;
		}

		await kv.put(KV_KEY_REQUIRED_CHANNEL, channelUsername);

		const name = channelUsername.replace('@', '');
		await ctx.reply(
			`✅ Required channel set to [${channelUsername}](https://t.me/${name})\\.\n\n` +
			`Users will need to join it after ${FREE_USES_BEFORE_GATE} free downloads\\.`,
			{ parse_mode: 'MarkdownV2' }
		);
	});
}
