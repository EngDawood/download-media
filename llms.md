### GET /api/downloader/douyin

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Provides Douyin video download links.

```APIDOC
## GET /api/downloader/douyin

### Description
Provides Douyin video download links.

### Method
GET

### Endpoint
/api/downloader/douyin

### Parameters
#### Query Parameters
- **url** (string) - Required - The Douyin video URL.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/douyin?url=https%3A%2F%2Fv.douyin.com%2Fikq8axJ%2F'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the request was successful.
- **data** (object) - Contains the video information and download links.
  - **title** (string) - The title of the video.
  - **thumbnail** (string) - URL of the video thumbnail.
  - **links** (array) - A list of available download links.
    - **quality** (string) - The quality of the video.
    - **url** (string) - The download URL.

#### Response Example

```json
{
  "status": true,
  "data": {
    "title": "string",
    "thumbnail": "string",
    "links": [
      {
        "quality": "string",
        "url": "string"
      }
    ]
  }
}
```
```

--------------------------------

### GET /api/downloader/snackvideo

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Provides SnackVideo download info.

```APIDOC
## GET /api/downloader/snackvideo

### Description
Provides SnackVideo download info.

### Method
GET

### Endpoint
/api/downloader/snackvideo

### Parameters
#### Query Parameters
- **url** (string) - Required - The SnackVideo post URL.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/snackvideo?url=https%3A%2F%2Fs.snackvideo.com%2Fp%2Fj9jKr9dR'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the request was successful.
- **url** (string) - The download URL for the video.
- **title** (string) - The title of the video.
- **description** (string) - The description of the video.
- **thumbnail** (string) - URL of the video thumbnail.
- **uploadDate** (string) - The upload date of the video.
- **videoUrl** (string) - The direct URL to the video file.
- **duration** (string) - The duration of the video.
- **interaction** (object) - Interaction metrics for the video.
  - **views** (integer) - Number of views.
  - **likes** (integer) - Number of likes.
  - **shares** (integer) - Number of shares.
- **creator** (object) - Information about the video creator.
  - **name** (string) - The creator's name.
  - **profileUrl** (string) - URL to the creator's profile.
  - **bio** (string) - The creator's bio.

#### Response Example

```json
{
  "status": true,
  "url": "string",
  "title": "string",
  "description": "string",
  "thumbnail": "string",
  "uploadDate": "2026-02-21",
  "videoUrl": "string",
  "duration": "string",
  "interaction": {
    "views": 1,
    "likes": 1,
    "shares": 1
  },
  "creator": {
    "name": "string",
    "profileUrl": "string",
    "bio": "string"
  }
}
```
```

--------------------------------

### GET /api/downloader/cocofun

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Fetches Cocofun video info and URLs.

```APIDOC
## GET /api/downloader/cocofun

### Description
Fetches Cocofun video info and URLs.

### Method
GET

### Endpoint
/api/downloader/cocofun

### Parameters
#### Query Parameters
- **url** (string) - Required - The Cocofun post URL.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/cocofun?url=https%3A%2F%2Fwww.icocofun.com%2Fshare%2Fpost%2F302494355703'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the request was successful.
- **topic** (string) - The topic of the Cocofun post.
- **caption** (string) - The caption of the video.
- **play** (integer) - Number of plays.
- **like** (integer) - Number of likes.
- **share** (integer) - Number of shares.
- **duration** (integer) - The duration of the video in seconds.
- **thumbnail** (string) - URL of the video thumbnail.
- **watermark** (string) - URL of the video with watermark.
- **no_watermark** (string) - URL of the video without watermark.

#### Response Example

```json
{
  "status": true,
  "topic": "string",
  "caption": "string",
  "play": 1,
  "like": 1,
  "share": 1,
  "duration": 1,
  "thumbnail": "string",
  "watermark": "string",
  "no_watermark": "string"
}
```
```

--------------------------------

### GET /api/downloader/pinterest

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Downloads media from a given Pinterest URL. Returns a JSON object containing details of the Pinterest post, including media links.

```APIDOC
## GET /api/downloader/pinterest

### Description
Downloads media from a given Pinterest URL. Returns a JSON object containing details of the Pinterest post, including media links.

### Method
GET

### Endpoint
/api/downloader/pinterest

### Parameters
#### Query Parameters
- **url** (string) - Required - The URL of the Pinterest post.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/pinterest?url=https%3A%2F%2Fpin.it%2F4CVodSq'
```

### Response

#### Success Response (200)

- **success** (boolean) - Indicates if the request was successful.
- **developer** (string) - Name of the developer or service.
- **result** (object) - An object containing the details of the Pinterest media.
  - **id** (string) - The unique identifier of the post.
  - **title** (string) - The title of the post.
  - **description** (string) - The description of the post.
  - **link** (string | null) - Direct link to the media (can be null).
  - **image** (string) - URL to the main image of the post.
  - **images** (object) - An object containing various sizes of the image.
  - **is_video** (boolean) - Indicates if the media is a video.
  - **video_url** (string | null) - Direct link to the video file (can be null).
  - **videos** (object | null) - Object containing video details (can be null).
  - **user** (object) - Information about the user who posted.
    - **username** (string) - The username of the poster.
    - **full_name** (string) - The full name of the poster.
    - **profile_url** (string) - URL to the user's profile.
    - **avatar_url** (string) - URL to the user's avatar.

#### Response Example

```json
{
  "success": true,
  "developer": "string",
  "result": {
    "id": "string",
    "title": "string",
    "description": "string",
    "link": null,
    "image": "string",
    "images": {
      "60x60": {"width": 1, "height": 1, "url": "string"},
      "136x136": {"width": 1, "height": 1, "url": "string"},
      "170x": {"width": 1, "height": 1, "url": "string"},
      "236x": {"width": 1, "height": 1, "url": "string"},
      "474x": {"width": 1, "height": 1, "url": "string"},
      "564x": {"width": 1, "height": 1, "url": "string"},
      "736x": {"width": 1, "height": 1, "url": "string"},
      "600x315": {"width": 1, "height": 1, "url": "string"},
      "orig": {"width": 1, "height": 1, "url": "string"}
    },
    "is_video": true,
    "video_url": null,
    "videos": null,
    "user": {
      "username": "string",
      "full_name": "string",
      "profile_url": "string",
      "avatar_url": "string"
    }
  }
}
```
```

--------------------------------

### GET /api/downloader/twitter

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Provides Twitter/X video download URLs.

```APIDOC
## GET /api/downloader/twitter

### Description
Provides Twitter/X video download URLs.

### Method
GET

### Endpoint
/api/downloader/twitter

### Parameters
#### Query Parameters
- **url** (string) - Required - The Twitter/X post URL.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/twitter?url=https%3A%2F%2Ftwitter.com%2Fgofoodindonesia%2Fstatus%2F1229369819511709697'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the request was successful.
- **title** (string) - The title of the tweet.
- **url** (array) - A list of download URLs for the video.
- **creator** (string) - The username of the tweet creator.

#### Response Example

```json
{
  "status": true,
  "title": "string",
  "url": [
    {}
  ],
  "creator": "string"
}
```
```

--------------------------------

### GET /api/downloader/aio - All-in-One Downloader

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This versatile endpoint can download media from various platforms. Provide the URL of the media, and it will attempt to provide download links for video and audio.

```APIDOC
## GET /api/downloader/aio

### Description
This versatile endpoint can download media from various platforms. Provide the URL of the media, and it will attempt to provide download links for video and audio.

### Method
GET

### Endpoint
/api/downloader/aio

### Parameters
#### Query Parameters
- **url** (string) - Required - The URL of the media to download (e.g., TikTok, Instagram).

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/aio?url=https%3A%2F%2Fvt.tiktok.com%2FZSkGPK9Kj%2F'
```

### Response

#### Success Response (200)

- **status** (string) - The status of the operation (e.g., 'success', 'error').
- **mess** (string) - A message describing the result of the operation.
- **p** (string) - Possibly related to pagination or progress.
- **data** (object) - Contains detailed information about the downloaded media.
  - **page** (string) - The URL of the source page.
  - **extractor** (string) - The name of the extractor used (e.g., 'tiktok').
  - **status** (string) - The status within the data object.
  - **keyword** (string) - Search keyword if applicable.
  - **title** (string) - The title of the media.
  - **thumbnail** (string) - The URL of the media thumbnail.
  - **links** (object) - Contains download links.
    - **video** (array) - Array of video download links.
      - **q_text** (string) - Quality description (e.g., '720p').
      - **size** (string) - File size of the video.
      - **url** (string) - The download URL for the video.
    - **audio** (array) - Array of audio download links.
      - **q_text** (string) - Quality description (e.g., '128kbps').
      - **size** (string) - File size of the audio.
      - **url** (string) - The download URL for the audio.
  - **author** (object) - Information about the media author.
    - **username** (string) - The author's username.
    - **full_name** (string) - The author's full name.
    - **avatar** (string) - The URL of the author's avatar.

#### Response Example

```json
{
  "status": "string",
  "mess": "string",
  "p": "string",
  "data": {
    "page": "string",
    "extractor": "string",
    "status": "string",
    "keyword": "string",
    "title": "string",
    "thumbnail": "string",
    "links": {
      "video": [
        {
          "q_text": "string",
          "size": "string",
          "url": "string"
        }
      ],
      "audio": [
        {
          "q_text": "string",
          "size": "string",
          "url": "string"
        }
      ]
    },
    "author": {
      "username": "string",
      "full_name": "string",
      "avatar": "string"
    }
  }
}
```
```

--------------------------------

### GET /api/downloader/spotify

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Retrieves Spotify track metadata and download link.

```APIDOC
## GET /api/downloader/spotify

### Description
Retrieves Spotify track metadata and download link.

### Method
GET

### Endpoint
/api/downloader/spotify

### Parameters
#### Query Parameters
- **url** (string) - Required - The Spotify track URL.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/spotify?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F3zakx7RAwdkUQlOoQ7SJRt'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the request was successful.
- **res_data** (object) - Contains the Spotify track metadata and download link.
  - **title** (string) - The title of the track.
  - **source** (string) - The source of the track (e.g., Spotify).
  - **server** (string) - The server hosting the download.
  - **thumbnail** (string) - URL of the track's thumbnail.
  - **duration** (integer) - The duration of the track in seconds.
  - **message** (string) - A message related to the track data.
  - **subtitles** (array) - A list of available subtitles.
  - **formats** (array) - A list of available download formats.
    - **url** (string) - The download URL for the format.
    - **filesize** (string) - The file size of the download.
    - **quality** (string) - The quality of the audio/video.
    - **acodec** (string) - The audio codec used.
    - **vcodec** (string) - The video codec used.
    - **ext** (string) - The file extension.
    - **protocol** (string) - The download protocol.
- **message** (string) - A general message about the response.

#### Response Example

```json
{
  "status": true,
  "res_data": {
    "title": "string",
    "source": "string",
    "server": "string",
    "thumbnail": "string",
    "duration": 1,
    "message": "string",
    "subtitles": [],
    "formats": [
      {
        "url": "string",
        "filesize": "string",
        "quality": "string",
        "acodec": "string",
        "vcodec": "string",
        "ext": "string",
        "protocol": "string"
      }
    ]
  },
  "message": "string"
}
```
```

--------------------------------

### GET /api/downloader/ttdl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Provides alternative download links for TikTok videos.

```APIDOC
## GET /api/downloader/ttdl

### Description
Provides alternative download links for TikTok videos.

### Method
GET

### Endpoint
/api/downloader/ttdl

### Parameters
#### Query Parameters
- **url** (string) - Required - The URL of the TikTok video.

### Request Example
```bash
curl 'https://backend1.tioo.eu.org/api/downloader/ttdl?url=https%3A%2F%2Fwww.tiktok.com%2F%40omagadsus%2Fvideo%2F7025456384175017243'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the operation was successful.
- **title** (string) - The title of the TikTok video.
- **video** (array) - An array of video download URLs.
- **audio** (array) - An array of audio download URLs.
- **creator** (string) - The username of the TikTok video creator.

#### Response Example

```json
{
  "status": true,
  "title": "string",
  "video": [
    "string"
  ],
  "audio": [
    "string"
  ],
  "creator": "string"
}
```
```

--------------------------------

### GET /api/downloader/capcut - Download CapCut Template

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This endpoint allows you to download CapCut templates. Provide the CapCut template URL to retrieve download information and video URLs.

```APIDOC
## GET /api/downloader/capcut

### Description
This endpoint allows you to download CapCut templates. Provide the CapCut template URL to retrieve download information and video URLs.

### Method
GET

### Endpoint
/api/downloader/capcut

### Parameters
#### Query Parameters
- **url** (string) - Required - The URL of the CapCut template.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/capcut?url=https%3A%2F%2Fwww.capcut.com%2Ftemplate-detail%2F7299286607478181121'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the request was successful.
- **code** (integer) - An internal code, possibly indicating success or failure.
- **title** (string) - The title of the CapCut template.
- **originalVideoUrl** (string) - The URL of the original video associated with the template.
- **coverUrl** (string) - The URL of the template's cover image.
- **authorName** (string) - The name of the template's author.

#### Response Example

```json
{
  "status": true,
  "code": 1,
  "title": "string",
  "originalVideoUrl": "string",
  "coverUrl": "string",
  "authorName": "string"
}
```
```

--------------------------------

### GET /api/downloader/mediafire - Download MediaFire File

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This endpoint provides a direct download link for files hosted on MediaFire. Provide the MediaFire file URL to get the download details.

```APIDOC
## GET /api/downloader/mediafire

### Description
This endpoint provides a direct download link for files hosted on MediaFire. Provide the MediaFire file URL to get the download details.

### Method
GET

### Endpoint
/api/downloader/mediafire

### Parameters
#### Query Parameters
- **url** (string) - Required - The URL of the MediaFire file.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/mediafire?url=https%3A%2F%2Fwww.mediafire.com%2Ffile%2F941xczxhn27qbby%2Fsample.apk%2Ffile'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the request was successful.
- **filename** (string) - The name of the file.
- **filesize** (string) - The size of the file in bytes.
- **filesizeH** (string) - The human-readable size of the file.
- **type** (string) - The type or category of the file.
- **upload_date** (string) - The date the file was uploaded (ISO 8601 format).
- **owner** (string) - The owner of the file.
- **ext** (string) - The file extension.
- **mimetype** (string) - The MIME type of the file.
- **url** (string) - The direct download URL for the file.

#### Response Example

```json
{
  "status": true,
  "filename": "string",
  "filesize": "string",
  "filesizeH": "string",
  "type": "string",
  "upload_date": "2026-02-21T20:43:06.714Z",
  "owner": "string",
  "ext": "string",
  "mimetype": "string",
  "url": "string"
}
```
```

--------------------------------

### GET /api/downloader/rednote

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Fetches Rednote (Xiaohongshu) media info and download links.

```APIDOC
## GET /api/downloader/rednote

### Description
Fetches Rednote (Xiaohongshu) media info and download links.

### Method
GET

### Endpoint
/api/downloader/rednote

### Parameters
#### Query Parameters
- **url** (string) - Required - The Rednote post URL.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/rednote?url=http%3A%2F%2Fxhslink.com%2Fo%2F21DKXV988zp'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the request was successful.
- **noteId** (string) - The unique ID of the Rednote post.
- **nickname** (string) - The nickname of the post author.
- **title** (string) - The title of the Rednote post.
- **desc** (string) - The description of the Rednote post.
- **keywords** (string) - Keywords associated with the post.
- **duration** (string) - The duration of the media (if applicable).
- **engagement** (object) - Engagement metrics for the post.
  - **likes** (string) - Number of likes.
  - **comments** (string) - Number of comments.
  - **collects** (string) - Number of saves/collects.
- **images** (array) - A list of image URLs included in the post.
- **downloads** (array) - A list of available download links.
  - **quality** (string) - The quality of the download.
  - **url** (string) - The download URL.

#### Response Example

```json
{
  "status": true,
  "noteId": "string",
  "nickname": "string",
  "title": "string",
  "desc": "string",
  "keywords": "string",
  "duration": "string",
  "engagement": {
    "likes": "string",
    "comments": "string",
    "collects": "string"
  },
  "images": [
    "string"
  ],
  "downloads": [
    {
      "quality": "string",
      "url": "string"
    }
  ]
}
```
```

--------------------------------

### Download TikTok Video using Shell Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This code example shows how to download TikTok videos using a cURL command. It takes a TikTok video URL as input and returns a JSON object with video information and download URLs. This method is suitable for direct integration into scripts or applications.

```shell
curl 'https://backend1.tioo.eu.org/api/downloader/tiktok?url=https%3A%2F%2Fwww.tiktok.com%2F%40omagadsus%2Fvideo%2F7025456384175017243'
```

--------------------------------

### GET /api/downloader/gdrive - Download Google Drive File

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This endpoint provides a direct download link for files stored on Google Drive. Supply the Google Drive file URL to obtain download details.

```APIDOC
## GET /api/downloader/gdrive

### Description
This endpoint provides a direct download link for files stored on Google Drive. Supply the Google Drive file URL to obtain download details.

### Method
GET

### Endpoint
/api/downloader/gdrive

### Parameters
#### Query Parameters
- **url** (string) - Required - The URL of the Google Drive file.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/gdrive?url=https%3A%2F%2Fdrive.google.com%2Ffile%2Fd%2F1thDYWcS5p5FFhzTpTev7RUv0VFnNQyZ4%2Fview'
```

### Response

#### Success Response (200)

- **success** (boolean) - Indicates if the request was successful.
- **developer** (string) - The name of the developer or service.
- **data** (object) - Contains details about the file.
  - **filename** (string) - The name of the Google Drive file.
  - **filesize** (string) - The size of the file.
  - **downloadUrl** (string) - The direct download URL for the file.

#### Response Example

```json
{
  "success": true,
  "developer": "string",
  "data": {
    "filename": "string",
    "filesize": "string",
    "downloadUrl": "string"
  }
}
```
```

--------------------------------

### GET /api/downloader/threads

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Downloads video media from a given Threads URL. Returns a JSON object with download links and media information.

```APIDOC
## GET /api/downloader/threads

### Description
Downloads video media from a given Threads URL. Returns a JSON object with download links and media information.

### Method
GET

### Endpoint
/api/downloader/threads

### Parameters
#### Query Parameters
- **url** (string) - Required - The URL of the Threads post.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/threads?url=https%3A%2F%2Fwww.threads.net%2F%40cindyyuvia%2Fpost%2FC_Nqx3khgkI%2F%3Fxmt%3DAQGzpsCvidh8IwIqOvq4Ov05Zd5raANiVdvCujM_pjBa1Q'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the request was successful.
- **type** (string) - The type of media (e.g., "video").
- **video** (string | null) - Direct download link for the video (can be null).
- **image** (string | null) - URL to the media's image (can be null).
- **download** (string | null) - General download link (can be null).

#### Response Example

```json
{
  "status": true,
  "type": "video",
  "video": null,
  "image": null,
  "download": null
}
```
```

--------------------------------

### GET /api/downloader/tiktok

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Retrieves TikTok video information and download URLs.

```APIDOC
## GET /api/downloader/tiktok

### Description
Retrieves TikTok video information and download URLs.

### Method
GET

### Endpoint
/api/downloader/tiktok

### Parameters
#### Query Parameters
- **url** (string) - Required - The URL of the TikTok video.

### Request Example
```bash
curl 'https://backend1.tioo.eu.org/api/downloader/tiktok?url=https%3A%2F%2Fwww.tiktok.com%2F%40omagadsus%2Fvideo%2F7025456384175017243'
```

### Response

#### Success Response (200)

- **code** (integer) - The status code of the response.
- **msg** (string) - A message describing the response.
- **processed_time** (integer) - The time taken to process the request.
- **data** (object) - An object containing the video details.
  - **id** (string) - The TikTok video ID.
  - **region** (string) - The region of the video.
  - **title** (string) - The title of the video.
  - **cover** (string) - The URL of the video cover image.
  - **ai_dynamic_cover** (string) - The URL of the AI-generated dynamic cover.
  - **origin_cover** (string) - The URL of the original cover image.
  - **duration** (integer) - The duration of the video in seconds.
  - **play** (string) - The direct play URL of the video.
  - **wmplay** (string) - The play URL of the video with watermark.
  - **hdplay** (string) - The play URL of the high-definition video.
  - **size** (integer) - The size of the video file.
  - **wm_size** (integer) - The size of the video file with watermark.
  - **hd_size** (integer) - The size of the high-definition video file.
  - **music** (string) - The URL of the background music.
  - **music_info** (object) - Information about the background music.
  - **play_count** (integer) - The number of times the video has been played.
  - **digg_count** (integer) - The number of likes.
  - **comment_count** (integer) - The number of comments.
  - **share_count** (integer) - The number of shares.
  - **download_count** (integer) - The number of downloads.
  - **collect_count** (integer) - The number of saves.
  - **create_time** (integer) - The creation timestamp of the video.
  - **anchors** (any) - Anchor information (null if not applicable).
  - **anchors_extras** (string) - Additional anchor information.
  - **is_ad** (boolean) - Indicates if the video is an advertisement.
  - **commerce_info** (object) - Commercial information about the video.
  - **commercial_video_info** (string) - Commercial video details.
  - **item_comment_settings** (integer) - Comment settings for the item.
  - **mentioned_users** (string) - Information about mentioned users.
  - **author** (object) - Information about the video author.

#### Response Example

```json
{
  "code": 1,
  "msg": "string",
  "processed_time": 1,
  "data": {
    "id": "string",
    "region": "string",
    "title": "string",
    "cover": "string",
    "ai_dynamic_cover": "string",
    "origin_cover": "string",
    "duration": 1,
    "play": "string",
    "wmplay": "string",
    "hdplay": "string",
    "size": 1,
    "wm_size": 1,
    "hd_size": 1,
    "music": "string",
    "music_info": {
      "id": "string",
      "title": "string",
      "play": "string",
      "cover": "string",
      "author": "string",
      "original": true,
      "duration": 1,
      "album": "string"
    },
    "play_count": 1,
    "digg_count": 1,
    "comment_count": 1,
    "share_count": 1,
    "download_count": 1,
    "collect_count": 1,
    "create_time": 1,
    "anchors": null,
    "anchors_extras": "string",
    "is_ad": true,
    "commerce_info": {
      "adv_promotable": true,
      "auction_ad_invited": true,
      "branded_content_type": 1,
      "organic_log_extra": "string",
      "with_comment_filter_words": true
    },
    "commercial_video_info": "string",
    "item_comment_settings": 1,
    "mentioned_users": "string",
    "author": {
      "id": "string",
      "unique_id": "string",
      "nickname": "string",
      "avatar": "string"
    }
  }
}
```
```

--------------------------------

### GET /api/search/yts

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Searches for YouTube videos based on a query parameter. Returns search results.

```APIDOC
## GET /api/search/yts

### Description
Searches for YouTube videos based on a query parameter. Returns search results.

### Method
GET

### Endpoint
/api/search/yts

### Parameters
#### Query Parameters
- **q** (string) - Required - The search query for YouTube videos.

### Request Example
```shell
curl -G 'https://backend1.tioo.eu.org/api/search/yts' --data-urlencode 'q=Somewhere Only We Know'
```

### Response

#### Success Response (200)

- **[Response structure not fully defined in the provided text, but typically includes video details like title, URL, thumbnail, etc.]**

#### Response Example

```json
{
  "[field_name]": "[field_value]"
}
```
```

--------------------------------

### GET /api/downloader/igdl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Downloads Instagram media by providing the URL of the Instagram post.

```APIDOC
## GET /api/downloader/igdl

### Description
Downloads Instagram media by providing the URL of the Instagram post.

### Method
GET

### Endpoint
/api/downloader/igdl

### Parameters
#### Query Parameters
- **url** (string) - Required - The URL of the Instagram post.

### Request Example
```bash
curl 'https://backend1.tioo.eu.org/api/downloader/igdl?url=https%3A%2F%2Fwww.instagram.com%2Fp%2FByxKbUSnubS%2F'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the operation was successful.
- **creator** (string) - The username of the Instagram post creator.
- **thumbnail** (string) - The URL of the thumbnail image.
- **url** (string) - The download URL for the media.

#### Response Example

```json
[
  {
    "status": true,
    "creator": "string",
    "thumbnail": "string",
    "url": "string"
  }
]
```
```

--------------------------------

### GET /api/downloader/soundcloud

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Downloads audio from a given SoundCloud URL. Returns a JSON object containing various links related to the audio and artwork.

```APIDOC
## GET /api/downloader/soundcloud

### Description
Downloads audio from a given SoundCloud URL. Returns a JSON object containing various links related to the audio and artwork.

### Method
GET

### Endpoint
/api/downloader/soundcloud

### Parameters
#### Query Parameters
- **url** (string) - Required - The URL of the SoundCloud track to download.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/soundcloud?url=https%3A%2F%2Fsoundcloud.com%2Fissabella-marchelina%2Fsisa-rasa-mahalini-official-audio'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the request was successful.
- **title** (string) - The title of the track.
- **thumbnail** (string) - URL to the track's thumbnail image.
- **audio** (string) - Direct download link for the audio file.
- **downloadMp3** (string) - Link to download the audio as an MP3 file.
- **downloadArtwork** (string) - Link to download the track's artwork.

#### Response Example

```json
{
  "status": true,
  "title": "string",
  "thumbnail": "string",
  "audio": "string",
  "downloadMp3": "string",
  "downloadArtwork": "string"
}
```
```

--------------------------------

### Get Spotify Track Info using Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Retrieves Spotify track metadata and download link. Requires a Spotify track URL as a query parameter. Returns a JSON object with track details and available download formats.

```Shell
curl 'https://backend1.tioo.eu.org/api/downloader/spotify?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F3zakx7RAwdkUQlOoQ7SJRt'
```

--------------------------------

### GET /api/downloader/youtube - Download YouTube Video

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This endpoint enables downloading YouTube videos. You need to provide the YouTube video URL, and it will return various download links including MP4 and MP3 formats.

```APIDOC
## GET /api/downloader/youtube

### Description
This endpoint enables downloading YouTube videos. You need to provide the YouTube video URL, and it will return various download links including MP4 and MP3 formats.

### Method
GET

### Endpoint
/api/downloader/youtube

### Parameters
#### Query Parameters
- **url** (string) - Required - The URL of the YouTube video to download.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/youtube?url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3DC8mJ8943X80'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the request was successful.
- **title** (string) - The title of the YouTube video.
- **thumbnail** (string) - The URL of the video thumbnail.
- **author** (string) - The author or channel name of the video.
- **mp4** (string) - The download URL for the MP4 video format.
- **mp3** (string) - The download URL for the MP3 audio format.

#### Response Example

```json
{
  "status": true,
  "title": "string",
  "thumbnail": "string",
  "author": "string",
  "mp4": "string",
  "mp3": "string"
}
```
```

--------------------------------

### GET /api/downloader/fbdown - Download Facebook Video

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This endpoint allows you to download Facebook videos by providing the video URL. It returns download URLs for normal and HD quality.

```APIDOC
## GET /api/downloader/fbdown

### Description
This endpoint allows you to download Facebook videos by providing the video URL. It returns download URLs for normal and HD quality.

### Method
GET

### Endpoint
/api/downloader/fbdown

### Parameters
#### Query Parameters
- **url** (string) - Required - The URL of the Facebook video to download.

### Request Example
```shell
curl 'https://backend1.tioo.eu.org/api/downloader/fbdown?url=https%3A%2F%2Fwww.facebook.com%2Fwatch%2F%3Fv%3D1393572814172251'
```

### Response

#### Success Response (200)

- **status** (boolean) - Indicates if the request was successful.
- **developer** (string) - The name of the developer or service.
- **Normal_video** (string) - The download URL for the normal quality video.
- **HD** (string) - The download URL for the HD quality video.

#### Response Example

```json
{
  "status": true,
  "developer": "string",
  "Normal_video": "string",
  "HD": "string"
}
```
```

--------------------------------

### Tools Operations

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Offers a collection of utility endpoints for various tasks.

```APIDOC
## Tools Operations

### Description
Offers a collection of utility endpoints for various tasks.

### Endpoints
- **GET /api/tools/whois**
- **GET /api/tools/channels**
- **GET /api/tools/shorturl**
- **GET /api/tools/backlink

### Parameters
[Specific parameters for each tool endpoint would be detailed here. Refer to individual endpoint documentation for details.]

### Request Example
[Example request for a specific tool endpoint would be provided here.]

### Response
[Response structure for each tool endpoint would be detailed here. Refer to individual endpoint documentation for details.]
```

--------------------------------

### Download Douyin Video using Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Enables downloading Douyin videos. Takes a Douyin video URL as a query parameter and returns a JSON object containing the video title, thumbnail, and available download links categorized by quality.

```Shell
curl 'https://backend1.tioo.eu.org/api/downloader/douyin?url=https%3A%2F%2Fv.douyin.com%2Fikq8axJ%2F'
```

--------------------------------

### Download CapCut Template using Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This endpoint allows downloading CapCut templates. It takes a CapCut template detail URL as input and provides information such as the template title, original video URL, cover image URL, and author name.

```Shell
curl 'https://backend1.tioo.eu.org/api/downloader/capcut?url=https%3A%2F%2Fwww.capcut.com%2Ftemplate-detail%2F7299286607478181121'
```

--------------------------------

### Download SnackVideo using Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Fetches SnackVideo download information. Requires a SnackVideo URL and returns a JSON object containing the video URL, title, description, thumbnail, upload date, duration, interaction statistics, and creator information.

```Shell
curl 'https://backend1.tioo.eu.org/api/downloader/snackvideo?url=https%3A%2F%2Fs.snackvideo.com%2Fp%2Fj9jKr9dR'
```

--------------------------------

### Download Instagram Media using Shell Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This snippet demonstrates how to download Instagram media using a cURL command. It requires a valid Instagram post URL as input and returns JSON containing download links and media details. No specific dependencies are needed beyond a cURL-compatible environment.

```shell
curl 'https://backend1.tioo.eu.org/api/downloader/igdl?url=https%3A%2F%2Fwww.instagram.com%2Fp%2FByxKbUSnubS%2F'
```

--------------------------------

### Download Pinterest Media

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Downloads media (images or videos) from a provided Pinterest URL. Accepts a valid Pinterest URL and returns a JSON response with media details and download links.

```shell
curl 'https://backend1.tioo.eu.org/api/downloader/pinterest?url=https%3A%2F%2Fpin.it%2F4CVodSq'
```

--------------------------------

### Search YouTube Videos

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Searches for YouTube videos based on a query parameter. This endpoint allows users to find relevant YouTube content by providing a search term.

```shell
curl -X GET "https://backend1.tioo.eu.org/api/search/yts?q=Somewhere Only We Know" -H "Accept: */*"
```

--------------------------------

### Download Rednote (Xiaohongshu) Media using Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Fetches Rednote (Xiaohongshu) media information and download links. Requires a Rednote URL as input and returns a JSON response with details such as title, description, engagement metrics, and download URLs for different qualities.

```Shell
curl 'https://backend1.tioo.eu.org/api/downloader/rednote?url=http%3A%2F%2Fxhslink.com%2Fo%2F21DKXV988zp'
```

--------------------------------

### All-in-One Media Downloader using Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This versatile endpoint can download media from various platforms using a single URL. It supports different types of content and provides download links for video and audio, along with metadata.

```Shell
curl 'https://backend1.tioo.eu.org/api/downloader/aio?url=https%3A%2F%2Fvt.tiktok.com%2FZSkGPK9Kj%2F'
```

--------------------------------

### AI Operations

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Provides access to various AI-powered tools and models for different applications.

```APIDOC
## AI Operations

### Description
Provides access to various AI-powered tools and models for different applications.

### Endpoints
- **GET /api/ai/geminiai**
- **POST /api/ai/flux-ai**
- **GET /api/ai/gitaai**
- **GET /api/ai/muslimai**
- **GET /api/ai/powerbrainai**
- **GET /api/ai/metaai**
- **GET /api/ai/claudeai**
- **GET /api/ai/llama-3.3-70b**
- **GET /api/ai/gpt-4o**
- **GET /api/ai/gpt-4o-mini**
- **GET /api/ai/geminiai-lite**
- **GET /api/ai/feloai**
- **GET /api/ai/bibleai**
- **GET /api/ai/magicstudioai

### Parameters
[Specific parameters for each AI endpoint would be detailed here. Refer to individual endpoint documentation for details.]

### Request Example
[Example request for a specific AI endpoint would be provided here.]

### Response
[Response structure for each AI endpoint would be detailed here. Refer to individual endpoint documentation for details.]
```

--------------------------------

### Download TikTok Video (Alternative) using Shell Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This snippet provides an alternative method to download TikTok videos using cURL. Similar to the primary TikTok downloader, it accepts a TikTok video URL and returns a JSON response containing video and audio download links. This can be useful if the primary method encounters issues or for specific use cases.

```shell
curl 'https://backend1.tioo.eu.org/api/downloader/ttdl?url=https%3A%2F%2Fwww.tiktok.com%2F%40omagadsus%2Fvideo%2F7025456384175017243'
```

--------------------------------

### Download Cocofun Video using Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Provides information and download URLs for Cocofun videos. Accepts a Cocofun share URL and returns a JSON object with video details including topic, caption, play count, likes, duration, and download links with and without watermark.

```Shell
curl 'https://backend1.tioo.eu.org/api/downloader/cocofun?url=https%3A%2F%2Fwww.icocofun.com%2Fshare%2Fpost%2F302494355703'
```

--------------------------------

### Download Twitter/X Video using Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Provides download URLs for Twitter/X videos. Accepts a Twitter/X status URL as a query parameter and returns a JSON object containing video details and download links.

```Shell
curl 'https://backend1.tioo.eu.org/api/downloader/twitter?url=https%3A%2F%2Ftwitter.com%2Fgofoodindonesia%2Fstatus%2F1229369819511709697'
```

--------------------------------

### Download Google Drive File using Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This endpoint enables direct downloading of files from Google Drive. It requires the Google Drive file URL and returns the filename, file size, and a direct download URL for the file.

```Shell
curl 'https://backend1.tioo.eu.org/api/downloader/gdrive?url=https%3A%2F%2Fdrive.google.com%2Ffile%2Fd%2F1thDYWcS5p5FFhzTpTev7RUv0VFnNQyZ4%2Fview'
```

--------------------------------

### Download SoundCloud Track

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Downloads audio from a given SoundCloud URL. Requires a valid SoundCloud URL as input. Returns a JSON object containing download links and metadata.

```shell
curl 'https://backend1.tioo.eu.org/api/downloader/soundcloud?url=https%3A%2F%2Fsoundcloud.com%2Fissabella-marchelina%2Fsisa-rasa-mahalini-official-audio'
```

--------------------------------

### Download Threads Media

Source: https://backend1.tioo.eu.org/docs/api-reference/index

Enables downloading of media content from Threads. This endpoint requires a Threads post URL and returns a JSON object with download information for videos or images.

```shell
curl 'https://backend1.tioo.eu.org/api/downloader/threads?url=https%3A%2F%2Fwww.threads.net%2F%40cindyyuvia%2Fpost%2FC_Nqx3khgkI%2F%3Fxmt%3DAQGzpsCvidh8IwIqOvq4Ov05Zd5raANiVdvCujM_pjBa1Q'
```

--------------------------------

### Download YouTube Video using Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This endpoint facilitates the downloading of YouTube videos. It accepts a YouTube video URL and returns information such as the title, thumbnail, author, and direct download links for MP4 and MP3 formats.

```Shell
curl 'https://backend1.tioo.eu.org/api/downloader/youtube?url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3DC8mJ8943X80'
```

--------------------------------

### Download MediaFire File using Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This endpoint is designed to download files from MediaFire. It requires the direct MediaFire file URL and returns details about the file, including its name, size, type, and a direct download link.

```Shell
curl 'https://backend1.tioo.eu.org/api/downloader/mediafire?url=https%3A%2F%2Fwww.mediafire.com%2Ffile%2F941xczxhn27qbby%2Fsample.apk%2Ffile'
```

--------------------------------

### Download Facebook Video using Curl

Source: https://backend1.tioo.eu.org/docs/api-reference/index

This endpoint allows downloading Facebook videos. It requires a Facebook video URL as a query parameter. The response includes download URLs for normal and HD quality videos.

```Shell
curl 'https://backend1.tioo.eu.org/api/downloader/fbdown?url=https%3A%2F%2Fwww.facebook.com%2Fwatch%2F%3Fv%3D1393572814172251'
```

=== COMPLETE CONTENT === This response contains all available snippets from this library. No additional content exists. Do not make further requests.
