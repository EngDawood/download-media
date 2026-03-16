# Download Media Bot

[![Code Quality](https://github.com/EngDawood/download-media/actions/workflows/code-quality.yml/badge.svg)](https://github.com/EngDawood/download-media/actions/workflows/code-quality.yml)
[![CodeQL](https://github.com/EngDawood/download-media/actions/workflows/codeql.yml/badge.svg)](https://github.com/EngDawood/download-media/actions/workflows/codeql.yml)
[![Commit Validator](https://github.com/EngDawood/download-media/actions/workflows/commitlint.yml/badge.svg)](https://github.com/EngDawood/download-media/actions/workflows/commitlint.yml)
[![Release](https://github.com/EngDawood/download-media/actions/workflows/release-please.yml/badge.svg)](https://github.com/EngDawood/download-media/actions/workflows/release-please.yml)

A high-performance, multi-platform media downloader Telegram bot built with **Hono**, **grammY**, and **Cloudflare Workers**. This bot allows users to download videos, photos, and audio from popular social media platforms directly within Telegram.

## 🚀 Features

- **Multi-Platform Support**: Download media from:
  - **TikTok**: Videos (no watermark), high-quality audio, and photo slideshows.
  - **Instagram**: Reels, videos, photos, and carousel posts.
  - **Twitter / X**: High-definition videos and photos.
  - **YouTube**: Videos (HD/SD) and MP3 audio extraction.
  - **Facebook**: Videos (HD/SD).
  - **Threads**: Videos and photos.
  - **SoundCloud**: High-quality audio tracks.
  - **Spotify**: Audio previews and track downloads.
  - **Pinterest**: Videos and high-resolution images.
- **Fast & Reliable**: Powered by Cloudflare's global network for low-latency responses.
- **Quality Options**: Integrated quality picker for platforms like YouTube and Facebook.
- **Auto-Setup**: Automated webhook and bot configuration on deployment.
- **Analytics**: Built-in download statistics and per-user tracking via Cloudflare KV.
- **Multi-language Support**: Automatically detects and uses the user's language.

## 🛠️ Tech Stack

- **[Hono](https://hono.dev/)**: Lightweight web framework for the Cloudflare Worker.
- **[grammY](https://grammy.dev/)**: Powerful and easy-to-use Telegram bot framework.
- **[Cloudflare Workers](https://workers.cloudflare.com/)**: Serverless execution platform.
- **[Cloudflare KV](https://www.cloudflare.com/products/workers-kv/)**: Persistent storage for caching and state management.
- **[Cloudflare Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)**: For real-time download metrics.

## 📋 Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) with Workers enabled.
- A Telegram bot token (obtained from [@BotFather](https://t.me/BotFather)).
- [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) installed locally.

## ⚙️ Configuration

### Environment Variables (`wrangler.jsonc`)

- `ADMIN_TELEGRAM_ID`: Your Telegram numeric ID (use [@userinfobot](https://t.me/userinfobot) to find it). This is required for admin commands like `/setchannel`.

### Secrets

Set these using `wrangler secret put`:

- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token from @BotFather.
- `TELEGRAM_WEBHOOK_SECRET`: A random string used to secure your webhook endpoint.

## 🚀 Installation & Deployment

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/EngDawood/download-media.git
    cd download-media
    ```

2.  **Install dependencies**:
    ```bash
    pnpm install
    ```

3.  **Configure `wrangler.jsonc`**:
    Update the `ADMIN_TELEGRAM_ID` in `wrangler.jsonc`.

4.  **Set Secrets**:
    ```bash
    pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN
    pnpm exec wrangler secret put TELEGRAM_WEBHOOK_SECRET
    ```

5.  **Deploy to Cloudflare**:
    ```bash
    pnpm deploy
    ```

6.  **Setup Webhook**:
    After deployment, visit `https://your-worker-url/setup` to finalize the bot configuration.

## 📖 Usage

### User Commands

- **/start**: Initialize the bot and receive a welcome message.
- **/help**: Get instructions on how to use the bot.
- **Send a URL**: Simply paste a link from any supported platform to start downloading.

### Admin Commands

- **/stats**: View download statistics and per-user usage.
- **/cancel**: Cancel the current pending download.

## 💻 Local Development

Run the bot locally for testing:

```bash
pnpm dev
```

## 🧪 Testing

Run the test suite using Vitest:

```bash
pnpm test
```

## 📜 License

This project is private. See [LICENSE](LICENSE) for details (if applicable).
