import { Bot, Context } from 'grammy';
import { getCached, setCached } from '../../../utils/cache';
import { CACHE_PREFIX_USAGE_COUNT, KV_KEY_REQUIRED_CHANNEL, FREE_USES_BEFORE_GATE } from '../../../constants';
import { trackEvent } from '../../../utils/analytics';

const USAGE_TTL = 60 * 60 * 24 * 90; // 90 days
const MEMBER_STATUSES = ['member', 'administrator', 'creator'];

/**
 * Check if a non-admin user is gated by channel subscription.
 * Increments their usage counter and returns true if they are blocked.
 */
export async function checkSubscriptionGate(
	ctx: Context,
	kv: KVNamespace,
	bot: Bot,
	analytics?: AnalyticsEngineDataset,
	platform?: string
): Promise<boolean> {
	const channelUsername = await kv.get(KV_KEY_REQUIRED_CHANNEL);
	if (!channelUsername) return false; // Gate disabled — no channel configured

	const userId = ctx.from!.id;

	// Increment usage counter
	const usageKey = `${CACHE_PREFIX_USAGE_COUNT}${userId}`;
	const usageStr = await getCached(kv, usageKey);
	const usage = usageStr ? parseInt(usageStr, 10) : 0;
	const newUsage = usage + 1;
	await setCached(kv, usageKey, String(newUsage), USAGE_TTL);

	// Allow within free tier
	if (newUsage <= FREE_USES_BEFORE_GATE) return false;

	// Check channel membership
	try {
		const member = await bot.api.getChatMember(channelUsername, userId);
		if (MEMBER_STATUSES.includes(member.status)) return false;
	} catch (e) {
		console.warn('[GATE] getChatMember failed, allowing:', e);
		return false; // Graceful fail-open
	}

	// User is not subscribed — track and show gate message
	trackEvent(analytics, { userId, platform: platform ?? 'unknown', userType: 'guest', action: 'gate_blocked' });
	const channelName = channelUsername.replace('@', '');
	await ctx.reply(
		`🔒 You've used your ${FREE_USES_BEFORE_GATE} free downloads\\!\n\n` +
		`Join our channel to keep downloading:\n` +
		`👉 [t\\.me/${channelName}](https://t.me/${channelName})`,
		{
			parse_mode: 'MarkdownV2',
			reply_markup: {
				inline_keyboard: [[
					{ text: '📢 Join Channel', url: `https://t.me/${channelName}` },
					{ text: '✅ I Joined', callback_data: 'subscription:verify' }
				]]
			}
		}
	);
	return true; // Blocked
}
