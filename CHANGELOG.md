# Changelog

## 1.0.0 (2026-04-13)


### Features

* add /allowlist command and admin bypass for blocked domains ([f8498a7](https://github.com/EngDawood/download-media/commit/f8498a708b8775f02d7fb188a6c70a0d0fd81377))
* add adult domain blocking, domain allowlist/reporting, and document file support ([b43b672](https://github.com/EngDawood/download-media/commit/b43b672b684f6db162168c7f8a36e8ce519ba51e))
* Add Instagram story downloads, custom footers, and RSSHub support ([e64b36a](https://github.com/EngDawood/download-media/commit/e64b36aa1e25ea170daa3f6ad72edbd31c1e63e5))
* Add RSSHub dependency and remove commitlint packages ([70dc2c5](https://github.com/EngDawood/download-media/commit/70dc2c5ba2a574dfb54b4338a33de9aa1d0aaf03))
* adult domain blocking, allowlist reporting, and document file support ([b8c9983](https://github.com/EngDawood/download-media/commit/b8c9983aa4fa9c3fa075bc07b66d256b4c5c817d))
* **claude:** Add code-searcher agent and initial settings ([773fe0a](https://github.com/EngDawood/download-media/commit/773fe0a1590a1879e1551a2be998ef802f79105c))
* **downloader:** Add core interfaces and types for media downloader ([c818dcc](https://github.com/EngDawood/download-media/commit/c818dcc98edc3dd26f491f7bea8863831ee411ac))
* **downloader:** Implement AIO media parsing and btch client ([95d4133](https://github.com/EngDawood/download-media/commit/95d4133e4d89c6acfb62b7d889ad0722407204f0))
* Enhance admin tools, logging, and URL normalization ([3c6dc04](https://github.com/EngDawood/download-media/commit/3c6dc04e92fe5dabf4c91185a87996ba6ffeda21))
* enhance stats with download history and user blocking ([030cae5](https://github.com/EngDawood/download-media/commit/030cae5b87c77de19a8d7387efeb4c9628a83e1c))
* improve UX, fix Twitter captions, YouTube URL normalization, and guest MP3 ([#5](https://github.com/EngDawood/download-media/issues/5)) ([7c90d4a](https://github.com/EngDawood/download-media/commit/7c90d4aab8568cb5795d96173f797b64e1b5d8b1))
* Introduce OpenCommit CI workflow and project TODO list ([60bf947](https://github.com/EngDawood/download-media/commit/60bf947cda8bb86583827f11887aefa23f92064b))
* **media-downloader:** Improve BTCH API resilience and TikTok parsing ([e657052](https://github.com/EngDawood/download-media/commit/e657052be60cd4b2187893600b797adb3116c2aa))
* **stats:** add /stats admin command with KV-based usage tracking ([2cd864f](https://github.com/EngDawood/download-media/commit/2cd864f9f7d5958c7877c39d714f85c74fbd5559))
* **stats:** Enhance statistics with new gate, hourly, and user views ([56e95f1](https://github.com/EngDawood/download-media/commit/56e95f1883274001bd00e8c1b22883d707ec414f))
* **telegram-bot:** Add admin retry for failed downloads and report deduplication ([609cd08](https://github.com/EngDawood/download-media/commit/609cd08ae5e628a668e826a822958a3c6babdc92))
* **twitter:** add support for publishing Twitter articles to Telegraph via FxTwitter API ([84ab691](https://github.com/EngDawood/download-media/commit/84ab691d70066650a7b1f6116d9e7df0b0353e06))
* **twitter:** add support for text-only tweets via FxTwitter API ([84ab691](https://github.com/EngDawood/download-media/commit/84ab691d70066650a7b1f6116d9e7df0b0353e06))
* update telegram bot logic, i18n, and project configuration ([f3749c2](https://github.com/EngDawood/download-media/commit/f3749c270ed19053fbe10f14a1b466b4b7d80ed2))


### Bug Fixes

* **captions:** apply bold formatting consistently across all platforms ([88b1658](https://github.com/EngDawood/download-media/commit/88b165894c95367d1a00a70336e4c8f31efd5cc0))
* make recordError/recordSuccess absorb KV failures silently ([a0c2942](https://github.com/EngDawood/download-media/commit/a0c2942bf4036553ba9ec127c6e0743931e55dcd))
* prevent uncaught exceptions when error display fails in downloadAndSendMedia ([008b6fc](https://github.com/EngDawood/download-media/commit/008b6fcb955b6a8416a9f7d39e56d73bfc12620c))
* resolve YouTube hang, remove download lock, and support protocol-less URLs ([eb52d93](https://github.com/EngDawood/download-media/commit/eb52d93af7f2850e0264be792948ed261cc9ba91))
* restore status message for YouTube and all no-statusMessageId downloads ([8bbc37f](https://github.com/EngDawood/download-media/commit/8bbc37f135eb54821d95e43a4ea349a13b1a8c98))
* **twitter:** fix duplicate video from fallback endpoint ([d2ec7f5](https://github.com/EngDawood/download-media/commit/d2ec7f5d25ade7dac5c3f6e85b342044ce979636))
* **twitter:** improve error handling for FxTwitter API responses ([84ab691](https://github.com/EngDawood/download-media/commit/84ab691d70066650a7b1f6116d9e7df0b0353e06))
* **twitter:** prevent duplicate video send ([f5ce62d](https://github.com/EngDawood/download-media/commit/f5ce62d022c0b5c972dfcc81bc6adfc4f1fc87c3))

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
