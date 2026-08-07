# Status Fetch API

This is the main FixTweet API. It provides anyone access to the same exact data we use to generate FixTweet embeds for users, but in an easy-to-digest format for working with your existing scripts. It includes information based on Twitter APIs, including some data not accessible using Twitter's public API.

Also, unlike Twitter, **you don't need an API key**, and it's free! At the moment, there are currently no _strict_ rate limits, but please be nice! We reserve the right to block IP addresses and/or user agents that flood or abuse the API. We would _strongly prefer_ if you be a good netizen and identify your application in its User Agent as well.

## Note: These docs are new and will be improved over time

All options appended with `?` are optional.

### Status API Endpoint

## `https://api.fxtwitter.com/:screen_name?/status/:id/:translate_to?`

`screen_name` \- The screen name (@ handle) of the tweet, which is ignored

`id` \- The ID of the status (tweet)

`translate_to?` \- 2 letter ISO language code of the language you want to translate the tweet into

Returns a JSON object. Here is a sample:

```
{
    "code": 200,
    "message": "OK",
    "tweet": {
        "url": "https://twitter.com/dangeredwolf/status/1548602399862013953",
        "text": "I made my first ever TikTok....",
        "created_at": "Sun Jul 17 09:35:58 +0000 2022",
        "created_timestamp":1658050558,
        "author": {
            "name": "dangered wolf",
            "screen_name": "dangeredwolf",
            "avatar_url": "https://pbs.twimg.com/profile_images/1532100022648680450/2z6Ml6Qy_200x200.jpg",
            "avatar_color": "#3487b2",
            "banner_url": "https://pbs.twimg.com/profile_banners/3784131322/1658599775"
        },
        "replies": 9,
        "retweets": 3,
        "likes": 46,
        "views": 342,
        "color": "#0a7c2f",
        "twitter_card": "player",
        "lang": "en",
        "source": "Twitter for iPhone",
        "replying_to": null,
        "replying_to_status": null,
        "media": {
            "videos": [
                {
                    "url": "https://video.twimg.com/ext_tw_video/1548602342488129536/pu/vid/720x1280/I_D3svYfjBl7_xGS.mp4?tag=14",
                    "thumbnail_url": "https://pbs.twimg.com/ext_tw_video_thumb/1548602342488129536/pu/img/V_1u5Nv5BwKBynwv.jpg",
                    "width": 720,
                    "height": 1280,
                    "duration": 25.133,
                    "format": "video/mp4",
                    "type": "video"
                }
            ]
        }
    }
}

```

Code will normally return 200 (message: `OK`), but can return 401 (message `PRIVATE_TWEET`), 404 (message `NOT_FOUND`), or 500 (message `API_FAIL`)

## APITweet

The container of all the information for a Tweet

### Core attributes

`id` string - Status (Tweet) ID

`url` string - Link to original Tweet

`text` string - Text of Tweet

`created_at` string - Date/Time in UTC when the Tweet was created

`created_timestamp` number - Seconds since UNIX epoch of when Tweet was created

`color` string - Dominant color pulled from either Tweet media or from the author's profile picture. (**DEPRECATED**: This feature no longer works and will be removed in the next API version)

`lang` string | null - Language that Twitter detects a Tweet is. May be null is unknown.

`replying_to` string | null - Screen name of person being replied to, or null

`replying_to_status` string | null - Tweet ID snowflake being replied to, or null

`twitter_card` (`'tweet'` | `'summary'` | `'summary_large_image'` | `'player'`) - Corresponds to proper embed container for Tweet, which is used by FixTweet for our official embeds.

`author` [APIAuthor](#apiauthor) \- Author of the tweet

`source` string - Tweet source (i.e. Twitter for iPhone)

### Interaction counts

`likes` number - Like count

`retweets` number - Retweet count

`replies` number - Reply count

`views` number | null - View count, returns null if view count is not available (i.e. older Tweets)

### Embeds

`quote`? [APITweet](#apitweet) \- Nested Tweet corresponding to the tweet which this tweet is quoting, if applicable

`poll`? [APIPoll](#apipoll) \- Poll attached to Tweet

`translation`? [APITranslate](#apitranslate) \- Translation results, only provided if explicitly asked

**`media? {`** \- Containing object containing references to photos, videos, or external media

`all`? [APIVideo](#apivideo)\[\] - An Array containing media from a Tweet, preserving its order even with Tweets that contain both photos and videos

`external`? [APIExternalMedia](#apiexternalmedia) \- Refers to external media, such as YouTube embeds

`photos`? [APIPhoto](#apiphoto)\[\] - An Array of photos from a Tweet

`videos`? [APIVideo](#apivideo)\[\] - An Array of videos from a Tweet

`mosaic`? [APIMosaicPhoto](#apimosaicphoto) \- Corresponding Mosaic information for a Tweet

**`}`**

## APIAuthor

Information about the author of a tweet

`name` string - Name of the user, set on their profile

`screen_name` string - Screen name or @ handle of the user.

`avatar_url?` string - URL for the user's avatar (profile picture)

`avatar_color?` string - Palette color corresponding to the user's avatar (profile picture). Value is a hex, including `#`.

`banner_url?` string - URL for the banner of the user

## APITranslate

Information about a requested translation for a Tweet, when asked.

`text` string - Translated Tweet text

`source_lang` string - 2-letter ISO language code of source language

`target_lang` string - 2-letter ISO language code of target language

## APIExternalMedia

Data for external media, currently only video.

`type` string - Embed type, currently always `video`

`url` string - Video URL

`height` number - Video height in pixels

`width` number - Video width in pixels

`duration` number - Video duration in seconds

## APIPoll

Data for a poll on a given Tweet

`choices` [APIPollChoice](#apipollchoice)\[\] - Array of the poll choices

`total_votes` number - Total votes in poll

`ends_at` string - Date of which the poll ends

`time_left_en` string - Time remaining counter in English (i.e. **9 hours left**)

## APIPollChoice

Data for a single choice in a poll

`label` string - What this choice in the poll is called

`count` number - How many people voted in this poll

`percentage` number - Percentage of total people who voted for this option (0 - 100, rounded to nearest tenth)

## APIPhoto

Data for a single photo in a Tweet

`type` 'photo' - This can help compare items in a pool of media

`url` string - URL of the photo

`width` number - Width of the photo, in pixels

`height` number - Height of the photo, in pixels

## APIMosaicPhoto

Data for the mosaic service, which stitches photos together

`type` 'mosaic\_photo' - This can help compare items in a pool of media

`width` number - Width of the photo, in pixels

`height` number - Height of the photo, in pixels

**`formats {`** \- Pool of formats, only `jpeg` and `webp` are returned currently

`webp` string - URL for webp resource

`jpeg` string - URL for jpeg resource

**`}`**

## APIVideo

Data for a Tweet's video

`type` 'video' | 'gif' - Returns video if video, or gif if gif. Note that on Twitter, all GIFs are MP4s.

`url` string - URL corresponding to the video file

`thumbnail_url` string - URL corresponding to the thumbnail for the video

`width` number - Width of the video, in pixels

`height` number - Height of the video, in pixels

`format` string - Video format, usually `video/mp4`

### Clone this wiki locally

 You can’t perform that action at this time.