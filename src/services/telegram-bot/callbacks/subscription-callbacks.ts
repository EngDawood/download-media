import { Bot } from 'grammy';
import { KV_KEY_REQUIRED_CHANNEL } from '../../../constants';

const MEMBER_STATUSES = ['member', 'administrator', 'creator'];

export function registerSubscriptionCallbacks(bot: Bot, kv: KVNamespace): void {
	bot.callbackQuery('subscription:verify', async (ctx) => {
		const userId = ctx.from.id;

		const channelUsername = await kv.get(KV_KEY_REQUIRED_CHANNEL);
		if (!channelUsername) {
			await ctx.answerCallbackQuery({ text: '✅ Access granted!' });
			return;
		}

		try {
			const member = await bot.api.getChatMember(channelUsername, userId);
			if (MEMBER_STATUSES.includes(member.status)) {
				const channelName = channelUsername.replace('@', '');
				await ctx.editMessageText(
					`✅ *Access granted\\!*\n\nYou're subscribed to [${channelUsername}](https://t.me/${channelName})\\.\nSend a URL to download media\\.`,
					{ parse_mode: 'MarkdownV2' }
				);
				await ctx.answerCallbackQuery({ text: '✅ Welcome! You can now use the bot.' });
			} else {
				await ctx.answerCallbackQuery({
					text: "⚠️ You haven't joined yet. Please join the channel first!",
					show_alert: true
				});
			}
		} catch (e) {
			console.error('[GATE] verify error:', e);
			await ctx.answerCallbackQuery({ text: '⚠️ Verification failed. Try again.' });
		}
	});
}
