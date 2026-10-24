# Send media by URL first, upload only as a fallback

The Worker has tight CPU and memory limits, so it hands Telegram the media URL and lets Telegram fetch it. Telegram refuses URLs over 20MB or ones that need auth headers, so on that failure the bot offers Download, Cancel, or sending the link to @urluploadxbot. Files over 50MB can never be sent by a bot, so they get the link and the @urluploadxbot button only.
