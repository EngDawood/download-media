/**
 * Test script for snapsave-media-downloader
 * Usage:
 *   node scripts/test-snapsave.mjs
 *   node scripts/test-snapsave.mjs https://www.instagram.com/p/XXXX/
 *   node scripts/test-snapsave.mjs https://www.instagram.com/p/XXXX/ https://www.instagram.com/p/YYYY/
 */

import { snapsave } from 'snapsave-media-downloader';

// Default URLs to test if none provided via CLI
const DEFAULT_URLS = [
	'https://www.instagram.com/p/C51YHfWJwHK/',
	'https://www.instagram.com/p/DV2rIl-EVrd/',
];

const urls = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_URLS;

console.log(`\n🔍 Testing snapsave-media-downloader with ${urls.length} URL(s)...\n`);

for (const url of urls) {
	console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
	console.log(`📎 URL: ${url}`);
	try {
		const result = await snapsave(url);
		if (result.success) {
			const items = result.data?.media ?? [];
			console.log(`✅ Success — ${items.length} media item(s) found`);
			items.forEach((item, i) => {
				console.log(`  [${i + 1}] type: ${item.type}`);
				console.log(`       url: ${item.url?.slice(0, 80)}...`);
			});
		} else {
			console.log(`❌ Failed — ${result.message}`);
		}
	} catch (err) {
		console.log(`💥 Error — ${err.message}`);
	}
	console.log();
}
