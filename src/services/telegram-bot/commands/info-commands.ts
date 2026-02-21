import type { Bot } from 'grammy';
import { clearAdminState } from '../storage/admin-state';
import { KV_KEY_REQUIRED_CHANNEL, FREE_USES_BEFORE_GATE } from '../../../constants';

/**
 * Register basic information and control commands.
 */
export function registerInfoCommands(bot: Bot, env: Env, kv: KVNamespace): void {
	const adminId = parseInt(env.ADMIN_TELEGRAM_ID, 10);

	bot.command('start', async (ctx) => {
		const isAdmin = ctx.from?.id === adminId;

		if (isAdmin) {
			await ctx.reply(
				'<b>Media Download Bot — Admin</b>\n\n' +
					'Send any supported URL to download media.\n\n' +
					'<b>Platforms:</b>\n' +
					'• TikTok — Video/Audio picker (slideshows auto-download)\n' +
					'• Instagram — Auto-download\n' +
					'• X / Twitter — Auto-download\n' +
					'• YouTube — Quality picker\n' +
					'• Facebook — HD/SD picker\n' +
					'• Threads — Auto-download\n' +
					'• SoundCloud — Audio\n' +
					'• Spotify — Audio\n' +
					'• Pinterest — Auto-download\n\n' +
					'<b>Admin commands:</b>\n' +
					'/setchannel @username — Set subscription channel\n' +
					'/cancel — Cancel current action\n' +
					'/help — Full details',
				{ parse_mode: 'HTML' }
			);
			return;
		}

		// Guest: show channel requirement if configured
		const channelUsername = await kv.get(KV_KEY_REQUIRED_CHANNEL);
		const channelLine = channelUsername
			? `\n⚡ <b>${FREE_USES_BEFORE_GATE} free downloads</b> — then join ${channelUsername} to keep going.\n`
			: '';

		await ctx.reply(
			'<b>Media Download Bot</b>\n\n' +
				'Send a URL from any supported platform and I\'ll download the media for you.\n\n' +
				'<b>Supported:</b> TikTok, Instagram, X/Twitter, YouTube, Facebook, Threads, SoundCloud, Spotify, Pinterest\n' +
				channelLine +
				'\n/help — More info',
			{ parse_mode: 'HTML' }
		);
	});

	bot.command('help', async (ctx) => {
		const isAdmin = ctx.from?.id === adminId;

		if (isAdmin) {
			await ctx.reply(
				'<b>How to use — Admin</b>\n\n' +
					'Send any supported URL. YouTube, TikTok, and Facebook show quality pickers; all others auto-download.\n\n' +
					'<b>Quality pickers:</b>\n' +
					'• <b>YouTube</b> — up to 4 quality options + Audio\n' +
					'• <b>TikTok</b> — Video/Audio (slideshows skip the picker)\n' +
					'• <b>Facebook</b> — HD/SD when multiple qualities available\n\n' +
					'<b>Large files (&gt;50MB):</b>\n' +
					'Shows direct URL + <a href="https://t.me/urluploadxbot">@urluploadxbot</a> option.\n\n' +
					'<b>Admin commands:</b>\n' +
					'<code>/setchannel @username</code> — Require users to join a channel after ' +
					`${FREE_USES_BEFORE_GATE} free downloads. Bot must be admin in that channel.\n` +
					'<code>/cancel</code> — Cancel the current download flow.',
				{ parse_mode: 'HTML' }
			);
			return;
		}

		// Guest
		const channelUsername = await kv.get(KV_KEY_REQUIRED_CHANNEL);
		const freeTierLine = channelUsername
			? `\n<b>Free tier:</b> ${FREE_USES_BEFORE_GATE} downloads — then join ${channelUsername} to keep using the bot.`
			: '';

		await ctx.reply(
			'<b>How to use</b>\n\n' +
				'Send a URL and the bot downloads it for you.\n\n' +
				'<b>Large files (&gt;50MB):</b>\n' +
				'Shows the direct URL and a link to <a href="https://t.me/urluploadxbot">@urluploadxbot</a>.' +
				freeTierLine,
			{ parse_mode: 'HTML' }
		);
	});

	bot.command('cancel', async (ctx) => {
		await clearAdminState(kv, adminId);
		await ctx.reply('Action cancelled.');
	});
}
