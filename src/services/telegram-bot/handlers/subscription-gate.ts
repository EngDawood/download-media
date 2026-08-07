import { Bot, Context } from 'grammy';
import { KV_KEY_REQUIRED_CHANNEL, KV_KEY_FREE_USES, FREE_USES_BEFORE_GATE } from '../../../constants';
import { getConfig } from '../../../utils/db';
import { getUsageCount, setUsageCount } from '../storage/session-store';
import { trackEvent } from '../../../utils/analytics';
import { incrementGateBlocked } from '../../../utils/stats-d1';
import { t, getLocale } from '../../../i18n';

const USAGE_TTL = 60 * 60 * 24 * 90; // 90 days (used in setUsageCount)
const MEMBER_STATUSES = ['member', 'administrator', 'creator'];

export async function checkSubscriptionGate(
	ctx: Context,
	db: D1Database,
	bot: Bot,
	analytics?: AnalyticsEngineDataset,
	platform?: string,
): Promise<boolean> {
	const [channelUsername, freeUsesStr] = await Promise.all([getConfig(db, KV_KEY_REQUIRED_CHANNEL), getConfig(db, KV_KEY_FREE_USES)]);

	if (!channelUsername) return false;

	const freeUsesLimit = freeUsesStr ? parseInt(freeUsesStr, 10) : FREE_USES_BEFORE_GATE;
	const userId = ctx.from!.id;

	const usage = await getUsageCount(db, userId);
	const newUsage = usage + 1;
	await setUsageCount(db, userId, newUsage);

	if (newUsage <= freeUsesLimit) return false;

	try {
		const member = await bot.api.getChatMember(channelUsername, userId);
		if (MEMBER_STATUSES.includes(member.status)) return false;
	} catch (e) {
		console.warn('[GATE] getChatMember failed, allowing:', e);
		return false;
	}

	trackEvent(analytics, { userId, platform: platform ?? 'unknown', userType: 'guest', action: 'gate_blocked' });
	incrementGateBlocked(db).catch(() => {});
	const locale = getLocale(ctx);
	const channelName = channelUsername.replace('@', '');
	await ctx.reply(t(locale, 'gate.blocked', { freeUses: freeUsesLimit, channelName }), {
		parse_mode: 'MarkdownV2',
		reply_markup: {
			inline_keyboard: [
				[
					{ text: t(locale, 'gate.btn_join'), url: `https://t.me/${channelName}` },
					{ text: t(locale, 'gate.btn_verify'), callback_data: 'subscription:verify' },
				],
			],
		},
	});
	return true;
}
