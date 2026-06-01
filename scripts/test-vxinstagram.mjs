// test-vxinstagram.mjs
const url = 'https://www.instagram.com/p/DUlNAWHlRXx';
const shortcode = url.split('/p/')[1].replace(/\//g, '');

const res = await fetch('https://www.vxinstagram.com/p/' + shortcode, {
  headers: { 'User-Agent': 'Discordbot/1.0', 'Accept': 'text/html' }
});
const html = await res.text();

// Extract og: meta tags
const regex = /property="og:([^"]+)"\s+content="([^"]+)"/g;
let match;
const og = {};
while ((match = regex.exec(html)) !== null) {
  og[match[1]] = match[2];
}

console.log('\n=== vxinstagram OG tags ===');
for (const [k, v] of Object.entries(og)) {
  console.log(`og:${k} =>`, v.slice(0, 120));
}
