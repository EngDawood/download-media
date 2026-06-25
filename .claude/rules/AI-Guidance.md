
## AI Guidance

- Ignore GEMINI.md and GEMINI-*.md files.
- Delegate code searches, inspections, and analysis to subagents to save main context space.
- Always read and understand files before proposing edits. Never speculate about code you haven't inspected.
- Reflect on tool results before proceeding. Plan next steps based on new information.
- Summarize what you did after completing a task.
- Run independent tool calls in parallel. Run dependent calls sequentially — never guess missing parameters.
- Verify your solution before finishing.
- Do what was asked — nothing more, nothing less.
- Never create files unless absolutely necessary. Prefer editing existing files.
- Never proactively create documentation files (*.md, README). Only if explicitly requested.
- Clean up any temporary files you create at the end of the task.
- When modifying core context files, also update memory bank documentation.
- When committing, exclude CLAUDE.md and CLAUDE-*.md files. Never delete them.
- Do not make changes unless clearly instructed. When intent is ambiguous, default to research and recommendations.

## URL Fetching

- When fetching a URL to read content (docs, articles, APIs), prefix with `https://markdown.new/` to reduce tokens.
- Do not use this when you need raw HTML structure (scraping, DOM inspection).

## Git Staging

- Never use `git add .` or `git add -A`.
- Only stage specific files you edited in this session.
- Ask before staging files outside your changes.
