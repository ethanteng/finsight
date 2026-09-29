# Marketing teaser video

The homepage and `/features` show the teaser video in `TeaserVideo`, a lazy-loaded player that plays only when a visitor chooses Play. The video can be changed without a deploy. The same approach runs Uncloud's landing page (ethanteng/homebase).

## How the video is chosen

The page doesn't name a video. The player loads `/video/embed`, a route handler in `frontend/src/app/video/embed/route.ts`, and the logic lives in `frontend/src/lib/teaser-video.ts`. The video is the **`video`** item in the Vercel Global Config (formerly Edge Config) connected to the frontend project. Edit it in the dashboard and visitors get the new video within a minute or two, because the CDN holds each answer for 60 seconds. The item is one of:

| Value | What visitors get |
| --- | --- |
| `"GRBboPyuL5U"`, or any YouTube link (watch, youtu.be, embed, shorts, live) | A redirect to YouTube's privacy-enhanced player |
| `"https://…/teaser.mp4"` | Our own player page, a plain `<video>` |
| `{ "mp4": "https://…", "poster": "https://…", "captions": "https://…" }` | The same, with a poster frame and WebVTT captions (both optional) |

If Global Config isn't connected, the item is missing, Global Config is slow or down, or the value is none of those, the route falls back to `DEFAULT_VIDEO` in `teaser-video.ts` (currently `GRBboPyuL5U`), so a typo can't leave the player empty. A video file must be an https address. A poster or captions address that isn't https is left out and the video still plays.

## One-time setup

1. In the Ask Linc frontend's Vercel project, open **Storage**, choose **Create Database**, pick **Global Config**, and create a store. Creating it from the project connects it and adds the `GLOBAL_CONFIG` variable.
2. Under **Items**, add `"video": "<ID, link, or object>"` and save.
3. Redeploy once so the functions see `GLOBAL_CONFIG`. After that, only the item changes.

A store connected before the rename, as `EDGE_CONFIG`, works too. Locally, without either variable, the teaser always plays the default.

## Self-hosting the video

Video files live in a **public** Vercel Blob store (Storage → Create Database → Blob; public or private is fixed when the store is created), never in this repository, where every swap would be a deploy. Upload the MP4, and optionally a poster image and a `.vtt` captions file, in the store's file browser, then put their URLs in the `video` item.

- **Give each version a new filename** (`teaser-2026-10.mp4`). Browsers and Vercel's CDN keep a public blob for up to a month, so a file replaced under the same name keeps playing the old version for returning visitors.
- **Encode for the web:** H.264 video and AAC audio in an MP4, with the index at the front so playback starts before the download finishes. For example: `ffmpeg -i teaser.mov -c:v libx264 -crf 23 -preset slow -vf "scale=-2:1080" -c:a aac -b:a 128k -movflags +faststart teaser-2026-10.mp4`. One file serves every connection, so keep it lean. A still from the video makes a good poster: `ffmpeg -ss 2 -i teaser-2026-10.mp4 -frames:v 1 -q:v 3 teaser-2026-10.jpg`.
- **With a poster, nothing downloads until somebody presses Play**, so Blob data transfer is roughly file size × plays. Without one, browsers fetch enough for a first frame.
- **Captions are relayed** through `/video/captions`, so the player loads them from this site and they never depend on the file host's CORS headers. A file that doesn't start with `WEBVTT` isn't served.

## Security

- The player page has no script. It carries its own Content-Security-Policy: it may load only https media and images plus captions from this site, and only this site may frame it.
- The site-wide policy from `frontend/src/lib/csp.ts` covers every path except exactly `/video/embed` and `/video/captions` (`CSP_HEADER_SOURCE`). Its `default-src 'self'` and deliberately short `img-src` would refuse a file host's video and poster. Any other `/video` address still gets it.
- The site-wide `frame-src` allows `'self'`, for `/video/embed`, and `https://www.youtube-nocookie.com`, where the YouTube redirect lands. `youtube.com` itself stays out.
- The redirect sets no `Referrer-Policy`: a redirect's policy replaces the iframe's, and YouTube refuses to play an embed that arrives without a referrer.
- Only a validated 11-character YouTube ID or a normalised https address reaches the redirect or the page, and every address is attribute-escaped.
