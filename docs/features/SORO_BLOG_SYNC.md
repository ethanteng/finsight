# Soro → Ghost Blog Sync

Soro (`app.trysoro.com`) generates a blog post each day and exposes them on an
RSS feed. `scripts/sync-soro-to-ghost.ts` imports new items into Ghost through
the Admin API, after which the existing blog pipeline serves them with no
further changes: `/blog`, `/blog/[slug]`, `sitemap.ts`, and the `BlogPosting`
structured data all read from Ghost already.

Posts are imported as **drafts**. Nothing reaches asklinc.com until it is
published by hand in Ghost.

## Why not the Soro embed widget

Soro also offers a `<div id="soro-blog">` + `<script>` embed. It renders
client-side, so post content never appears in the server HTML: no
`/blog/<slug>` URL per post, no sitemap entries, no per-post OpenGraph tags or
structured data, and a second blog styled unlike `MarketingBlogPage`. For
content published specifically to be indexed, the embed forfeits the benefit.

## Usage

```bash
npm run sync:soro -- --dry-run          # parse the feed and report, write nothing
npm run sync:soro                       # import new items as drafts
npm run sync:soro -- --status=published # import and publish immediately
npm run sync:soro -- --limit=5          # cap imports this run (for backfills)
```

Runs daily at 21:00 UTC via `.github/workflows/sync-soro-blog.yml`, which can
also be triggered manually (with an optional dry run) from the Actions tab.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `SORO_RSS_URL` | yes | The Soro feed URL |
| `GHOST_ADMIN_API_URL` | yes | e.g. `https://ask-linc-blog.ghost.io` |
| `GHOST_ADMIN_API_KEY` | yes | Ghost **Admin** API key, `id:secret` form |
| `ANTHROPIC_API_KEY` | no | Enables model-chosen tags; falls back to keyword matching |
| `BLOG_CANONICAL_ORIGIN` | no | Defaults to `https://asklinc.com` |
| `SORO_TAGGING_MODEL` | no | Model override for tag selection |

The Admin key is distinct from the `GHOST_CONTENT_KEY` the frontend uses. Create
it under Ghost Admin → Settings → Integrations → Add custom integration.

## How it works

1. **Fetch and parse the feed.** Article bodies arrive as HTML in
   `content:encoded` — no Markdown conversion is involved. The parser is a
   narrow RSS 2.0 reader rather than a general XML dependency.
2. **Choose tags.** The blog's public tag vocabulary is read live from Ghost, and
   Claude picks up to two tags from it through a constrained enum, so it can
   reuse an existing tag but never invent one that fragments the taxonomy. With
   no API key, a stemming keyword scorer stands in. A post that matches nothing
   is imported untagged and shows the blog's default category label.
3. **Create the post.** `POST /posts/`, then `PUT /posts/<id>/?source=html`.
   Ghost 5.x stores content as Lexical and only converts an `html` field when
   the source is declared explicitly.
4. **Verify.** The post is read back with `?formats=html,lexical` to confirm the
   body is non-empty and the canonical URL is exactly right. The `PUT` response
   reports an empty `html` even on success, so the write is not trusted on its
   own.

## Details worth knowing

**Canonical URLs.** The same Ghost content is served from `blog.asklinc.com` and
`asklinc.com/blog`. Without an explicit `canonical_url`, Ghost self-canonicalises
to `blog.asklinc.com` and splits the ranking signal across both domains. The
script always sets `https://asklinc.com/blog/<slug>` at creation time.
`canonical_url` cannot be sent alongside `?source=html`, so it goes on the POST
and survives the PUT — Ghost applies partial updates.

**Slugs.** Soro is configured with a base URL of the site root, so its item
links look like `https://asklinc.com/<slug>` even though posts are served from
`/blog/<slug>`. Those links 404 today. The script uses only the final path
segment, but if Soro allows setting the base URL to `https://asklinc.com/blog`,
fixing it there makes their links resolve.

**Deduplication.** Each imported post carries the Ghost *internal* tag
`#imported-<guid>`. Internal tags are stripped from the Content API, so they
never surface as a category on the blog while remaining queryable through the
Admin API. Reruns are idempotent. If a feed item wants a slug that some other
post already occupies, it is skipped with a warning rather than imported —
Ghost would otherwise append `-2` and quietly break the canonical URL.

**Images.** Featured images are copied from Soro's Supabase bucket into Ghost's
own storage, so the OpenGraph and schema.org image URLs stay valid if Soro
rotates the original. The blog does not render `feature_image` on the page
itself — `MarketingArticlePage` uses a decorative block — so this affects social
previews and structured data only. A failed upload falls back to the Soro URL
and does not fail the import.

## Editorial note

These posts are model-generated at a daily cadence on a financial site, which is
the pattern Google's scaled-content-abuse policy targets. Importing as drafts
keeps a human between generation and publication. If the cadence is ever
switched to `--status=published`, that review step disappears.
