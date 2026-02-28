import { Bot } from 'grammy';
import { KV_KEY_REQUIRED_CHANNEL } from '../../../constants';
import { t, getLocale } from '../../../i18n';

const MEMBER_STATUSES = ['member', 'administrator', 'creator'];

export function registerSubscriptionCallbacks(bot: Bot, kv: KVNamespace): void {
	bot.callbackQuery('subscription:verify', async (ctx) => {
		const userId = ctx.from.id;
		const locale = getLocale(ctx);

		const channelUsername = await kv.get(KV_KEY_REQUIRED_CHANNEL);
		if (!channelUsername) {
			await ctx.answerCallbackQuery({ text: t(locale, 'gate.access_granted_alert') });
			return;
		}

		try {
			const member = await bot.api.getChatMember(channelUsername, userId);
			if (MEMBER_STATUSES.includes(member.status)) {
				const channelName = channelUsername.replace('@', '');
				await ctx.editMessageText(
					t(locale, 'gate.subscribed', { channel: channelUsername, channelName }),
					{ parse_mode: 'MarkdownV2' },
				);
				await ctx.answerCallbackQuery({ text: t(locale, 'gate.welcome_alert') });
			} else {
				await ctx.answerCallbackQuery({
					text: t(locale, 'gate.not_joined'),
					show_alert: true,
				});
			}
		} catch (e) {
			console.error('[GATE] verify error:', e);
			await ctx.answerCallbackQuery({ text: t(locale, 'gate.verify_failed') });
		}
	});
}
