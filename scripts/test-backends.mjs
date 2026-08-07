/**
 * Test script to verify all backend servers and platform endpoints.
 * Run with: node scripts/test-backends.mjs
 */

const BTCH_SERVERS = [
	'https://backend2.tioo.eu.org',
	'https://backend3.tioo.eu.org',
	'https://backend4.tioo.eu.org',
	'https://backend1.tioo.eu.org',
];

const PLATFORMS = [
	{ name: 'TikTok', endpoint: 'tiktok', url: 'https://www.tiktok.com/@walidfitaihi6/video/7615796318803381522' },
	{ name: 'TikTok (Alt)', endpoint: 'ttdl', url: 'https://www.tiktok.com/@walidfitaihi6/video/7615796318803381522' },
	{ name: 'YouTube', endpoint: 'youtube', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
	{ name: 'Instagram', endpoint: 'igdl', url: 'https://www.instagram.com/p/C4p7R-0I6eI/' },
	{ name: 'Facebook', endpoint: 'fbdown', url: 'https://fb.watch/qS7Z8r9H5_/' },
	{ name: 'Twitter/X', endpoint: 'twitter', url: 'https://x.com/elonmusk/status/1769446530661138837' },
	{ name: 'SoundCloud', endpoint: 'soundcloud', url: 'https://soundcloud.com/postmalone/circles' },
	{ name: 'Spotify', endpoint: 'spotify', url: 'https://open.spotify.com/track/3ee8SmsBhAlKgpv7m709ne' },
	{ name: 'AIO (Generic)', endpoint: 'aio', url: 'https://www.instagram.com/p/C4p7R-0I6eI/' },
];

const HEADERS = {
	'User-Agent': 'btch/6.0.25',
	'X-Client-Version': '6.0.25',
};

async function testEndpoint(server, platform) {
	const testUrl = `${server}/api/downloader/${platform.endpoint}?url=${encodeURIComponent(platform.url)}`;
	const start = Date.now();
	
	try {
		const res = await fetch(testUrl, { headers: HEADERS });
		const duration = Date.now() - start;
		
		if (!res.ok) {
			return { status: 'FAIL', code: res.status, duration, msg: `HTTP ${res.status}` };
		}
		
		const data = await res.json();
		const msg = (data.msg || data.message || '').toLowerCase();
		const isLimit = data.code === -1 || msg.includes('limit') || msg.includes('maintenance');
		
		if (isLimit) {
			return { status: 'LIMIT', code: data.code, duration, msg: data.msg || 'Rate Limited' };
		}
		
		if (data.error) {
			return { status: 'ERROR', code: 0, duration, msg: data.error };
		}
		
		return { status: 'OK', code: 0, duration, msg: 'Success' };
	} catch (err) {
		return { status: 'CRASH', code: 0, duration: Date.now() - start, msg: err.message };
	}
}

async function runTests() {
	console.log('🚀 Starting Backend & Platform Verification...\n');
	
	for (const server of BTCH_SERVERS) {
		console.log(`Checking Server: ${server}`);
		console.log('-'.repeat(60));
		
		for (const platform of PLATFORMS) {
			const result = await testEndpoint(server, platform);
			const icon = result.status === 'OK' ? '✅' : result.status === 'LIMIT' ? '⏳' : '❌';
			const label = platform.name.padEnd(12);
			const time = `${result.duration}ms`.padStart(8);
			
			console.log(`${icon} ${label} | ${result.status.padEnd(6)} | ${time} | ${result.msg}`);
		}
		console.log('\n');
	}
}

runTests().catch(console.error);
