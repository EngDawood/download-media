/**
 * All user-facing copy for the public site, in both locales.
 *
 * Same rule as src/i18n: every string lives here in `en` and `ar`, so a missing
 * translation is a type error rather than a silently stale page. Markup structure
 * stays in home.ts / docs.ts; only words live here.
 */

export type SiteLocale = 'en' | 'ar';

export const LOCALES: SiteLocale[] = ['en', 'ar'];

/** Path prefix for a locale. English is at the root, Arabic under /ar. */
export function localePath(locale: SiteLocale, page: 'home' | 'docs'): string {
	const base = locale === 'ar' ? '/ar' : '';
	return page === 'docs' ? `${base}/docs` : base || '/';
}

interface Item {
	title: string;
	body: string;
}

export interface SiteCopy {
	dir: 'ltr' | 'rtl';
	htmlLang: string;
	skip: string;
	nav: {
		platforms: string;
		developers: string;
		docs: string;
		/** Label of the link that switches to the other locale. */
		switchTo: string;
		switchToShort: string;
		switchToLang: string;
	};
	cta: { telegram: string; docs: string };
	home: {
		title: string;
		description: string;
		headline: [string, string];
		sub: string;
		platformsLead: string;
		whatHead: string;
		whatSub: string;
		capabilities: Item[];
		devHead: string;
		devBody: string;
		devLink: string;
		labelRequest: string;
		labelResponse: string;
		knowHead: string;
		knowBody: string;
		noteStrong: string;
		noteBody: string;
	};
	docs: {
		title: string;
		description: string;
		heading: string;
		lead: string;
		tocLabel: string;
		toc: Record<'access' | 'rest' | 'response' | 'status' | 'mcp' | 'longform' | 'limits', string>;
		accessBody: string;
		accessWays: string;
		accessList: [string, string, string];
		accessNoteStrong: string;
		accessNoteBody: string;
		restBody: string;
		fieldHead: [string, string, string, string];
		fieldRows: Array<[string, string, string, string]>;
		codeAgainst: string;
		responseList: string[];
		statusHead: [string, string, string];
		statusRows: Array<[string, string, string]>;
		statusAfter: string;
		mcpBody: string;
		mcpClaudeCode: string;
		mcpConnector: string;
		toolHead: [string, string, string];
		toolRows: Array<[string, string, string]>;
		longformP1: string;
		longformP2: string;
		longformNoteStrong: string;
		longformNoteBody: string;
		limitsList: string[];
	};
	footer: { bot: string; channel: string; docs: string; status: string; note: string };
}

const en: SiteCopy = {
	dir: 'ltr',
	htmlLang: 'en',
	skip: 'Skip to content',
	nav: {
		platforms: 'Platforms',
		developers: 'Developers',
		docs: 'Docs',
		switchTo: 'العربية',
		switchToShort: 'ع',
		switchToLang: 'ar',
	},
	cta: { telegram: 'Open in Telegram', docs: 'Read the docs' },
	home: {
		title: 'Download video from TikTok, Instagram, YouTube | Telegram bot',
		description:
			'Telegram bot for downloading video, photo and audio from TikTok, Instagram, X, YouTube and six more platforms. Paste a link, get the file. No signup.',
		headline: ['Paste a link.', 'Get the file.'],
		sub: 'A Telegram bot that pulls video, photo, and audio off ten platforms. No ads, no watermarks, no signup.',
		platformsLead:
			'Ten platforms have a dedicated extractor: TikTok, Instagram, X, YouTube, Facebook, Threads, SoundCloud, Spotify, Pinterest, and GitHub. Any other link is still attempted through a generic fallback.',
		whatHead: 'What comes back',
		whatSub: 'Send the link, get the media. The bot works out the platform, the type, and the best available quality on its own.',
		capabilities: [
			{
				title: 'TikTok without the watermark',
				body: 'Clean video every time. Everything else comes back at the best quality the platform exposes.',
			},
			{ title: 'Audio on its own', body: 'Pull the track out of a YouTube video, a TikTok, a SoundCloud upload, or a Spotify link.' },
			{ title: 'Whole galleries, not the first frame', body: 'Carousels, albums, and photo slideshows return every item in the post.' },
			{ title: 'Instagram stories by username', body: 'Send <code>/story</code> with a handle and the current stories arrive as albums.' },
			{
				title: 'Long reads stay readable',
				body: 'X articles and self-reply threads are published to Telegraph so the full text is actually reachable.',
			},
			{ title: 'English and Arabic', body: 'The bot picks the language from your Telegram client, and <code>/lang</code> changes it.' },
		],
		devHead: 'Same pipeline, over HTTP',
		devBody:
			'The downloader is also a REST endpoint and an MCP server, so scripts and AI agents can use it without going through Telegram. Both return links, never file bytes, and both stay disabled until the operator sets an API key.',
		devLink: 'Read the full reference',
		labelRequest: 'Request',
		labelResponse: 'Response',
		knowHead: 'Worth knowing before you start',
		knowBody:
			"Media links are handed back as direct URLs from the source platform. They are usually signed and short lived, so save the file when you get it rather than storing the link. Anything over Telegram's 50 MB upload ceiling arrives as a link instead of a file, and adult domains are refused outright.",
		noteStrong: 'This is a personal project.',
		noteBody:
			'There is no uptime promise and no quota, and the downloads lean on external backends that occasionally go down. If a link fails, try it again in a minute.',
	},
	docs: {
		title: 'API and MCP reference | Download Media',
		description:
			'Reference for the Download Media REST endpoint and MCP server: authentication, request fields, response shape, status codes, and tools.',
		heading: 'API and MCP reference',
		lead: 'The same downloader the Telegram bot uses, exposed as a REST endpoint and as an MCP server for AI agents.',
		tocLabel: 'On this page',
		toc: {
			access: 'Access',
			rest: 'REST endpoint',
			response: 'Response shape',
			status: 'Status codes',
			mcp: 'MCP server',
			longform: 'Long-form content',
			limits: 'Limits',
		},
		accessBody:
			'Both surfaces are gated behind a single server-side secret. They fail closed: while the key is unset the endpoints answer <code>503</code> rather than serving anyone. Keys are issued by the operator, so ask before you build against this.',
		accessWays: 'Auth is accepted three ways:',
		accessList: [
			'An <code>X-API-Key</code> header. Prefer this.',
			'An <code>Authorization: Bearer</code> header.',
			'As the last path segment, <code>POST /mcp/&lt;key&gt;</code>, for MCP clients that cannot set custom headers.',
		],
		accessNoteStrong: 'The path form makes the URL a secret.',
		accessNoteBody:
			'Anything that logs full URLs will log the key with it. Use header auth wherever the client supports it, and rotate the key if a path-form URL leaks.',
		restBody: '<code>POST /api/download</code> takes a JSON body and returns the resolved media links.',
		fieldHead: ['Field', 'Type', 'Required', 'Notes'],
		fieldRows: [
			['url', 'string', 'yes', 'The post URL. Protocol-less forms like <code>tiktok.com/@user/video/1</code> are accepted and normalized.'],
			[
				'mode',
				'string',
				'no',
				'One of <code>auto</code>, <code>audio</code>, <code>hd</code>, <code>sd</code>. Anything else falls back to <code>auto</code>.',
			],
			['platform', 'string', 'no', 'Hint that skips hostname detection. Usually unnecessary, so leave it out.'],
		],
		codeAgainst: 'Things to code against:',
		responseList: [
			'Always read files from <code>media[].url</code>, and iterate the whole array. Galleries and albums return several items.',
			'<code>media[].type</code> tells you how to handle each file.',
			'Every field except <code>status</code> and <code>media</code> is optional. Code defensively.',
			'Links point at the source platform and are often signed and short lived. Fetch them promptly rather than storing them.',
			'No file bytes pass through this Worker, so download sizes are between you and the platform.',
		],
		statusHead: ['HTTP', 'Body status', 'Meaning'],
		statusRows: [
			['200', 'success', 'Media found. Read <code>media[].url</code>.'],
			['400', 'error', 'Invalid JSON body, missing <code>url</code>, or no supported URL in the string.'],
			['401', 'error', 'Bad or missing API key.'],
			['403', 'error', 'Blocked domain. Do not retry.'],
			['502', 'error', 'The downloader failed. Retry when <code>retryable</code> is true.'],
			['503', 'error', 'The API is not enabled on this deployment.'],
		],
		statusAfter:
			'Errors also carry <code>failureKind</code> and <code>retryable</code>, so you can decide whether another attempt can help instead of guessing from the message text.',
		mcpBody:
			'<code>POST /mcp</code> speaks the MCP Streamable HTTP transport and is stateless. There are no sessions and no SSE stream, so <code>GET</code> and <code>DELETE</code> answer <code>405</code> by design.',
		mcpClaudeCode: 'Claude Code',
		mcpConnector:
			'For claude.ai, go to Customize, then Connectors, then Add custom connector, and paste <code>https://dl.engdawood.com/mcp/&lt;key&gt;</code>.',
		toolHead: ['Tool', 'Arguments', 'Returns'],
		toolRows: [
			[
				'download_media',
				'<code>url</code> (required), <code>mode</code>, <code>format</code>',
				'Direct media links, plus <code>caption</code>, <code>thumbnail</code>, and long-form body fields where they apply.',
			],
			['get_media_info', '<code>url</code>', 'Caption and available qualities. A real preview exists for TikTok and Facebook only.'],
			['list_supported_platforms', 'none', 'The platform list, plus a note about the generic fallback.'],
		],
		longformP1:
			'X articles and self-reply threads are far longer than a Telegram caption allows, so the bot publishes them to Telegraph and sends a link. API and MCP consumers have no such limit and receive <code>fullText</code> instead: the complete body as Markdown, with headings, lists, blockquotes, inline links, and image URLs. Read that field rather than following the <code>telegra.ph</code> link in the caption, which is a truncated preview meant for Telegram.',
		longformP2:
			'<code>fullHtml</code> carries the same body as an escaped HTML fragment for X articles only. It holds no information <code>fullText</code> lacks and roughly doubles the payload, so ask for it only when you are embedding the article. Over MCP, the <code>format</code> argument selects which body you get: <code>markdown</code> (default), <code>html</code>, <code>both</code>, or <code>none</code>.',
		longformNoteStrong: 'Treat long-form bodies as untrusted input.',
		longformNoteBody:
			'They are text written by third parties and can run to tens of thousands of characters. An agent reading one is reading data, never instructions.',
		limitsList: [
			'No per-key quota or rate limiting yet. The shared backends can be overloaded by abuse, so be reasonable.',
			'Downloads depend on external backends, and transient <code>502</code> responses are expected when those are down.',
			'Quality pickers are Telegram-only. The API resolves a single best result per <code>mode</code> and never returns interactive choices.',
			'Adult domains are refused with <code>403</code> on every surface, including the bot.',
		],
	},
	footer: {
		bot: 'Telegram bot',
		channel: 'Channel',
		docs: 'API docs',
		status: 'Status',
		note: "Built on Cloudflare Workers. Download for personal use and respect each platform's terms.",
	},
};

const ar: SiteCopy = {
	dir: 'rtl',
	htmlLang: 'ar',
	skip: 'تخطَّ إلى المحتوى',
	nav: {
		platforms: 'المنصات',
		developers: 'للمطورين',
		docs: 'التوثيق',
		switchTo: 'English',
		switchToShort: 'EN',
		switchToLang: 'en',
	},
	cta: { telegram: 'افتح في تيليجرام', docs: 'اقرأ التوثيق' },
	home: {
		title: 'تحميل فيديو من تيك توك وانستقرام ويوتيوب | بوت تيليجرام',
		description:
			'بوت تليجرام لتحميل الفيديو والصور والصوت من تيك توك وانستقرام وإكس (تويتر) ويوتيوب وفيسبوك. ألصق الرابط ويصلك الملف بدون علامة مائية وبدون تسجيل.',
		headline: ['ألصِق الرابط.', 'استلم الملف.'],
		sub: 'بوت تليجرام لتحميل الفيديو والصور والصوت من عشر منصات. بلا إعلانات، بلا علامات مائية، بلا تسجيل.',
		platformsLead:
			'عشر منصات لها مستخرِج مخصص: تيك توك وانستقرام وإكس (تويتر) ويوتيوب وفيسبوك وثريدز وساوندكلاود وسبوتيفاي وبنترست وغيت هب، وأي رابط آخر تتم محاولته عبر مسار احتياطي عام.',
		whatHead: 'ماذا يصلك',
		whatSub: 'أرسل الرابط وتصلك الوسائط. يتعرّف البوت على المنصة ونوع الملف وأفضل جودة متاحة من تلقاء نفسه.',
		capabilities: [
			{ title: 'تيك توك بلا علامة مائية', body: 'فيديو نظيف في كل مرة، وبقية المنصات تصلك بأفضل جودة تتيحها.' },
			{ title: 'الصوت وحده', body: 'استخرج المقطع الصوتي من فيديو يوتيوب أو تيك توك أو ساوندكلاود أو رابط سبوتيفاي.' },
			{ title: 'الألبوم كاملًا لا الصورة الأولى', body: 'المنشورات المتعددة والألبومات وعروض الصور تصلك بكل عناصرها.' },
			{ title: 'ستوري إنستغرام بالمعرّف', body: 'أرسل <code>/story</code> مع اسم الحساب لتصلك الستوري الحالية على شكل ألبومات.' },
			{ title: 'المقالات الطويلة تبقى مقروءة', body: 'مقالات إكس والسلاسل تُنشر على تيليغراف ليصل إليك النص كاملًا.' },
			{ title: 'بالعربية والإنجليزية', body: 'يختار البوت اللغة من إعدادات تيليجرام لديك، و<code>/lang</code> تغيّرها.' },
		],
		devHead: 'المسار نفسه عبر HTTP',
		devBody:
			'الأداة متاحة أيضًا كنقطة REST وكخادم MCP، فتستطيع السكربتات ووكلاء الذكاء الاصطناعي استخدامها دون المرور بتيليجرام. كلاهما يعيد روابط لا ملفات، ويظلان معطّلين حتى يضبط المشغّل مفتاح الوصول.',
		devLink: 'اقرأ المرجع الكامل',
		labelRequest: 'الطلب',
		labelResponse: 'الاستجابة',
		knowHead: 'أمور تستحق المعرفة',
		knowBody:
			'تصلك الوسائط كروابط مباشرة من المنصة نفسها، وهي غالبًا موقّعة وقصيرة العمر، فاحفظ الملف فور وصوله بدل تخزين الرابط. وما يتجاوز حد الرفع في تيليجرام وهو 50 ميغابايت يصل كرابط بدل ملف، أما النطاقات الإباحية فمرفوضة تمامًا.',
		noteStrong: 'هذا مشروع شخصي.',
		noteBody:
			'لا يوجد التزام بزمن تشغيل ولا حصة استخدام، والتنزيل يعتمد على خوادم خارجية تتعطل أحيانًا. إن فشل رابط فأعد المحاولة بعد دقيقة.',
	},
	docs: {
		title: 'مرجع الواجهة وخادم MCP | Download Media',
		description: 'مرجع واجهة Download Media وخادم MCP: التوثيق وحقول الطلب وشكل الاستجابة ورموز الحالة والأدوات.',
		heading: 'مرجع الواجهة وخادم MCP',
		lead: 'أداة التنزيل نفسها التي يستخدمها بوت تيليجرام، متاحة كنقطة REST وكخادم MCP لوكلاء الذكاء الاصطناعي.',
		tocLabel: 'في هذه الصفحة',
		toc: {
			access: 'الوصول',
			rest: 'نقطة REST',
			response: 'شكل الاستجابة',
			status: 'رموز الحالة',
			mcp: 'خادم MCP',
			longform: 'المحتوى الطويل',
			limits: 'الحدود',
		},
		accessBody:
			'كلتا الواجهتين محميّة بمفتاح واحد على الخادم، وتفشلان مغلقتين: ما دام المفتاح غير مضبوط تُجيبان بالرمز <code>503</code> بدل أن تخدما أحدًا. المفاتيح يصدرها المشغّل، فاسأل قبل أن تبني عليها.',
		accessWays: 'يُقبل التوثيق بثلاث طرق:',
		accessList: [
			'ترويسة <code>X-API-Key</code>، وهي المفضّلة.',
			'ترويسة <code>Authorization: Bearer</code>.',
			'أو كآخر جزء في المسار، <code>POST /mcp/&lt;key&gt;</code>، للعملاء الذين لا يستطيعون إرسال ترويسات مخصصة.',
		],
		accessNoteStrong: 'صيغة المسار تجعل الرابط نفسه سرًّا.',
		accessNoteBody:
			'أي نظام يسجّل الروابط الكاملة سيسجّل المفتاح معها. استخدم التوثيق بالترويسة حيثما أمكن، وبدّل المفتاح إذا تسرّب رابط بهذه الصيغة.',
		restBody: 'تستقبل <code>POST /api/download</code> جسمًا بصيغة JSON وتعيد روابط الوسائط.',
		fieldHead: ['الحقل', 'النوع', 'مطلوب', 'ملاحظات'],
		fieldRows: [
			['url', 'نص', 'نعم', 'رابط المنشور. الصيغ بلا بروتوكول مثل <code>tiktok.com/@user/video/1</code> مقبولة وتُطبَّع.'],
			[
				'mode',
				'نص',
				'لا',
				'إحدى القيم <code>auto</code> أو <code>audio</code> أو <code>hd</code> أو <code>sd</code>، وأي قيمة أخرى ترجع إلى <code>auto</code>.',
			],
			['platform', 'نص', 'لا', 'تلميح يتخطى استنتاج المنصة من النطاق. نادرًا ما تحتاجه، فاتركه.'],
		],
		codeAgainst: 'ما ينبغي أن تبني عليه:',
		responseList: [
			'اقرأ الملفات دائمًا من <code>media[].url</code> ومُرّ على المصفوفة كلها، فالألبومات تعيد أكثر من عنصر.',
			'يخبرك <code>media[].type</code> بكيفية التعامل مع كل ملف.',
			'كل الحقول اختيارية عدا <code>status</code> و<code>media</code>، فاكتب كودك بحذر.',
			'الروابط تشير إلى المنصة نفسها وهي غالبًا موقّعة وقصيرة العمر، فحمّلها فورًا بدل تخزينها.',
			'لا تمر بايتات الملفات عبر هذا الـWorker، فحجم التنزيل شأن بينك وبين المنصة.',
		],
		statusHead: ['HTTP', 'حالة الجسم', 'المعنى'],
		statusRows: [
			['200', 'success', 'تم العثور على الوسائط. اقرأ <code>media[].url</code>.'],
			['400', 'error', 'جسم JSON غير صالح، أو <code>url</code> مفقود، أو لا رابط مدعوم في النص.'],
			['401', 'error', 'مفتاح خاطئ أو مفقود.'],
			['403', 'error', 'نطاق محظور، ولا فائدة من إعادة المحاولة.'],
			['502', 'error', 'فشل التنزيل. أعد المحاولة عندما تكون <code>retryable</code> مساوية لـ true.'],
			['503', 'error', 'الواجهة غير مفعّلة في هذا النشر.'],
		],
		statusAfter:
			'تحمل الأخطاء أيضًا <code>failureKind</code> و<code>retryable</code> لتقرر إن كانت إعادة المحاولة مجدية بدل التخمين من نص الرسالة.',
		mcpBody:
			'يتحدث <code>POST /mcp</code> بنقل MCP Streamable HTTP وهو عديم الحالة: لا جلسات ولا قناة SSE، لذا تجيب <code>GET</code> و<code>DELETE</code> بالرمز <code>405</code> عن قصد.',
		mcpClaudeCode: 'Claude Code',
		mcpConnector:
			'في claude.ai افتح Customize ثم Connectors ثم Add custom connector وألصق <code>https://dl.engdawood.com/mcp/&lt;key&gt;</code>.',
		toolHead: ['الأداة', 'الوسائط', 'ما تعيده'],
		toolRows: [
			[
				'download_media',
				'<code>url</code> (مطلوب)، <code>mode</code>، <code>format</code>',
				'روابط وسائط مباشرة، مع <code>caption</code> و<code>thumbnail</code> وحقول النص الطويل حيثما وُجدت.',
			],
			['get_media_info', '<code>url</code>', 'الوصف والجودات المتاحة. المعاينة الحقيقية متاحة لتيك توك وفيسبوك فقط.'],
			['list_supported_platforms', 'لا شيء', 'قائمة المنصات مع ملاحظة عن المسار الاحتياطي العام.'],
		],
		longformP1:
			'مقالات إكس والسلاسل أطول بكثير مما يسمح به وصف تيليجرام، لذا ينشرها البوت على تيليغراف ويرسل رابطًا. أما مستهلكو الواجهة وMCP فلا يقيّدهم هذا الحد ويصلهم <code>fullText</code>: النص الكامل بصيغة ماركداون بعناوينه وقوائمه واقتباساته وروابطه وعناوين صوره. اقرأ هذا الحقل بدل اتباع رابط <code>telegra.ph</code> في الوصف، فهو معاينة مبتورة موجّهة لتيليجرام.',
		longformP2:
			'يحمل <code>fullHtml</code> النص نفسه كجزء HTML مهرَّب، ولمقالات إكس وحدها. لا يضيف معلومة تنقص <code>fullText</code> ويضاعف الحجم تقريبًا، فاطلبه فقط عند تضمين المقالة فعليًا. وعبر MCP يحدد الوسيط <code>format</code> ما يصلك: <code>markdown</code> وهو الافتراضي، أو <code>html</code>، أو <code>both</code>، أو <code>none</code>.',
		longformNoteStrong: 'تعامل مع النصوص الطويلة كمدخلات غير موثوقة.',
		longformNoteBody: 'هي نصوص كتبها طرف ثالث وقد تبلغ عشرات الآلاف من المحارف. الوكيل الذي يقرأ واحدًا منها يقرأ بيانات لا تعليمات.',
		limitsList: [
			'لا حصة لكل مفتاح ولا تحديد لمعدل الطلبات حتى الآن، والخوادم المشتركة يمكن إثقالها بالإساءة، فكن معقولًا.',
			'يعتمد التنزيل على خوادم خارجية، وظهور <code>502</code> عابرة أمر متوقع عند تعطلها.',
			'منتقي الجودة خاص بتيليجرام. تعيد الواجهة أفضل نتيجة واحدة لكل <code>mode</code> ولا تعرض خيارات تفاعلية.',
			'النطاقات الإباحية مرفوضة بالرمز <code>403</code> على كل الواجهات بما فيها البوت.',
		],
	},
	footer: {
		bot: 'بوت تيليجرام',
		channel: 'القناة',
		docs: 'توثيق الواجهة',
		status: 'الحالة',
		note: 'مبني على Cloudflare Workers. نزّل للاستخدام الشخصي والتزم بشروط كل منصة.',
	},
};

export const SITE_COPY: Record<SiteLocale, SiteCopy> = { en, ar };
