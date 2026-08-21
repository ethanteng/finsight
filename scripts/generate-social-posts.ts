#!/usr/bin/env npx ts-node
/**
 * Draft social copy for blog posts that have just gone live.
 *
 * Runs against Ghost rather than the Soro feed, so it fires when a post is
 * actually published — not when it is imported as a draft. That ordering
 * matters: the asklinc.com/blog/<slug> link only resolves once the post is
 * live, so copy generated any earlier cannot be posted.
 *
 * Each post is handled once. A Ghost internal tag (`#social-sent`) records
 * that its copy was delivered, so repeated runs never re-send. Only posts
 * published inside the recency window are considered, which keeps a first run
 * from emailing the entire back catalogue.
 *
 * Usage:
 *   npm run social -- --dry-run       # print the copy, send nothing, tag nothing
 *   npm run social                    # email copy for newly published posts
 *   npm run social -- --since-days=14
 *   npm run social -- --limit=2
 *
 * Env:
 *   GHOST_ADMIN_API_URL   e.g. https://ask-linc-blog.ghost.io
 *   GHOST_ADMIN_API_KEY   Admin API key, in `id:secret` form
 *   ANTHROPIC_API_KEY     Required — the copy is model-written
 *   RESEND_API_KEY        Required unless --dry-run
 *   SOCIAL_EMAIL_TO       Recipient address (required unless --dry-run)
 *   SOCIAL_EMAIL_FROM     Optional, defaults to Ask Linc <noreply@asklinc.com>
 *   BLOG_CANONICAL_ORIGIN Optional, defaults to https://asklinc.com
 *   SOCIAL_MODEL          Optional model override
 */

import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';
import * as dotenv from 'dotenv';

import { GhostAdmin, hasTag, type GhostPostRecord } from './lib/ghost-admin';

// The backend reads `.env.local` at the repo root rather than `.env`; values
// already in the environment (as in CI) are left untouched by both calls.
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const CANONICAL_ORIGIN = (process.env.BLOG_CANONICAL_ORIGIN || 'https://asklinc.com').replace(/\/$/, '');
const SOCIAL_MODEL = process.env.SOCIAL_MODEL || 'claude-opus-5';
const EMAIL_FROM = process.env.SOCIAL_EMAIL_FROM || 'Ask Linc <noreply@asklinc.com>';

/** Marks a post whose social copy has been delivered. Internal, so never public. */
const SENT_TAG = '#social-sent';

/** X wraps every link in t.co, so a URL always costs this many characters. */
const X_URL_COST = 23;

/**
 * Code point ranges X counts as one unit. Everything outside them — emoji and
 * most non-Latin scripts — counts as two under X's weighted-length algorithm,
 * so a draft full of emoji is longer to X than its code point count suggests.
 * These are the ranges from X's own default configuration.
 */
const X_SINGLE_WEIGHT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];

/**
 * `Intl.Segmenter` ships in every Node version this repo runs on, but its types
 * arrive with ES2022 and the project compiles against ES2020. Declared locally
 * rather than widening `lib` for the whole codebase.
 */
interface GraphemeSegmenter {
  segment(input: string): Iterable<{ segment: string }>;
}
declare const Intl: {
  Segmenter: new (locale: string, options: { granularity: 'grapheme' }) => GraphemeSegmenter;
};

const GRAPHEME_SEGMENTER = new Intl.Segmenter('en', { granularity: 'grapheme' });

function isSingleWeight(point: number): boolean {
  return X_SINGLE_WEIGHT_RANGES.some(([start, end]) => point >= start && point <= end);
}

/**
 * True for a grapheme that is an emoji rather than, say, a letter with a
 * combining accent. Only emoji are collapsed below, so accented text keeps its
 * per-code-point weighting.
 */
function isEmojiCluster(points: string[]): boolean {
  return points.some((character) => {
    const point = character.codePointAt(0) as number;
    return point >= 0x1f000                          // pictographs and beyond
      || point === 0x200d                            // zero-width joiner
      || point === 0xfe0f                            // emoji presentation selector
      || (point >= 0x1f1e6 && point <= 0x1f1ff);     // regional indicators (flags)
  });
}

function xWeightedLength(text: string): number {
  let total = 0;
  for (const { segment } of GRAPHEME_SEGMENTER.segment(text)) {
    const points = [...segment];

    // X prices a whole emoji sequence as one double-weight unit, so a family or
    // flag built from several joined code points costs 2 rather than 2 apiece.
    if (points.length > 1 && isEmojiCluster(points)) {
      total += 2;
      continue;
    }

    for (const character of points) {
      total += isSingleWeight(character.codePointAt(0) as number) ? 1 : 2;
    }
  }
  return total;
}

type Platform = 'linkedin' | 'facebook' | 'x' | 'bluesky';

interface PlatformSpec {
  key: Platform;
  label: string;
  /** Hard character ceiling, measured the way the platform itself measures. */
  limit: number;
  guidance: string;
}

const PLATFORMS: PlatformSpec[] = [
  {
    key: 'linkedin',
    label: 'LinkedIn',
    limit: 3000,
    guidance:
      '150-300 words. Professional and insight-led, opening on a concrete hook or a surprising statistic from the post. ' +
      'Short punchy paragraphs, never a wall of text. At most one or two emoji, and only where natural. ' +
      'End with a soft call to action and the post link. Three to five relevant hashtags on the final line.',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    limit: 2000,
    guidance:
      '80-150 words. Conversational, friendly and relatable, speaking to everyday money concerns. ' +
      'Two or three short paragraphs, one or two emoji where they fit. End with the post link and a direct ' +
      'question that invites replies. Two or three hashtags.',
  },
  {
    key: 'x',
    label: 'X / Twitter',
    limit: 280,
    guidance:
      'At most 280 characters INCLUDING the link, which always counts as 23 characters however long it is. ' +
      'Lead with the single most interesting claim or number in the post — no throat-clearing, no "thread below". ' +
      'One hashtag at most; often none reads better. The link goes last.',
  },
  {
    key: 'bluesky',
    label: 'Bluesky',
    limit: 280,
    guidance:
      'At most 280 characters INCLUDING the full link, which counts every character (Bluesky does not shorten links). ' +
      'Punchy and direct, leading with the sharpest insight. One or two hashtags at most.',
  },
];

type SocialCopy = Record<Platform, string>;

interface CliOptions {
  dryRun: boolean;
  sinceDays: number;
  limit: number | null;
}

/**
 * Character count as the target platform counts it. X substitutes every URL
 * with a fixed-cost t.co link; everywhere else the literal text counts, using
 * code points so emoji are not double-counted the way `String.length` does.
 */
function measure(platform: Platform, text: string): number {
  if (platform === 'x') {
    // Links are substituted with their fixed t.co cost as single-weight
    // characters, so the weighting below prices them at exactly 23.
    return xWeightedLength(text.replace(/https?:\/\/\S+/g, 'x'.repeat(X_URL_COST)));
  }
  return [...text].length;
}

function overLimit(spec: PlatformSpec, text: string): boolean {
  return measure(spec.key, text) > spec.limit;
}

/**
 * Copy without the article link is not promotional copy, it is just text. The
 * prompt asks for the URL verbatim, but that is an instruction rather than a
 * guarantee, so it is checked rather than assumed.
 */
function missingUrl(text: string, url: string): boolean {
  return !text.includes(url);
}

interface CopyProblems {
  tooLong: PlatformSpec[];
  linkless: PlatformSpec[];
}

function findProblems(copy: SocialCopy, url: string): CopyProblems {
  return {
    tooLong: PLATFORMS.filter((spec) => overLimit(spec, copy[spec.key])),
    linkless: PLATFORMS.filter((spec) => missingUrl(copy[spec.key], url)),
  };
}

const COPY_TOOL = {
  name: 'draft_social_posts',
  description: 'Return the social copy for one blog post, one entry per platform.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: Object.fromEntries(
      PLATFORMS.map((p) => [p.key, { type: 'string', description: `${p.label}: ${p.guidance}` }]),
    ),
    required: PLATFORMS.map((p) => p.key),
  },
};

function systemPrompt(): string {
  return [
    'You write social copy promoting articles from Ask Linc, an AI-powered personal finance assistant at https://asklinc.com.',
    '',
    'Voice: knowledgeable, practical, plain-spoken. Never salesy, never breathless, no growth-hack cadence.',
    'Ground every post in something specific the article actually says — a number, a tradeoff, a concrete scenario.',
    'A post that could have been written without reading the article is a failure.',
    'Never invent statistics or claims that are not in the article.',
    'Include the post URL exactly as given, without tracking parameters or shortening.',
    '',
    'Per-platform requirements:',
    ...PLATFORMS.map((p) => `- ${p.label}: ${p.guidance}`),
  ].join('\n');
}

function postBrief(post: GhostPostRecord, url: string): string {
  const body = (post.plaintext || post.excerpt || post.custom_excerpt || '').slice(0, 6000);
  return [
    `Title: ${post.title}`,
    `URL: ${url}`,
    `Summary: ${post.custom_excerpt || post.excerpt || 'none'}`,
    '',
    'Article:',
    body,
  ].join('\n');
}

function readCopy(response: Anthropic.Message): SocialCopy {
  const call = response.content.find((block) => block.type === 'tool_use');
  if (!call || call.type !== 'tool_use') throw new Error('model returned no social copy');

  const input = call.input as Record<string, unknown>;
  const copy = {} as SocialCopy;
  for (const spec of PLATFORMS) {
    const text = input[spec.key];
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error(`model returned no ${spec.label} copy`);
    }
    copy[spec.key] = text.trim();
  }
  return copy;
}

/**
 * Draft copy for one post, then give the model a single chance to shorten
 * anything that came back over its platform's limit. Length is checked here
 * rather than trusted, because an over-length X or Bluesky post simply cannot
 * be published.
 */
async function draftCopy(client: Anthropic, post: GhostPostRecord, url: string): Promise<SocialCopy> {
  const request = (messages: Anthropic.MessageParam[]) => client.messages.create({
    model: SOCIAL_MODEL,
    max_tokens: 2048,
    system: systemPrompt(),
    tools: [COPY_TOOL],
    tool_choice: { type: 'tool', name: 'draft_social_posts', disable_parallel_tool_use: true },
    messages,
  });

  const first = await request([{ role: 'user', content: postBrief(post, url) }]);
  const copy = readCopy(first);

  const problems = findProblems(copy, url);
  if (problems.tooLong.length === 0 && problems.linkless.length === 0) return copy;

  const summary = [
    problems.tooLong.length ? `${problems.tooLong.map((s) => s.label).join(', ')} over limit` : '',
    problems.linkless.length ? `${problems.linkless.map((s) => s.label).join(', ')} missing the link` : '',
  ].filter(Boolean).join('; ');
  console.log(`    revising: ${summary}`);

  const repaired = readCopy(await request([
    { role: 'user', content: postBrief(post, url) },
    { role: 'assistant', content: first.content },
    {
      role: 'user',
      content: [
        'Some of these need fixing. Rewrite every platform, returning the same copy for the ones already correct:',
        ...problems.tooLong.map((spec) =>
          `- ${spec.label}: ${measure(spec.key, copy[spec.key])} characters, limit ${spec.limit}` +
          (spec.key === 'x' ? ' (the link counts as 23 characters)' : ''),
        ),
        ...problems.linkless.map((spec) => `- ${spec.label}: must contain the URL exactly as given`),
        `The URL is ${url} — include it verbatim. Cut words, never the link.`,
      ].join('\n'),
    },
  ]));

  // Length is left to the recipient to trim, flagged in the email. A missing
  // link cannot be trimmed into existence, so it fails the post instead: it
  // stays untagged and is retried on the next run.
  const stillLinkless = PLATFORMS.filter((spec) => missingUrl(repaired[spec.key], url));
  if (stillLinkless.length > 0) {
    throw new Error(`copy omitted the post URL for ${stillLinkless.map((s) => s.label).join(', ')}`);
  }

  return repaired;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailHtml(post: GhostPostRecord, url: string, copy: SocialCopy): string {
  const blocks = PLATFORMS.map((spec) => {
    const text = copy[spec.key];
    const count = measure(spec.key, text);
    const over = count > spec.limit;
    const meta = spec.key === 'x' || spec.key === 'bluesky'
      ? `${count} / ${spec.limit} characters`
      : `${text.trim().split(/\s+/).length} words`;

    return `
      <h2 style="font:600 14px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#555;margin:32px 0 6px">
        ${spec.label}
      </h2>
      <p style="font:400 12px system-ui,sans-serif;color:${over ? '#b00020' : '#777'};margin:0 0 8px">
        ${meta}${over ? ' — OVER LIMIT, trim before posting' : ''}
      </p>
      <div style="white-space:pre-wrap;font:400 15px/1.55 system-ui,sans-serif;color:#111;
                  background:#f6f7f9;border:1px solid #e3e5e9;border-radius:8px;padding:16px">${escapeHtml(text)}</div>`;
  }).join('');

  return `<div style="max-width:640px;margin:0 auto;padding:24px">
    <p style="font:400 12px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#777;margin:0">
      Social copy ready
    </p>
    <h1 style="font:600 22px/1.3 system-ui,sans-serif;color:#111;margin:8px 0 4px">${escapeHtml(post.title || 'Untitled')}</h1>
    <p style="font:400 14px system-ui,sans-serif;margin:0"><a href="${escapeHtml(url)}" style="color:#0a58ca">${escapeHtml(url)}</a></p>
    ${blocks}
    <p style="font:400 12px system-ui,sans-serif;color:#888;margin:32px 0 0;border-top:1px solid #e3e5e9;padding-top:16px">
      Generated for a newly published Ask Linc post. Character counts are measured the way each platform measures them —
      X counts every link as 23 characters, Bluesky counts the whole URL.
    </p>
  </div>`;
}

function printCopy(post: GhostPostRecord, url: string, copy: SocialCopy): void {
  console.log(`\n  ${post.title}\n  ${url}`);
  for (const spec of PLATFORMS) {
    const count = measure(spec.key, copy[spec.key]);
    const flag = count > spec.limit ? `  !! OVER LIMIT (${count}/${spec.limit})` : ` (${count} chars)`;
    console.log(`\n  --- ${spec.label}${flag} ---`);
    console.log(copy[spec.key].split('\n').map((line) => `  ${line}`).join('\n'));
  }
}

function parseArgs(argv: string[]): CliOptions {
  const sinceArg = argv.find((a) => a.startsWith('--since-days='))?.split('=')[1];
  const sinceDays = sinceArg ? Number(sinceArg) : 7;
  if (!Number.isInteger(sinceDays) || sinceDays < 1) {
    throw new Error(`--since-days must be a positive integer, got "${sinceArg}"`);
  }

  const limitArg = argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limit = limitArg ? Number(limitArg) : null;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error(`--limit must be a positive integer, got "${limitArg}"`);
  }

  return { dryRun: argv.includes('--dry-run'), sinceDays, limit };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const { GHOST_ADMIN_API_URL, GHOST_ADMIN_API_KEY, ANTHROPIC_API_KEY } = process.env;
  if (!GHOST_ADMIN_API_URL || !GHOST_ADMIN_API_KEY) {
    throw new Error('GHOST_ADMIN_API_URL and GHOST_ADMIN_API_KEY must be set');
  }
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY must be set — the copy is model-written');

  const recipient = process.env.SOCIAL_EMAIL_TO;
  if (!options.dryRun && (!process.env.RESEND_API_KEY || !recipient)) {
    throw new Error('RESEND_API_KEY and SOCIAL_EMAIL_TO must be set (or pass --dry-run)');
  }

  const ghost = new GhostAdmin(GHOST_ADMIN_API_URL.replace(/\/$/, ''), GHOST_ADMIN_API_KEY);
  await ghost.calibrateClock();

  // Posts older than the window are treated as already handled; without it a
  // first run would email the whole back catalogue. Ghost applies the bound so
  // the job stays the same size as the blog grows.
  const cutoff = new Date(Date.now() - options.sinceDays * 24 * 60 * 60 * 1000);
  const recent = await ghost.publishedPosts(cutoff);
  const pending = recent.filter((post) => !hasTag(post, SENT_TAG));

  console.log(
    `${recent.length} post(s) published in the last ${options.sinceDays} day(s); ` +
    `${pending.length} awaiting social copy\n`,
  );
  if (pending.length === 0) return;

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const resend = options.dryRun ? null : new Resend(process.env.RESEND_API_KEY);

  let sent = 0;
  let failed = 0;

  for (const post of pending) {
    if (options.limit !== null && sent >= options.limit) {
      console.log(`Reached --limit=${options.limit}, stopping.`);
      break;
    }

    const url = `${CANONICAL_ORIGIN}/blog/${post.slug}`;
    try {
      console.log(`  drafting: ${post.title}`);
      const copy = await draftCopy(client, post, url);

      if (options.dryRun || !resend) {
        printCopy(post, url, copy);
        // Count toward --limit the same way a real send does; otherwise
        // dry-run would draft every pending post regardless of --limit.
        sent++;
        continue;
      }

      const { error } = await resend.emails.send({
        from: EMAIL_FROM,
        to: recipient as string,
        subject: `Social copy: ${post.title}`,
        html: emailHtml(post, url, copy),
      }, {
        // If the email is accepted but the Ghost tag write below fails, the
        // post stays untagged and the next run retries it. A key stable per
        // post makes Resend return the original send instead of delivering a
        // second copy — but only when the body matches. A regenerated draft
        // yields `invalid_idempotent_request` instead; that still means the
        // first email went out, so we treat it as delivered and tag below.
        idempotencyKey: `social-${post.id}`,
      });
      if (error) {
        if (error.name !== 'invalid_idempotent_request') {
          throw new Error(`Resend rejected the email: ${error.message}`);
        }
        console.log(
          `  ! Resend already accepted this post (idempotency key reuse with a new draft); tagging without re-sending`,
        );
      }

      // Tagged only after the email is away, so a send failure is retried on
      // the next run rather than being silently dropped.
      try {
        await ghost.addTags(post, [SENT_TAG]);
      } catch (error) {
        // The email has already gone out. Resend's idempotency key covers the
        // retry for 24 hours; past that a genuine duplicate is possible, so say
        // plainly what to do rather than leaving it to be rediscovered.
        throw new Error(
          `email sent but tagging failed: ${(error as Error).message}\n` +
          `    Add the tag "${SENT_TAG}" to this post in Ghost within 24 hours, ` +
          'or the next run may email it a second time.',
        );
      }

      sent++;
      console.log(`  + emailed and marked: ${post.title}`);
    } catch (error) {
      failed++;
      console.error(`  x ${post.title}: ${(error as Error).message}`);
    }
  }

  if (options.dryRun) {
    console.log('\nDry run — nothing emailed, nothing tagged in Ghost.');
  } else {
    console.log(`\nEmailed ${sent}, failed ${failed}.`);
  }
  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\ngenerate-social-posts failed: ${error.message}`);
    process.exit(1);
  });
}

export { measure, overLimit, missingUrl, findProblems, PLATFORMS, readCopy, emailHtml, parseArgs, SENT_TAG };
