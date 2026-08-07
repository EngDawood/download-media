/**
 * Verification script for specific Twitter/X URLs.
 * Tests how the new FixTwitter fallback handles different media types.
 */

const TEST_URLS = [
	'https://x.com/dawo5d/status/2023373894946898326', // Multiple images
	'https://x.com/dawo5d/status/2021724671259840792', // Single image
	'https://x.com/li1il1/status/2034336343321354608', // Video
	'https://x.com/li1il1/status/2033947925546455069', // Text/Media
	'https://x.com/i/status/2034432191850008699',      // /i/status/ format
];

async function verifyUrl(url) {
	console.log(`\n🔍 Testing: ${url}`);
	const match = url.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status\/(\d+)/i);
	if (!match) {
		console.log('❌ Invalid URL format for FixTwitter');
		return;
	}

	const [, user, id] = match;
	const fxApiUrl = `https://api.fxtwitter.com/${user}/status/${id}`;
	
try {
		const res = await fetch(fxApiUrl, { headers: { 'User-Agent': 'TelegramBot' } });
		if (!res.ok) {
			console.log(`❌ FixTwitter API failed: HTTP ${res.status}`);
			return;
		}

		const data = await res.json();
		if (!data.tweet) {
			console.log('❌ No tweet data found in response');
			return;
		}

		const media = data.tweet.media?.all || [];
		console.log(`✅ Success! Platform: ${data.tweet.author?.name || 'Unknown'}`);
		console.log(`📝 Text: ${data.tweet.text?.substring(0, 50)}...`);
		console.log(`🖼️ Media items: ${media.length}`);
		
		media.forEach((m, i) => {
			console.log(`   [${i+1}] Type: ${m.type.padEnd(6)} | URL: ${m.url}`);
		});
	} catch (err) {
		console.log(`💥 Error: ${err.message}`);
	}
}

async function run() {
	console.log('🚀 Verifying Twitter/X URLs against FixTwitter Fallback...');
	for (const url of TEST_URLS) {
		await verifyUrl(url);
	}
}

run().catch(console.error);
