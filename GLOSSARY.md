# Download Media Bot

A Telegram bot that turns a pasted social or file-host link into the media itself.

## Language

**Platform**:
A site the bot can download from (TikTok, YouTube, Pinterest, Google Drive and so on).
_Avoid_: Source, site, service

**Provider**:
The code that knows how to download from one Platform.
_Avoid_: Downloader, scraper, handler

**Media item**:
One file the bot sends back: a video, photo, audio or document.
_Avoid_: Asset, attachment, result

**Variant**:
Another quality of the same video, listed best first.
_Avoid_: Format, rendition

**Picker**:
The buttons that let the Admin choose a quality or format before downloading.
_Avoid_: Menu, selector

**Admin**:
The one Telegram user who gets Pickers and the admin commands.
_Avoid_: Owner, operator

**Guest**:
Any other user. Gets an automatic download with no Picker.
_Avoid_: Regular user, non-admin

**Download mode**:
What kind of file the user wants: automatic best, audio only, HD or SD.
_Avoid_: Format, type

**Story**:
An Instagram story, requested with `/story` by username or link.
_Avoid_: Highlight, reel

**URL-first send**:
Giving Telegram the media link and letting Telegram fetch it, instead of uploading the bytes ourselves.
_Avoid_: Pass-through, remote send

**Subscription gate**:
The rule that asks Guests to join a channel after a number of free downloads.
_Avoid_: Paywall, force-join
