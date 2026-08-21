# Social Post Drafts

`scripts/generate-social-posts.ts` emails ready-to-post social copy — LinkedIn,
Facebook, X/Twitter and Bluesky — for blog posts that have just gone live.

It reads Ghost's **published** state rather than the Soro feed. That ordering is
deliberate: the `asklinc.com/blog/<slug>` link in the copy only resolves once a
post is published, and Soro imports land as drafts for review first (see
[SORO_BLOG_SYNC.md](./SORO_BLOG_SYNC.md)). Copy generated at import time would
carry a link that 404s.

## Usage

```bash
npm run social -- --dry-run        # print the copy, email nothing, tag nothing
npm run social                     # email copy for newly published posts
npm run social -- --since-days=14  # widen the recency window
npm run social -- --limit=2        # cap sends this run
```

Runs every six hours via `.github/workflows/social-posts.yml`, which can also be
triggered manually with a dry-run toggle and a custom window.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `GHOST_ADMIN_API_URL` | yes | e.g. `https://ask-linc-blog.ghost.io` |
| `GHOST_ADMIN_API_KEY` | yes | Ghost **Admin** API key, `id:secret` form |
| `ANTHROPIC_API_KEY` | yes | The copy is model-written |
| `RESEND_API_KEY` | unless `--dry-run` | Reuses the existing Resend account |
| `SOCIAL_EMAIL_TO` | unless `--dry-run` | Where the copy is sent |
| `SOCIAL_EMAIL_FROM` | no | Defaults to `Ask Linc <noreply@asklinc.com>` |
| `BLOG_CANONICAL_ORIGIN` | no | Defaults to `https://asklinc.com` |
| `SOCIAL_MODEL` | no | Model override |

## Which posts are picked up

A post qualifies when it is published, was published inside the recency window
(7 days by default), and does not already carry the Ghost internal tag
`#social-sent`.

The recency window matters on the first run: without it, every post in the back
catalogue would qualify at once and generate an inbox full of email. Widen it
deliberately with `--since-days` when backfilling, ideally alongside `--limit`.

The `#social-sent` tag is applied **after** the email is accepted, so a send
that fails is retried on the next run rather than being silently dropped. Like
the sync's dedupe tag it is internal, so it never appears publicly or as a
category on the blog.

## Character limits are measured, not trusted

Each platform is measured the way that platform measures, because an
over-length X or Bluesky post simply cannot be published:

| Platform | Limit | Counting |
|---|---|---|
| LinkedIn | 3000 | literal characters |
| Facebook | 2000 | literal characters |
| X / Twitter | 280 | **every link counts as 23 characters** (t.co wrapping), however long it is |
| Bluesky | 280 | the **entire** URL counts; Bluesky does not shorten links |

Counting uses code points, so an emoji costs 1 rather than the 2 that
`String.length` reports.

When something comes back over its limit, the model gets one chance to shorten
it, with the measured count and the limit quoted back. Anything still over is
delivered flagged `OVER LIMIT` in the email rather than quietly sent — an
unpostable draft you can see beats one you discover in the composer.

## Notes

Copy is grounded in the article's own text: the prompt requires a specific
number, tradeoff or scenario from the post, and forbids inventing statistics. It
is still a draft. Read it before posting, particularly any figure it quotes.
