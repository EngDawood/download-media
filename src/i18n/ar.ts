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
		'/setfreeuses {count} — تعيين حد التحميل المجاني\n' +
		'/adminstats — عرض إحصائيات مفصلة\n' +
		'/stats — عرض إحصائيات الاستخدام\n' +
		'/lang — تغيير لغة البوت\n' +
		'/cancel — إلغاء الإجراء الحالي\n' +
		'/block {userId} — حظر مستخدم\n' +
		'/unblock {userId} — فك حظر مستخدم\n' +
		'/allowlist — إدارة النطاقات المسموح بها\n' +
		'/broadcast — إرسال رسالة لجميع المستخدمين\n' +
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
		'<code>/setchannel @username</code> — إلزام المستخدمين بالانضمام لقناة بعد {freeUses} تحميلات مجانية.\n' +
		'<code>/setfreeuses {count}</code> — تغيير عدد مرات التحميل المجانية المسموح بها.\n' +
		'<code>/stats</code> أو <code>/adminstats</code> — عرض إحصائيات استخدام البوت.\n' +
		'<code>/lang</code> — تغيير لغة البوت.\n' +
		'<code>/cancel</code> — إلغاء عملية التحميل الحالية.\n' +
		'<code>/block {userId}</code> — حظر مستخدم من استخدام البوت.\n' +
		'<code>/unblock {userId}</code> — فك حظر مستخدم.\n' +
		'<code>/allowlist</code> — عرض وحذف النطاقات المسموح بها.\n' +
		'<code>/broadcast</code> — إرسال رسالة لجميع المستخدمين.',

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
	'input.btn_video': 'تحميل الفيديو',
	'input.btn_audio': 'تحميل الصوت',

	// --- download-and-send ---
	'download.status': 'جاري تحميل {modeText} من {platform}...',
	'download.mode_audio': 'الصوت',
	'download.mode_media': 'الوسائط',
	'download.done': 'تم.',
	'download.done_info': 'تم. ({info})',
	'download.sent_album': 'تم إرسال {count} عناصر كألبوم.',
	'download.failed': "❌ فشل التحميل. قد يكون الرابط غير صالح أو غير مدعوم. يرجى التحقق من الرابط والمحاولة مرة أخرى.\n<i>الخطأ: {error}</i>",
	'download.no_media': "😕 لم يتم العثور على وسائط. قد يكون المنشور خاصاً، محذوفاً، أو من منصة غير مدعومة. يرجى التحقق من الرابط والمحاولة مرة أخرى.",
	'download.error': "⚠️ فشل التحميل. حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
	'download.too_large': '😔 الملف كبير جداً. يحد Telegram من رفع الملفات إلى 50MB. يرجى تحميله يدوياً باستخدام الرابط أدناه.',
	'download.too_large_name': '😔 عذراً {firstName}، الملف كبير جداً. يحد Telegram من رفع الملفات إلى 50MB. يرجى تحميله يدوياً باستخدام الرابط أدناه.',
	'download.too_large_limit': '😔 الملف كبير جداً. يحد Telegram من رفع الملفات إلى 50MB. يرجى تحميله يدوياً باستخدام الرابط أدناه.',
	'download.too_large_limit_name': '😔 عذراً {firstName}، الملف كبير جداً. يحد Telegram من رفع الملفات إلى 50MB. يرجى تحميله يدوياً باستخدام الرابط أدناه.',
	'download.copy_url_hint': 'انسخ الرابط أدناه، ثم أرسله إلى @urluploadxbot',
	'download.btn_urluploadxbot': '🤖 إرسال إلى @urluploadxbot',
	'download.btn_browser': '🌐 فتح في المتصفح',
	'download.btn_mp3': '🎵 استخراج الصوت',
	'download.btn_retry': '🔄 إعادة محاولة التحميل',
	'download.btn_report_admin': '📬 الإبلاغ عن مشكلة',
	'download.contact_admin': 'إذا كنت تعتقد أن هذا خطأ من البوت، أرسل رسالة للمشرف بالخطأ هذا.',
	'download.report_sent': '✅ تم إرسال التقرير للمشرف.',
	'download.admin_error_report': '🚨 <b>تقرير تحميل فاشل</b>\n\n👤 المستخدم: {user}\n📱 المنصة: {platform}\n🔗 الرابط: <code>{url}</code>\n❌ الخطأ: <code>{error}</code>',

	// --- callbacks ---
	'callback.session_expired': "⏱ انتهت الجلسة. يرجى إرسال الرابط مجدداً للبدء من جديد.",
	'callback.cancelled': 'تم الإلغاء.',

	// --- subscription gate ---
	'gate.blocked':
		'🔒 تم الوصول للحد المجاني\. لقد استخدمت {freeUses} تحميلات مجانية\!\n\n' +
		'انضم لقناتنا لمتابعة التحميل:\n' +
		'👉 [t\.me/{channelName}](https://t.me/{channelName})',
	'gate.btn_join': '📢 انضم للقناة',
	'gate.btn_verify': '✅ التحقق من الاشتراك',

	// --- subscription callbacks ---
	'gate.access_granted_alert': '✅ تم منح الوصول!',
	'gate.welcome_alert': '✅ أهلاً! يمكنك الآن استخدام البوت.',
	'gate.subscribed':
		'✅ *تم منح الوصول\\!*\n\nأنت مشترك في [{channel}](https://t.me/{channelName})\\.\nأرسل رابط لتحميل الوسائط\\.',
	'gate.not_joined': '⚠️ لم يتم العثور على اشتراك. يرجى الانضمام للقناة أولاً، ثم النقر على تحقق.',
	'gate.verify_failed': '⚠️ فشل التحقق. لم نتمكن من تأكيد اشتراكك. يرجى المحاولة مرة أخرى.',

	// --- bot-factory errors ---
	'error.callback': '⚠️ فشل الإجراء. حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
	'error.general': '⚠️ فشل الإجراء. حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
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
	'setfreeuses.usage': 'الاستخدام: /setfreeuses {number}',
	'setfreeuses.success': '✅ تم تحديث حد التحميل المجاني إلى <b>{count}</b>.',
	'setfreeuses.invalid': '⚠️ رقم غير صالح.',

	// --- /lang command ---
	'lang.current': '🌐 اللغة الحالية: <b>{language}</b>',
	'lang.pick': 'اختر لغتك:',
	'lang.changed': '✅ تم تغيير اللغة إلى <b>{language}</b>.',

	// --- /stats command (admin only) ---
	'stats.header': '📊 <b>إحصائيات البوت</b>',
	'stats.start_users': '🚀 المستخدمون الذين بدأوا البوت: <b>{count}</b>',
	'stats.links': '📥 الروابط المُرسَلة: <b>{count}</b>',
	'stats.success': '✅ ناجح: <b>{count}</b> ({rate}%)',
	'stats.errors': '❌ أخطاء: <b>{count}</b>',
	'stats.users': '👥 مستخدمون نشطون: <b>{count}</b>',
	'stats.today': '📅 اليوم: <b>{links}</b> روابط، <b>{success}</b> ناجح',
	'stats.platforms_header': '📱 <b>حسب المنصة:</b>',
	'stats.top_users_header': '👤 <b>أكثر المستخدمين:</b>',
	'stats.user_row': '{rank}. {firstName} — {count} تحميلات',
	'stats.no_data': 'لا توجد إحصائيات بعد. أرسل بعض الروابط لبدء التتبع.',
	'stats.admin_only': '🔒 هذا الأمر للمشرف فقط.',
	'stats.btn_daily': '📅 عرض اليومي',
	'stats.btn_history': '📜 عرض السجل',
	'stats.btn_today_history': '📜 سجل اليوم',
	'stats.btn_blocked': '🚫 عرض المحظورين',
	'stats.btn_back': '⬅️ رجوع',
	'stats.daily_header': '📅 <b>الإحصاء اليومي — آخر 7 أيام</b>',
	'stats.today_label': 'اليوم',
	'stats.yesterday_label': 'أمس',
	'stats.daily_row': '<b>{label}:</b> {links} روابط، {success} ✅',
	'stats.daily_row_empty': '<b>{label}:</b> —',
	'stats.history_header': '📜 <b>التحميلات الأخيرة</b>',
	'stats.today_history_header': '📜 <b>تحميلات اليوم</b>',
	'stats.no_history': 'لا يوجد سجل تحميلات بعد.',
	'stats.blocked_header': '🚫 <b>المستخدمين المحظورين</b>',
	'stats.no_blocked': 'لا يوجد مستخدمين محظورين.',
	'stats.unblock_hint': '<i>استخدم /unblock {userId} لفك حظر مستخدم.</i>',
	'stats.btn_failed': '❌ عرض الفاشلة',
	'stats.failed_header': '❌ <b>التحميلات الفاشلة</b>',
	'stats.no_failed': 'لا توجد تحميلات فاشلة مسجّلة.',

	// --- /block & /unblock commands ---
	'block.usage': 'الاستخدام: /block {userId}',
	'block.invalid_id': '⚠️ معرّف مستخدم غير صالح. يجب أن يكون رقماً.',
	'block.success': '✅ تم حظر المستخدم <code>{userId}</code>.',
	'unblock.usage': 'الاستخدام: /unblock {userId}',
	'unblock.success': '✅ تم فك حظر المستخدم <code>{userId}</code>.',
	'unblock.not_found': '⚠️ المستخدم <code>{userId}</code> غير موجود في قائمة الحظر.',

	// --- blocked user message ---
	'input.blocked': '🚫 تم رفض الوصول. لقد تم حظرك من استخدام هذا البوت.',
	'allowlist.header': '✅ <b>النطاقات المسموح بها</b>',
	'allowlist.empty': 'لا توجد نطاقات مسموح بها بعد.',
	'allowlist.removed': '🗑 تم حذف <b>{hostname}</b> من القائمة البيضاء.',
	'allowlist.not_found': '⚠️ النطاق غير موجود في القائمة البيضاء.',
	'input.instagram_story_unsupported': '📖 صيغة غير مدعومة. قصص Instagram غير مدعومة حالياً.',
	'input.blocked_domain': '🚫 تم حظر المحتوى. هذا النطاق غير مسموح به بسبب سياسات الأمان.',
	'input.blocked_domain_btn': '✋ الإبلاغ عن محتوى آمن',
	'report.sent': '✅ تم إرسال بلاغك إلى المشرف.',
	'report.admin_notify': '🚨 <b>بلاغ نطاق</b>\n\nالمستخدم <b>{user}</b> (ID: <code>{userId}</code>) يقول أن هذا الرابط حُظر بشكل خاطئ:\n<code>{url}</code>',

	// --- /broadcast command ---
	'broadcast.prompt': '📣 اكتب الرسالة التي تريد بثها لجميع المستخدمين.\n\nاستخدم /cancel للإلغاء.',
	'broadcast.preview': '📣 <b>معاينة البث:</b>\n\n{message}\n\n<i>هل تريد إرسال هذا لجميع المستخدمين؟</i>',
	'broadcast.btn_confirm': '✅ إرسال',
	'broadcast.btn_cancel': '❌ إلغاء',
	'broadcast.sending': '📤 جاري الإرسال لجميع المستخدمين...', 
	'broadcast.done': '✅ تم إرسال الرسالة إلى <b>{sent}</b> مستخدم. <b>{failed}</b> فشل.',
	'broadcast.no_users': '⚠️ لا يوجد مستخدمون للبث إليهم بعد.',
	'broadcast.cancelled': '❌ تم إلغاء البث.',
};
