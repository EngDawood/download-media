import type { Translations } from './en';

export const ar: Translations = {
	// --- /start command (admin) ---
	'start.admin.greeting': 'أهلاً {firstName}! 👋\n\n',
	'start.admin.body':
		'<b>بوت تحميل الوسائط — مشرف</b>\n\n' +
		'أرسل أي رابط مدعوم لتحميل الوسائط.\n\n' +
		'<b>المنصات:</b>\n' +
		'• YouTube — تحميل تلقائي للفيديو (زر 🎵 MP3 بعد التحميل)\n' +
		'• TikTok — اختيار فيديو/صوت (الصور تُحمّل تلقائياً)\n' +
		'• Facebook — اختيار HD/SD عند توفر جودات متعددة\n' +
		'• Instagram — تحميل تلقائي\n' +
		'• X / Twitter — تحميل تلقائي\n' +
		'• Threads — تحميل تلقائي\n' +
		'• SoundCloud — صوت\n' +
		'• Spotify — صوت\n' +
		'• Pinterest — تحميل تلقائي\n\n' +
		'<b>أوامر المشرف:</b>\n' +
		'/setchannel @username — تعيين قناة الاشتراك\n' +
		'/lang — تغيير لغة البوت\n' +
		'/cancel — إلغاء الإجراء الحالي\n' +
		'/help — التفاصيل الكاملة',

	// --- /start command (guest) ---
	'start.guest.body':
		'<b>بوت تحميل الوسائط</b>\n\n' +
		'أرسل رابط من أي منصة مدعومة وسأحمّل الوسائط لك.\n\n' +
		'<b>المدعومة:</b> TikTok, Instagram, X/Twitter, YouTube, Facebook, Threads, SoundCloud, Spotify, Pinterest\n',
	'start.guest.channel_line': '\n⚡ <b>{freeUses} تحميلات مجانية</b> — ثم انضم إلى {channel} للمتابعة.\n',
	'start.guest.help_hint': '\n/help — مزيد من المعلومات',

	// --- /help command (admin) ---
	'help.admin.body':
		'<b>طريقة الاستخدام — مشرف</b>\n\n' +
		'أرسل أي رابط مدعوم. TikTok و Facebook يعرضان خيارات الجودة؛ البقية تُحمّل تلقائياً.\n\n' +
		'• <b>YouTube</b> — تحميل تلقائي للفيديو، يعرض زر 🎵 MP3\n' +
		'• <b>TikTok</b> — فيديو/صوت (الصور تتخطى الاختيار)\n' +
		'• <b>Facebook</b> — HD/SD عند توفر جودات متعددة\n' +
		'• الملفات الكبيرة (&gt;50MB) تعرض الرابط المباشر للتحميل يدوياً\n\n' +
		'<b>أوامر المشرف:</b>\n' +
		'<code>/setchannel @username</code> — إلزام المستخدمين بالانضمام لقناة بعد {freeUses} تحميلات مجانية. يجب أن يكون البوت مشرفاً في القناة.\n' +
		'<code>/lang</code> — تغيير لغة البوت.\n' +
		'<code>/cancel</code> — إلغاء عملية التحميل الحالية.',

	// --- /help command (guest) ---
	'help.guest.body':
		'<b>طريقة الاستخدام</b>\n\n' +
		'أرسل رابط والبوت يحمّله لك.\n' +
		'الملفات الكبيرة (&gt;50MB) تعرض الرابط المباشر للتحميل يدوياً.',
	'help.guest.free_tier': '\n<b>الباقة المجانية:</b> {freeUses} تحميلات — ثم انضم إلى {channel} لمتابعة استخدام البوت.',
	'help.name_prefix': '{firstName}، إليك طريقة الاستخدام:\n\n',

	// --- /cancel ---
	'cancel.done': 'تم الإلغاء.',

	// --- text-input-handler ---
	'input.no_action': 'لا يوجد إجراء نشط. أرسل رابط مدعوم لتحميل الوسائط.',
	'input.fetching_post': 'جاري جلب معلومات المنشور...',
	'input.fetching_video': 'جاري جلب معلومات الفيديو...',
	'input.choose_format': '<b>{platform}</b> — اختر الصيغة:',
	'input.choose_quality': '<b>{platform}</b> — اختر الجودة:',
	'input.btn_video': 'فيديو',
	'input.btn_audio': 'صوت',

	// --- download-and-send ---
	'download.status': 'جاري تحميل {modeText} من {platform}...',
	'download.mode_audio': 'الصوت',
	'download.mode_media': 'الوسائط',
	'download.done': 'تم.',
	'download.done_info': 'تم. ({info})',
	'download.sent_album': 'تم إرسال {count} عناصر كألبوم.',
	'download.failed': 'فشل التحميل: {error}',
	'download.no_media': 'لم يتم العثور على وسائط.',
	'download.error': 'خطأ: {message}',
	'download.too_large': '😔 هذا الملف كبير جداً لـ Telegram.',
	'download.too_large_name': '😔 عذراً {firstName}، هذا الملف كبير جداً لـ Telegram.',
	'download.too_large_limit': '😔 هذا الملف كبير جداً لـ Telegram (الحد 50MB).',
	'download.too_large_limit_name': '😔 عذراً {firstName}، هذا الملف كبير جداً لـ Telegram (الحد 50MB).',
	'download.copy_url_hint': 'انسخ الرابط أدناه، ثم أرسله إلى @urluploadxbot',
	'download.btn_urluploadxbot': '🤖 فتح @urluploadxbot',
	'download.btn_browser': '🌐 فتح في المتصفح',
	'download.btn_mp3': '🎵 MP3',

	// --- callbacks ---
	'callback.session_expired': 'انتهت الجلسة. أرسل الرابط مرة أخرى.',
	'callback.cancelled': 'تم الإلغاء.',

	// --- subscription gate ---
	'gate.blocked':
		'🔒 لقد استخدمت {freeUses} تحميلات مجانية\\!\n\n' +
		'انضم لقناتنا لمتابعة التحميل:\n' +
		'👉 [t\\.me/{channelName}](https://t.me/{channelName})',
	'gate.btn_join': '📢 انضم للقناة',
	'gate.btn_verify': '✅ انضممت',

	// --- subscription callbacks ---
	'gate.access_granted_alert': '✅ تم منح الوصول!',
	'gate.welcome_alert': '✅ أهلاً! يمكنك الآن استخدام البوت.',
	'gate.subscribed':
		'✅ *تم منح الوصول\\!*\n\nأنت مشترك في [{channel}](https://t.me/{channelName})\\.\nأرسل رابط لتحميل الوسائط\\.',
	'gate.not_joined': '⚠️ لم تنضم بعد. يرجى الانضمام للقناة أولاً!',
	'gate.verify_failed': '⚠️ فشل التحقق. حاول مرة أخرى.',

	// --- bot-factory errors ---
	'error.callback': '⚠️ حدث خطأ. يرجى المحاولة مرة أخرى.',
	'error.general': '⚠️ حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
	'error.unauthorized': 'غير مصرح',

	// --- admin commands ---
	'setchannel.usage': 'الاستخدام: /setchannel @channelname',
	'setchannel.bot_info_fail': '⚠️ تعذر الحصول على معلومات البوت. حاول مرة أخرى.',
	'setchannel.not_admin':
		'⚠️ أنا في *{channel}* لكنني لست مشرفاً هناك\\.\n\n' +
		'يرجى ترقيتي لمشرف في القناة، ثم حاول مرة أخرى\\.',
	'setchannel.not_found':
		'❌ تعذر العثور على القناة *{channel}* أو ليس لدي صلاحية الوصول\\.\n\n' +
		'تأكد من:\n' +
		'1\\. القناة موجودة\n' +
		'2\\. أضفتني كمشرف',
	'setchannel.success':
		'✅ تم تعيين القناة المطلوبة [{channel}](https://t.me/{channelName})\\.\n\n' +
		'سيحتاج المستخدمون للانضمام إليها بعد {freeUses} تحميلات مجانية\\.',

	// --- /lang command ---
	'lang.current': '🌐 اللغة الحالية: <b>{language}</b>',
	'lang.pick': 'اختر لغتك:',
	'lang.changed': '✅ تم تغيير اللغة إلى <b>{language}</b>.',
};
