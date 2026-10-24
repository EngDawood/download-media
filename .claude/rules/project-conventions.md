## Bot Command Consistency Rule

**Whenever you add or remove a Telegram bot command, you MUST update all three places in sync:**

1. `src/routes/setup.ts` — `BOT_COMMANDS` array (passed to `setMyCommands`): add/remove the `{ command, description }` entry.
2. `src/services/telegram-bot/commands/info-commands.ts` — `/start` handler: update the listed commands in both admin and guest reply text.
3. `src/services/telegram-bot/commands/info-commands.ts` — `/help` handler: update the admin commands list to match.

Failing to keep these in sync means the Telegram command menu shows stale commands, or `/start`/`/help` describe commands that no longer exist.

## i18n Translation Sync Rule

**Whenever you change any user-facing string, you MUST update both locale files:**

1. `src/i18n/en.ts` — English strings
2. `src/i18n/ar.ts` — Arabic strings

This applies to: command text, error messages, button labels, status messages, picker prompts — any string that goes through `t()`. If you add a new key, TypeScript will catch a missing key in `ar.ts`. But if you only change the *content* of an existing key in one file, the other locale silently goes stale — so always update both.
