# Changelog

## 1.0.0 (2026-09-04)


### Features

* add .claude/settings.json to .gitignore ([adc1bad](https://github.com/EngDawood/download-media/commit/adc1bad170cd5c599405e92d9662afb8c92ce652))
* add /allowlist command and admin bypass for blocked domains ([f8498a7](https://github.com/EngDawood/download-media/commit/f8498a708b8775f02d7fb188a6c70a0d0fd81377))
* add adult domain blocking, domain allowlist/reporting, and document file support ([b43b672](https://github.com/EngDawood/download-media/commit/b43b672b684f6db162168c7f8a36e8ce519ba51e))
* Add Instagram story downloads, custom footers, and RSSHub support ([e64b36a](https://github.com/EngDawood/download-media/commit/e64b36aa1e25ea170daa3f6ad72edbd31c1e63e5))
* Add RSSHub dependency and remove commitlint packages ([70dc2c5](https://github.com/EngDawood/download-media/commit/70dc2c5ba2a574dfb54b4338a33de9aa1d0aaf03))
* add urls.json for platform URL configurations ([6f24674](https://github.com/EngDawood/download-media/commit/6f246743b0d6754374ddd490f87ed8ae3aa87db7))
* adult domain blocking, allowlist reporting, and document file support ([b8c9983](https://github.com/EngDawood/download-media/commit/b8c9983aa4fa9c3fa075bc07b66d256b4c5c817d))
* **api:** add documentation for download-media-bot API integration ([e53e4f7](https://github.com/EngDawood/download-media/commit/e53e4f7b607fabc841d4a7dbd89b16f43eeee9bc))
* **claude:** Add code-searcher agent and initial settings ([773fe0a](https://github.com/EngDawood/download-media/commit/773fe0a1590a1879e1551a2be998ef802f79105c))
* **download:** enhance too large file handling with detailed file inf ([3b554e6](https://github.com/EngDawood/download-media/commit/3b554e64c16f53eb6f97657c604efb9f5e13c06d))
* **downloader:** Add core interfaces and types for media downloader ([c818dcc](https://github.com/EngDawood/download-media/commit/c818dcc98edc3dd26f491f7bea8863831ee411ac))
* **downloader:** add Douyin, HEAD-probe direct media, reject Spotify albums ([d2fd5bc](https://github.com/EngDawood/download-media/commit/d2fd5bc0c76424c4249b66c979f6e44a90d69fbb))
* **downloader:** add support for rendering long-form content as Markdown in DownloaderResult ([11c07fd](https://github.com/EngDawood/download-media/commit/11c07fd721b5f2d2a3010a6034e502cc6272838e))
* **downloader:** bump default timeout + auto-retry on transient failures ([4ad09aa](https://github.com/EngDawood/download-media/commit/4ad09aa147393480760d10e773e6ee9ab575d89f))
* **downloader:** enhance error handling and media processing ([da46450](https://github.com/EngDawood/download-media/commit/da464502766a3a0449d67fa76e021952e939bf52))
* **downloader:** Implement AIO media parsing and btch client ([95d4133](https://github.com/EngDawood/download-media/commit/95d4133e4d89c6acfb62b7d889ad0722407204f0))
* **downloader:** implement quality ladder for video downloads and enhance media handling ([2163ae1](https://github.com/EngDawood/download-media/commit/2163ae1c6c1ca512e32244c4b6dabeadc6a4c206))
* Enhance admin tools, logging, and URL normalization ([3c6dc04](https://github.com/EngDawood/download-media/commit/3c6dc04e92fe5dabf4c91185a87996ba6ffeda21))
* enhance media handling by adding titles to responses and improving error handling ([d406c6c](https://github.com/EngDawood/download-media/commit/d406c6c982a1ba4571d272c1fe12ebdf78d23a45))
* enhance stats with download history and user blocking ([030cae5](https://github.com/EngDawood/download-media/commit/030cae5b87c77de19a8d7387efeb4c9628a83e1c))
* expose the downloader over a public API and an MCP server ([cfe4e99](https://github.com/EngDawood/download-media/commit/cfe4e999dec4d438e364905832e98d0fe216af5d))
* **facebook:** enhance Facebook extraction with share URL resolution and timeout adjustments ([04ab7a0](https://github.com/EngDawood/download-media/commit/04ab7a0fca591c2125fafc95ed52d8b559d48b80))
* **i18n:** add browser download hint to Arabic and English translations ([cf3f41d](https://github.com/EngDawood/download-media/commit/cf3f41d976f65e1825d06341132053715faebb3b))
* **i18n:** add retry messages for download delays and busy servers in Arabic and English translations ([a3a567f](https://github.com/EngDawood/download-media/commit/a3a567f12cea9416943d5fb1044f04650e804c09))
* implement article parsing and rendering for FxTwitter articles ([45c9bfa](https://github.com/EngDawood/download-media/commit/45c9bfac70d7553bbc9e19c448ae7a435958a90b))
* improve UX, fix Twitter captions, YouTube URL normalization, and guest MP3 ([#5](https://github.com/EngDawood/download-media/issues/5)) ([7c90d4a](https://github.com/EngDawood/download-media/commit/7c90d4aab8568cb5795d96173f797b64e1b5d8b1))
* Introduce OpenCommit CI workflow and project TODO list ([60bf947](https://github.com/EngDawood/download-media/commit/60bf947cda8bb86583827f11887aefa23f92064b))
* **mcp:** enhance MCP server to accept API key via URL path segment for compatibility with custom connectors ([7cbce01](https://github.com/EngDawood/download-media/commit/7cbce01406e4069da37165d9f8be9632f0b83a93))
* **media-downloader:** Improve BTCH API resilience and TikTok parsing ([e657052](https://github.com/EngDawood/download-media/commit/e657052be60cd4b2187893600b797adb3116c2aa))
* **readme:** update supported platforms and add new commands for Instagram stories and admin functionalities ([aae4a2e](https://github.com/EngDawood/download-media/commit/aae4a2e947de56d1e3f1e9ea7a66276601045290))
* **skills:** add improve-claude-md skill for enhancing CLAUDE.md files with conditional relevance ([d664668](https://github.com/EngDawood/download-media/commit/d6646684582c6c8f8f50c81f5d2cd1721c1bb5ae))
* **stats:** add /stats admin command with KV-based usage tracking ([2cd864f](https://github.com/EngDawood/download-media/commit/2cd864f9f7d5958c7877c39d714f85c74fbd5559))
* **stats:** add platform breakdown for error statistics and enhance failure reporting ([cefe254](https://github.com/EngDawood/download-media/commit/cefe254b7573c113e09106043bd056b7f1248eb1))
* **stats:** Enhance statistics with new gate, hourly, and user views ([56e95f1](https://github.com/EngDawood/download-media/commit/56e95f1883274001bd00e8c1b22883d707ec414f))
* **stats:** implement canonical platform function and improve stats handling ([89c5250](https://github.com/EngDawood/download-media/commit/89c525026e75504ba420f4c15addbf4a57424162))
* **telegram-bot:** Add admin retry for failed downloads and report deduplication ([609cd08](https://github.com/EngDawood/download-media/commit/609cd08ae5e628a668e826a822958a3c6babdc92))
* **telegraph:** add fullText support for long-form posts and improve entityMap handling ([7c642c5](https://github.com/EngDawood/download-media/commit/7c642c559a6366c34e237208b0d88e6a667b9a60))
* **tiktok:** enhance decodeTiktokDirectUrl to ensure valid URL extraction and handle incomplete decodes ([bc33223](https://github.com/EngDawood/download-media/commit/bc33223ab726da8d807d71b114149894c0e09f9c))
* **twitter:** add parseTwimgVariants function and corresponding tests for media variant parsing ([bbbcc45](https://github.com/EngDawood/download-media/commit/bbbcc459c79539f02d5d62d9240fa2e3a627dc81))
* **twitter:** add support for publishing Twitter articles to Telegraph via FxTwitter API ([84ab691](https://github.com/EngDawood/download-media/commit/84ab691d70066650a7b1f6116d9e7df0b0353e06))
* **twitter:** add support for text-only tweets via FxTwitter API ([84ab691](https://github.com/EngDawood/download-media/commit/84ab691d70066650a7b1f6116d9e7df0b0353e06))
* **twitter:** enhance media handling and add follow-up messages for threads ([1d8fc76](https://github.com/EngDawood/download-media/commit/1d8fc76223b8080ce1cf67f108fc7ad82e69f380))
* update telegram bot logic, i18n, and project configuration ([f3749c2](https://github.com/EngDawood/download-media/commit/f3749c270ed19053fbe10f14a1b466b4b7d80ed2))
* **url-detector:** download any non-page file, not just media ([1a4caf0](https://github.com/EngDawood/download-media/commit/1a4caf041b5736bfaa16c20ab2e76d31b4c4219a))


### Bug Fixes

* **captions:** apply bold formatting consistently across all platforms ([88b1658](https://github.com/EngDawood/download-media/commit/88b165894c95367d1a00a70336e4c8f31efd5cc0))
* **downloader:** address top runtime error classes from D1 stats ([1a0ee5d](https://github.com/EngDawood/download-media/commit/1a0ee5d5b3991d4330e4ca75f4bea958008be5cc))
* **downloader:** address top runtime error classes from D1 stats ([269e843](https://github.com/EngDawood/download-media/commit/269e84357b2962ebca8b0fe79fc677355da2da05))
* make recordError/recordSuccess absorb KV failures silently ([a0c2942](https://github.com/EngDawood/download-media/commit/a0c2942bf4036553ba9ec127c6e0743931e55dcd))
* prevent uncaught exceptions when error display fails in downloadAndSendMedia ([008b6fc](https://github.com/EngDawood/download-media/commit/008b6fcb955b6a8416a9f7d39e56d73bfc12620c))
* resolve YouTube hang, remove download lock, and support protocol-less URLs ([eb52d93](https://github.com/EngDawood/download-media/commit/eb52d93af7f2850e0264be792948ed261cc9ba91))
* restore status message for YouTube and all no-statusMessageId downloads ([8bbc37f](https://github.com/EngDawood/download-media/commit/8bbc37f135eb54821d95e43a4ea349a13b1a8c98))
* **stats:** enhance error handling in stats writing and update user stats logic ([89c5250](https://github.com/EngDawood/download-media/commit/89c525026e75504ba420f4c15addbf4a57424162))
* **telegram:** change update handling to await instead of waitUntil to prevent download cancellations ([b014355](https://github.com/EngDawood/download-media/commit/b014355ec591dedff001af077ab4fea14082edd5))
* **twitter:** fix duplicate video from fallback endpoint ([d2ec7f5](https://github.com/EngDawood/download-media/commit/d2ec7f5d25ade7dac5c3f6e85b342044ce979636))
* **twitter:** improve error handling for FxTwitter API responses ([84ab691](https://github.com/EngDawood/download-media/commit/84ab691d70066650a7b1f6116d9e7df0b0353e06))
* **twitter:** prevent duplicate video send ([f5ce62d](https://github.com/EngDawood/download-media/commit/f5ce62d022c0b5c972dfcc81bc6adfc4f1fc87c3))
* **wrangler:** ensure workers_dev remains true to maintain Telegram webhook functionality ([6a7749a](https://github.com/EngDawood/download-media/commit/6a7749af29bc708149be326555d23713a9803b75))

## 0.0.0 (2026-03-16)


### Bug Fixes

* **captions:** apply bold formatting consistently across all platforms ([88b1658](https://github.com/EngDawood/download-media/commit/88b165894c95367d1a00a70336e4c8f31efd5cc0))
* **twitter:** fix duplicate video from fallback endpoint ([d2ec7f5](https://github.com/EngDawood/download-media/commit/d2ec7f5d25ade7dac5c3f6e85b342044ce979636))
* **twitter:** prevent duplicate video send ([f5ce62d](https://github.com/EngDawood/download-media/commit/f5ce62d022c0b5c972dfcc81bc6adfc4f1fc87c3))


### Features

* add /allowlist command and admin bypass for blocked domains ([f8498a7](https://github.com/EngDawood/download-media/commit/f8498a708b8775f02d7fb188a6c70a0d0fd81377))
* add adult domain blocking, domain allowlist/reporting, and document file support ([b43b672](https://github.com/EngDawood/download-media/commit/b43b672b684f6db162168c7f8a36e8ce519ba51e))
* enhance stats with download history and user blocking ([030cae5](https://github.com/EngDawood/download-media/commit/030cae5b87c77de19a8d7387efeb4c9628a83e1c))
* improve UX, fix Twitter captions, YouTube URL normalization, and guest MP3 ([#5](https://github.com/EngDawood/download-media/issues/5)) ([7c90d4a](https://github.com/EngDawood/download-media/commit/7c90d4aab8568cb5795d96173f797b64e1b5d8b1))
* **stats:** add /stats admin command with KV-based usage tracking ([2cd864f](https://github.com/EngDawood/download-media/commit/2cd864f9f7d5958c7877c39d714f85c74fbd5559))
