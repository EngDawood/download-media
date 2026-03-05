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
		'/stats — عرض إحصائيات الاستخدام\n' +
		'/lang — تغيير لغة البوت\n' +
		'/cancel — إلغاء الإجراء الحالي\n' +
		'/block {userId} — حظر مستخدم\n' +
		'/unblock {userId} — فك حظر مستخدم\n' +
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
		'<code>/stats</code> — عرض إحصائيات استخدام البوت.\n' +
		'<code>/lang</code> — تغيير لغة البوت.\n' +
		'<code>/cancel</code> — إلغاء عملية التحميل الحالية.\n' +
		'<code>/block {userId}</code> — حظر مستخدم من استخدام البوت.\n' +
		'<code>/unblock {userId}</code> — فك حظر مستخدم.',

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

	// --- /stats command (admin only) ---
	'stats.header': '📊 <b>إحصائيات البوت</b>',
	'stats.links': '📥 الروابط المُرسَلة: <b>{count}</b>',
	'stats.success': '✅ ناجح: <b>{count}</b>',
	'stats.errors': '❌ أخطاء: <b>{count}</b>',
	'stats.users': '👥 مستخدمون فريدون: <b>{count}</b>',
	'stats.today': '📅 اليوم: <b>{links}</b> روابط، <b>{success}</b> ناجح',
	'stats.platforms_header': '📱 <b>حسب المنصة:</b>',
	'stats.top_users_header': '👤 <b>أكثر المستخدمين:</b>',
	'stats.user_row': '{rank}. {firstName} — {count} تحميلات',
	'stats.no_data': 'لا توجد إحصائيات بعد. أرسل بعض الروابط لبدء التتبع.',
	'stats.admin_only': '🔒 هذا الأمر للمشرف فقط.',
	'stats.btn_history': '📜 السجل',
	'stats.btn_blocked': '🚫 المحظورين',
	'stats.btn_back': '⬅️ رجوع',
	'stats.history_header': '📜 <b>التحميلات الأخيرة</b>',
	'stats.no_history': 'لا يوجد سجل تحميلات بعد.',
	'stats.blocked_header': '🚫 <b>المستخدمين المحظورين</b>',
	'stats.no_blocked': 'لا يوجد مستخدمين محظورين.',
	'stats.unblock_hint': '<i>استخدم /unblock {userId} لفك حظر مستخدم.</i>',

	// --- /block & /unblock commands ---
	'block.usage': 'الاستخدام: /block {userId}',
	'block.invalid_id': '⚠️ معرّف مستخدم غير صالح. يجب أن يكون رقماً.',
	'block.success': '✅ تم حظر المستخدم <code>{userId}</code>.',
	'unblock.usage': 'الاستخدام: /unblock {userId}',
	'unblock.success': '✅ تم فك حظر المستخدم <code>{userId}</code>.',
	'unblock.not_found': '⚠️ المستخدم <code>{userId}</code> غير موجود في قائمة الحظر.',

	// --- blocked user message ---
	'input.blocked': '🚫 أنت محظور من استخدام هذا البوت.',
	'input.blocked_domain': '🚫 هذا النطاق غير مسموح به.',
	'input.blocked_domain_btn': '✋ هذا الموقع ليس للبالغين',
	'report.sent': '✅ تم إرسال بلاغك إلى المشرف.',
	'report.admin_notify': '🚨 <b>بلاغ نطاق</b>\n\nالمستخدم <b>{user}</b> (ID: <code>{userId}</code>) يقول أن هذا الرابط حُظر بشكل خاطئ:\n<code>{url}</code>',
};
