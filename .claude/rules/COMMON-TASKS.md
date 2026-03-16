
## Shell Tool Rules

- Use `rg` for all content searches. Never use `grep` or `grep -r`.
- Use `fd` for all file/directory finding. Never use `find` or `ls -R`.
- Use `rg --files` to list all files recursively.
- Use `jq` for all JSON processing.
- Never use `tree` — it is not installed.
- Never pipe `cat` into `grep`. Use `rg pattern file` instead.
- `ls -la` is acceptable only for listing a single directory.
- When searching, start broad then narrow. Filter by file type early with `rg -t` or `rg -g`.
