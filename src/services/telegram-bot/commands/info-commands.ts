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
		const name = ctx.from?.first_name || '';
		const greeting = name ? `Hi ${name}! 👋\n\n` : '';

		if (isAdmin) {
			await ctx.reply(
				greeting +
					'<b>Media Download Bot — Admin</b>\n\n' +
					'Send any supported URL to download media.\n\n' +
					'<b>Platforms:</b>\n' +
					'• YouTube — Auto-download video (🎵 MP3 button after)\n' +
					'• TikTok — Video/Audio picker (slideshows auto-download)\n' +
					'• Facebook — HD/SD picker when available\n' +
					'• Instagram — Auto-download\n' +
					'• X / Twitter — Auto-download\n' +
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
			greeting +
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
		const name = ctx.from?.first_name || '';
		const namePrefix = name ? `${name}, here's how it works:\n\n` : '';

		if (isAdmin) {
			await ctx.reply(
				namePrefix +
					'<b>How to use — Admin</b>\n\n' +
					'Send any supported URL. TikTok and Facebook show quality pickers; all others auto-download.\n\n' +
					'<b>Quality pickers:</b>\n' +
					'• <b>YouTube</b> — Auto-downloads video, offers 🎵 MP3 button\n' +
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
			namePrefix +
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
