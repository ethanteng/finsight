#!/usr/bin/env npx ts-node
/**
 * Import Soro-generated posts from their RSS feed into Ghost as posts.
 *
 * Soro publishes a new article daily to an RSS feed. This pulls each new item
 * and creates it in Ghost through the Admin API, after which the existing
 * Next.js blog picks it up automatically: `/blog` (ISR 60s), `/blog/[slug]`,
 * the sitemap, and the BlogPosting schema all read from Ghost already.
 *
 * The feed delivers article bodies as HTML in `content:encoded`, so nothing is
 * converted here — the HTML goes to Ghost with `?source=html`, which is what
 * Ghost 5.x needs to build its internal Lexical representation.
 *
 * Public tags are chosen from the vocabulary the blog already uses, read live
 * from Ghost so the set stays current as tags are added. Claude picks from that
 * list through a constrained enum, so it can only reuse existing tags, never
 * invent one; a keyword scorer covers the case where no API key is configured.
 *
 * Deduplication uses a single Ghost *internal* tag, `#imported-<guid>`.
 * Internal tags are stripped from the Content API, so they never reach
 * `postCategory()` on the blog index, while remaining queryable through the
 * Admin API. Reruns are therefore idempotent.
 *
 * Usage:
 *   npm run sync:soro -- --dry-run          # parse and report, write nothing
 *   npm run sync:soro                       # import new items as drafts
 *   npm run sync:soro -- --status=published # import and publish immediately
 *   npm run sync:soro -- --limit=5
 *
 * Env:
 *   SORO_RSS_URL          Soro feed URL
 *   GHOST_ADMIN_API_URL   e.g. https://ask-linc-blog.ghost.io
 *   GHOST_ADMIN_API_KEY   Admin API key, in `id:secret` form
 *   BLOG_CANONICAL_ORIGIN Optional, defaults to https://asklinc.com
 *   ANTHROPIC_API_KEY     Optional; enables model-chosen tags instead of keyword matching
 *   SORO_TAGGING_MODEL    Optional model override for tag selection
 */

import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

import { GhostAdmin, type GhostPostRecord } from './lib/ghost-admin';

// The backend reads `.env.local` at the repo root rather than `.env`; values
// already in the environment (as in CI) are left untouched by both calls.
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const TAGGING_MODEL = process.env.SORO_TAGGING_MODEL || 'claude-sonnet-5';

/** Most posts sit in one or two categories; more than that dilutes the taxonomy. */
const MAX_TAGS_PER_POST = 2;
const CANONICAL_ORIGIN = (process.env.BLOG_CANONICAL_ORIGIN || 'https://asklinc.com').replace(/\/$/, '');

/** Ghost caps meta_description at 500 chars; search engines truncate far earlier. */
const META_DESCRIPTION_MAX = 300;

interface SoroItem {
  guid: string;
  title: string;
  link: string;
  slug: string;
  pubDate: string | null;
  description: string | null;
  html: string;
  imageUrl: string | null;
}

interface CliOptions {
  dryRun: boolean;
  status: 'draft' | 'published';
  limit: number | null;
}

// ---------------------------------------------------------------------------
// RSS parsing
//
// Deliberately a narrow RSS 2.0 reader rather than a general XML parser: the
// backend has no XML dependency and this feed is a flat <channel><item> list.
// The only structural subtlety is CDATA, which can contain markup that would
// otherwise look like tags, so every scan skips CDATA regions explicitly.
// ---------------------------------------------------------------------------

/** Index of `needle` in `xml` at or after `from`, ignoring matches inside CDATA. */
function indexOfOutsideCdata(xml: string, needle: string, from: number): number {
  let i = from;
  while (i < xml.length) {
    const cdata = xml.indexOf('<![CDATA[', i);
    const hit = xml.indexOf(needle, i);
    if (hit === -1) return -1;
    if (cdata === -1 || hit < cdata) return hit;
    const close = xml.indexOf(']]>', cdata);
    if (close === -1) return -1;
    i = close + 3;
  }
  return -1;
}

function extractItems(xml: string): string[] {
  const items: string[] = [];
  let cursor = 0;
  for (;;) {
    const open = indexOfOutsideCdata(xml, '<item>', cursor);
    if (open === -1) break;
    const close = indexOfOutsideCdata(xml, '</item>', open);
    if (close === -1) break;
    items.push(xml.slice(open + '<item>'.length, close));
    cursor = close + '</item>'.length;
  }
  return items;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    // Ampersand last, so a double-escaped entity is not decoded twice.
    .replace(/&amp;/g, '&');
}

/** Text of the first `<tag>` in `scope`, CDATA unwrapped and entities decoded. */
function readTag(scope: string, tag: string): string | null {
  const open = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'i').exec(scope);
  if (!open) return null;
  const start = open.index + open[0].length;
  const close = scope.indexOf(`</${tag}>`, start);
  if (close === -1) return null;

  const raw = scope.slice(start, close).trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw);
  return cdata ? cdata[1].trim() : decodeXmlEntities(raw);
}

/** Value of `attr` on the first `<tag>` in `scope`. */
function readAttr(scope: string, tag: string, attr: string): string | null {
  const el = new RegExp(`<${tag}(\\s[^>]*)?/?>`, 'i').exec(scope);
  if (!el || !el[1]) return null;
  const found = new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`, 'i').exec(el[1]);
  return found ? decodeXmlEntities(found[1]) : null;
}

/**
 * Soro is configured with a base URL of the site root, so item links look like
 * `https://asklinc.com/<slug>` even though posts are served from `/blog/<slug>`.
 * Only the trailing path segment is meaningful here.
 */
function slugFromLink(link: string, title: string): string {
  const fromLink = link.split('?')[0].split('#')[0].replace(/\/$/, '').split('/').pop();
  if (fromLink && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(fromLink)) return fromLink.toLowerCase();

  // Fall back to a slug built from the title if the link is not slug-shaped.
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 190);
}

function parseFeed(xml: string): SoroItem[] {
  return extractItems(xml).flatMap((raw) => {
    const guid = readTag(raw, 'guid');
    const title = readTag(raw, 'title');
    const link = readTag(raw, 'link');
    const html = readTag(raw, 'content:encoded');

    if (!guid || !title || !link || !html) {
      console.warn(`  ! skipping malformed item (title=${title ?? 'none'}) — missing guid, link, or content`);
      return [];
    }

    return [{
      guid,
      title,
      link,
      slug: slugFromLink(link, title),
      pubDate: readTag(raw, 'pubDate'),
      description: readTag(raw, 'description'),
      html,
      imageUrl: readAttr(raw, 'media:content', 'url') || readAttr(raw, 'enclosure', 'url'),
    }];
  });
}

/** Ghost slugifies the internal tag `#imported-<guid>` to `hash-imported-<guid>`. */
function guidTagName(guid: string): string {
  return `#imported-${guid}`;
}

function importedGuids(posts: GhostPostRecord[]): Set<string> {
  const guids = new Set<string>();
  for (const post of posts) {
    for (const tag of post.tags || []) {
      const match = /^(?:#|hash-)imported-(.+)$/i.exec(tag.name || tag.slug || '');
      if (match) guids.add(match[1].toLowerCase());
    }
  }
  return guids;
}

// ---------------------------------------------------------------------------
// Tag selection
// ---------------------------------------------------------------------------

/** Words too common in finance writing to signal a category on their own. */
const SCORING_STOPWORDS = new Set(['and', 'the', 'for', 'your', 'with', 'of', 'a']);

/** Minimum score before a tag is considered earned rather than incidental. */
const MIN_TAG_SCORE = 3;

/**
 * Crudely reduce a word to a comparable stem so "financial" matches the tag
 * "Finance" and "savings" matches "Saving". Suffixes are ordered longest-first
 * where they overlap ("ial" before "al") and applied twice, which is enough for
 * the plural-of-a-gerund case ("savings" -> "saving" -> "sav").
 */
function stem(word: string): string {
  let out = word;
  for (let pass = 0; pass < 2; pass++) {
    out = out.replace(/(ial|ies|ing|ers|er|al|s|y|e)$/, '');
  }
  return out;
}

function stemmedWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !SCORING_STOPWORDS.has(word))
    .map(stem);
}

/**
 * Score each known tag by how strongly the post text echoes it. Used when no
 * Anthropic key is configured, and as the fallback if the API call fails — a
 * post that arrives untagged still publishes, it just shows the blog's default
 * category label.
 *
 * Matching is on whole stemmed words, never substrings: a substring test lets
 * "productive" satisfy the tag "Product", which is exactly the kind of
 * plausible-looking miscategorisation nobody reviews.
 */
function scoreTagsByKeyword(vocabulary: string[], text: string): string[] {
  const counts = new Map<string, number>();
  for (const word of stemmedWords(text)) {
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  const scored = vocabulary.map((tag) => {
    const words = stemmedWords(tag);
    if (words.length === 0) return { tag, score: 0 };

    // Cap each word's contribution so one heavily repeated term cannot carry a
    // tag on its own.
    const score = words.reduce((sum, word) => sum + Math.min(counts.get(word) || 0, 3), 0)
      // Every word of a multi-word tag appearing is much stronger evidence than
      // a single word of it appearing often.
      + (words.every((word) => counts.has(word)) ? 3 : 0);

    return { tag, score };
  });

  return scored
    .filter((entry) => entry.score >= MIN_TAG_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_TAGS_PER_POST)
    .map((entry) => entry.tag);
}

/**
 * Choose up to `MAX_TAGS_PER_POST` tags for a post, restricted to tags the blog
 * already uses. The model receives the vocabulary as a closed enum, so it
 * cannot mint a near-duplicate tag ("Retirement Planning" alongside
 * "Retirement") and fragment the taxonomy.
 */
async function selectTags(vocabulary: string[], item: SoroItem): Promise<string[]> {
  if (vocabulary.length === 0) return [];

  // Tag choice is driven by the argument of the post, which the opening
  // paragraphs carry; the full body would mostly add tokens, not signal.
  const body = item.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const excerpt = body.slice(0, 2000);

  if (!process.env.ANTHROPIC_API_KEY) {
    return scoreTagsByKeyword(vocabulary, `${item.title} ${body}`);
  }

  try {
    const response = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
      model: TAGGING_MODEL,
      max_tokens: 512,
      system:
        'You categorise posts for a personal finance blog. Choose the tags that best describe what the post is about, ' +
        'using only the blog\'s existing tags. Prefer one precise tag over two loose ones, and return an empty array ' +
        'when nothing in the list genuinely fits. The first tag is displayed as the post\'s category, so order by fit.',
      tools: [{
        name: 'assign_tags',
        description: 'Assign existing blog tags to the post.',
        input_schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tags: {
              type: 'array',
              maxItems: MAX_TAGS_PER_POST,
              items: { type: 'string', enum: vocabulary },
            },
            reason: { type: 'string' },
          },
          required: ['tags', 'reason'],
        },
      }],
      tool_choice: { type: 'tool', name: 'assign_tags', disable_parallel_tool_use: true },
      messages: [{ role: 'user', content: `Title: ${item.title}\n\nSummary: ${item.description || 'none'}\n\nArticle: ${excerpt}` }],
    });

    const call = response.content.find((block) => block.type === 'tool_use');
    if (!call || call.type !== 'tool_use') throw new Error('model returned no tag assignment');

    const chosen = (call.input as { tags?: unknown }).tags;
    if (!Array.isArray(chosen)) throw new Error('tag assignment was not an array');

    // The enum constrains the model, but the response is still external input:
    // confirm every tag exists before it reaches Ghost, where an unknown name
    // would silently create a new tag.
    const known = new Set(vocabulary);
    return chosen.filter((tag): tag is string => typeof tag === 'string' && known.has(tag)).slice(0, MAX_TAGS_PER_POST);
  } catch (error) {
    console.warn(`  ! tag selection fell back to keyword matching: ${(error as Error).message}`);
    return scoreTagsByKeyword(vocabulary, `${item.title} ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

async function importItem(
  ghost: GhostAdmin,
  item: SoroItem,
  status: CliOptions['status'],
  tags: string[],
): Promise<string> {
  const canonicalUrl = `${CANONICAL_ORIGIN}/blog/${item.slug}`;
  const featureImage = item.imageUrl ? (await ghost.uploadImage(item.imageUrl, item.slug) ?? item.imageUrl) : null;

  // Always created as a draft, whatever the requested status. The body is not
  // usable until the HTML conversion below runs, so publishing here would put a
  // post with no content on the live site for the width of two requests.
  // `canonical_url` must be set at creation: the same Ghost content is served
  // from blog.asklinc.com and asklinc.com/blog, and without it Ghost
  // self-canonicalises to the wrong domain and splits the ranking signal.
  const created = await ghost.request<{ posts: GhostPostRecord[] }>('POST', '/posts/', {
    posts: [{
      title: item.title,
      slug: item.slug,
      html: item.html,
      status: 'draft',
      meta_title: item.title,
      meta_description: item.description?.slice(0, META_DESCRIPTION_MAX) || undefined,
      custom_excerpt: item.description?.slice(0, META_DESCRIPTION_MAX) || undefined,
      canonical_url: canonicalUrl,
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
      // Public tags first — the blog renders tags[0] as the post's category —
      // followed by the internal dedupe marker, which the Content API strips.
      tags: [...tags.map((name) => ({ name })), { name: guidTagName(item.guid) }],
      feature_image: featureImage || undefined,
      feature_image_alt: featureImage ? item.title : undefined,
    }],
  });

  const post = created.posts[0];

  // From here the post exists in Ghost carrying its dedupe tag, so a failure
  // that left it in place would be skipped by every later run and never
  // repaired. Roll it back instead, which makes the item eligible again next
  // time.
  try {
    // Ghost 5.x stores Lexical internally and only converts an `html` field
    // when the source is declared explicitly. Sending `canonical_url` alongside
    // `?source=html` is rejected, so it stays on the POST above and survives —
    // Ghost applies partial updates.
    const converted = await ghost.request<{ posts: GhostPostRecord[] }>('PUT', `/posts/${post.id}/?source=html`, {
      posts: [{ title: item.title, html: item.html, updated_at: post.updated_at }],
    });

    // The PUT response can report an empty `html` even on success, so confirm
    // the stored Lexical is non-empty rather than trusting the write.
    const stored = await ghost.request<{ posts: Array<{ lexical?: string; canonical_url?: string; updated_at?: string }> }>(
      'GET',
      `/posts/${post.id}/?formats=html,lexical`,
    );
    const verified = stored.posts[0];

    if (!verified?.lexical || verified.lexical.length === 0) {
      throw new Error('saved with an empty body — check the HTML source conversion');
    }
    if (verified.canonical_url !== canonicalUrl) {
      throw new Error(`canonical_url is "${verified.canonical_url}", expected "${canonicalUrl}"`);
    }

    // Only now, with the body confirmed, is the post allowed to go live.
    if (status === 'published') {
      await ghost.request('PUT', `/posts/${post.id}/`, {
        posts: [{
          status: 'published',
          updated_at: verified.updated_at ?? converted.posts?.[0]?.updated_at ?? post.updated_at,
        }],
      });
    }
  } catch (error) {
    await ghost.deletePost(post.id, item.slug);
    throw new Error(`post ${item.slug} ${(error as Error).message}`);
  }

  return post.id;
}

function parseArgs(argv: string[]): CliOptions {
  const status = argv.find((a) => a.startsWith('--status='))?.split('=')[1] ?? 'draft';
  if (status !== 'draft' && status !== 'published') {
    throw new Error(`--status must be "draft" or "published", got "${status}"`);
  }
  const limitArg = argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limit = limitArg ? Number(limitArg) : null;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error(`--limit must be a positive integer, got "${limitArg}"`);
  }

  return { dryRun: argv.includes('--dry-run'), status, limit };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const feedUrl = process.env.SORO_RSS_URL;
  if (!feedUrl) throw new Error('SORO_RSS_URL is not set');

  console.log(`Fetching ${feedUrl}`);
  const res = await fetch(feedUrl);
  if (!res.ok) {
    const body = (await res.text()).trim();
    // Soro answers 403 "Feed is disabled" when the feed toggle is off.
    throw new Error(`feed request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const items = parseFeed(await res.text());
  console.log(`Feed contains ${items.length} item(s)\n`);
  if (items.length === 0) return;

  if (options.dryRun) {
    for (const item of items) {
      console.log(`  ${item.title}`);
      console.log(`    slug   ${item.slug}   -> ${CANONICAL_ORIGIN}/blog/${item.slug}`);
      console.log(`    guid   ${item.guid}`);
      console.log(`    body   ${item.html.length} chars, image ${item.imageUrl ? 'yes' : 'none'}`);
    }
    console.log('\nDry run — nothing written to Ghost.');
    return;
  }

  const { GHOST_ADMIN_API_URL, GHOST_ADMIN_API_KEY } = process.env;
  if (!GHOST_ADMIN_API_URL || !GHOST_ADMIN_API_KEY) {
    throw new Error('GHOST_ADMIN_API_URL and GHOST_ADMIN_API_KEY must be set');
  }

  const ghost = new GhostAdmin(GHOST_ADMIN_API_URL.replace(/\/$/, ''), GHOST_ADMIN_API_KEY);
  await ghost.calibrateClock();

  const vocabulary = await ghost.allTags();
  console.log(`Tag vocabulary (${vocabulary.length}): ${vocabulary.join(', ') || 'none'}`);

  const existing = await ghost.allPosts();
  const alreadyImported = importedGuids(existing);
  const takenSlugs = new Map(existing.filter((p) => p.slug).map((p) => [p.slug as string, p]));
  console.log(`Ghost holds ${existing.length} post(s), ${alreadyImported.size} previously imported from Soro\n`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    if (options.limit !== null && imported >= options.limit) {
      console.log(`Reached --limit=${options.limit}, stopping.`);
      break;
    }

    if (alreadyImported.has(item.guid.toLowerCase())) {
      skipped++;
      continue;
    }

    // A slug already in use by a post this script did not import means someone
    // wrote on the same topic by hand. Ghost would silently append "-2" and
    // break the canonical URL, so leave it for a human.
    const collision = takenSlugs.get(item.slug);
    if (collision) {
      console.warn(`  ! "${item.title}" wants slug "${item.slug}", already used by post ${collision.id} — skipping`);
      skipped++;
      continue;
    }

    try {
      const tags = await selectTags(vocabulary, item);
      const id = await importItem(ghost, item, options.status, tags);
      imported++;
      console.log(`  + ${item.title}`);
      console.log(`    tags: ${tags.join(', ') || 'none (blog shows its default category)'}`);
      console.log(`    ${options.status} · ${GHOST_ADMIN_API_URL.replace(/\/$/, '')}/ghost/#/editor/post/${id}`);
    } catch (error) {
      failed++;
      console.error(`  x ${item.title}: ${(error as Error).message}`);
    }
  }

  console.log(`\nImported ${imported}, skipped ${skipped}, failed ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}

// Guarded so the pure helpers above can be imported by tests without the
// script executing.
if (require.main === module) {
  main().catch((error) => {
    console.error(`\nsync-soro-to-ghost failed: ${error.message}`);
    process.exit(1);
  });
}

export { parseFeed, scoreTagsByKeyword, selectTags, slugFromLink, importedGuids, guidTagName };
