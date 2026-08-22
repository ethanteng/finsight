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
`#social-sent`. The window is applied by Ghost rather than after fetching, so
the job stays the same size as the blog grows.

The recency window matters on the first run: without it, every post in the back
catalogue would qualify at once and generate an inbox full of email. Widen it
deliberately with `--since-days` when backfilling, ideally alongside `--limit`.

The `#social-sent` tag is applied **after** the email is accepted, so a send
that fails is retried on the next run rather than being silently dropped. Like
the sync's dedupe tag it is internal, so it never appears publicly or as a
category on the blog.

That ordering leaves a narrow window: the email is accepted, then the tag write
fails, and the next run tries the same post again. Sends therefore carry a
Resend idempotency key stable per post. A retry with the same body returns the
original send; a retry with a regenerated draft (the model is non-deterministic)
returns `invalid_idempotent_request`, which this script treats as already
delivered so the `#social-sent` tag can still be applied. Either way the inbox
does not get a second copy.

## Character limits are measured, not trusted

Each platform is measured the way that platform measures, because an
over-length X or Bluesky post simply cannot be published:

| Platform | Limit | Counting |
|---|---|---|
| LinkedIn | 3000 | literal characters |
| Facebook | 2000 | literal characters |
| X / Twitter | 280 | **weighted**: every link costs 23 (t.co wrapping) however long it is, and emoji and non-Latin characters cost 2 |
| Bluesky | 280 | the **entire** URL counts; Bluesky does not shorten links |

X does not count characters, it weights them: only the code point ranges in its
published default configuration cost 1, and everything outside them — emoji,
CJK, most non-Latin scripts — costs 2. Counting code points instead would
under-report an emoji-heavy draft by nearly half and wave through a post X
rejects. An emoji built from several joined code points — a family, a flag, a
skin tone — is one grapheme and costs 2 in total rather than 2 apiece, so the
text is segmented before weighting. Bluesky counts code points, so an emoji
costs 1 there rather than the 2 that `String.length` reports.

## Campaign tracking

Each platform gets its own tagged link, built by the script and handed to the
model to paste verbatim:

```
https://asklinc.com/blog/<slug>?utm_source=<platform>&utm_medium=social&utm_campaign=soro_daily&utm_content=<slug>
```

`utm_source` is `linkedin`, `facebook`, `twitter` (X posts still attribute as
twitter) or `bluesky`. `utm_medium` and `utm_campaign` are fixed; keeping the
campaign stable and low-cardinality lets GA4 aggregate the whole programme into
one row. To compare Soro's output against hand-written posts, give those a
campaign of their own — without a second label there is nothing to compare
against.

The URLs are composed in code rather than asked of the model. They run past 170
characters, and a single mistyped parameter loses the attribution while still
looking like a working link. Each platform's copy is then checked against *its
own* link, so copy carrying another platform's tags is rejected and redrafted.

**These tags cost real space on Bluesky**, which counts the whole URL where X
charges a flat 23 characters for any link. On a 40-character slug the tagged
link runs about 179 characters, leaving roughly 100 of the 280 for the post
itself. The brief states the remaining budget per platform so the model is not
guessing. Dropping `utm_content` on Bluesky alone would return about 50
characters if the copy feels cramped — the landing page still identifies the
post.

UTM tags only capture traffic from links placed by hand. Organic search, which
is the point of the blog programme, arrives untagged; measuring that means
segmenting on landing page rather than campaign.

## Drafts are checked before they are sent

After the first draft, every platform is checked for two failures:

- **Over its limit.** The model gets one chance to shorten it, with the measured
  count and the limit quoted back. The correction is delivered as a
  `tool_result` answering the original call, not as a plain-text follow-up: an
  assistant turn containing `tool_use` must be answered by a matching
  `tool_result`, and anything else is rejected with a 400 before the model sees
  it. Anything still over is delivered flagged
  `OVER LIMIT` rather than quietly sent — a draft you can see is unpostable
  beats one you discover in the composer, and trimming it is quick.
- **Missing the article link.** The prompt asks for the URL verbatim, but that
  is an instruction, not a guarantee. Copy without the link cannot be trimmed
  into usefulness, so after one repair attempt the post *fails* instead: it is
  left untagged and picked up again on the next run.

## The editorial brief

`SYSTEM_PROMPT` in `scripts/generate-social-posts.ts` is the whole editorial
standard — voice, banned stock phrases, per-platform length and structure, and
how each post should relate to the product. Edit it there; nothing else needs
touching, and the platform specs in code carry only mechanical facts (character
limit, `utm_source`).

It asks the model to identify several candidate angles in the article and pick
the strongest for each platform, rather than resizing one post four times. Two
rules do the heavy lifting: *a post that could have been written without reading
the article is a failure*, and never invent a statistic the article does not
support. The second matters more than usual, because Soro's articles are
themselves model-written — a second model embellishing the first one's numbers
would compound the error.

Two sections are adapted to the mechanics. The posts come back through a forced
tool call rather than as labelled sections, and the links are supplied per
platform in the brief rather than composed by the model.

Copy is still a draft. Read it before posting, particularly any figure it
quotes.
