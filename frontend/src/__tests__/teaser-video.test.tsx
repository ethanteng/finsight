/**
 * @jest-environment node
 *
 * The route handlers run on the server, and `next/server` is built on the web
 * Request and Response, which jsdom does not provide.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { GET as captionsGET } from '@/app/video/captions/route';
import { GET as embedGET } from '@/app/video/embed/route';
import { TeaserVideo } from '@/components/marketing/TeaserVideo';
import { CSP_HEADER_SOURCE, buildContentSecurityPolicy } from '@/lib/csp';
import { DEFAULT_VIDEO, videoId } from '@/lib/teaser-video';

const CONNECTION = 'https://global-config.vercel.com/ecfg_test?token=read-token';
const OTHER = 'dQw4w9WgXcQ';
const VARIABLES = ['GLOBAL_CONFIG', 'EDGE_CONFIG'] as const;

const MP4 = 'https://store.public.blob.vercel-storage.com/teaser-2026-09.mp4';
const POSTER = 'https://store.public.blob.vercel-storage.com/teaser-2026-09.jpg';
const CAPTIONS = 'https://store.public.blob.vercel-storage.com/teaser-2026-09.vtt';
const VTT = 'WEBVTT\n\n00:00.000 --> 00:02.000\nTell Linc what you’re trying to figure out.\n';

type Answer = unknown | ((to: string) => Response);

/**
 * Calls `handler` with `variable` (GLOBAL_CONFIG unless given) set to
 * `connection` and every fetch answered by `answer` — a function from the
 * address to a Response, or a value to send as JSON. Returns the response and
 * every address fetched.
 */
async function call(
  handler: () => Promise<Response>,
  {
    connection,
    answer,
    variable = 'GLOBAL_CONFIG',
  }: { connection?: string; answer?: Answer; variable?: (typeof VARIABLES)[number] } = {},
) {
  const asked: { to: string; init?: RequestInit }[] = [];
  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (to, init) => {
    asked.push({ to: String(to), init });
    if (typeof answer === 'function') return answer(String(to));
    return new Response(JSON.stringify(answer), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const original = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of VARIABLES) delete process.env[name];
  if (connection !== undefined) process.env[variable] = connection;
  try {
    return { response: await handler(), asked };
  } finally {
    fetchSpy.mockRestore();
    for (const name of VARIABLES) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
}

const visit = (options?: Parameters<typeof call>[1]) => call(embedGET, options);
const captions = (options?: Parameters<typeof call>[1]) => call(captionsGET, options);

/** Global Config answers with `item`; any other address answers with `files[address]`, or 404. */
function serving(item: unknown, files: Record<string, string> = {}) {
  return (to: string) => {
    if (to.includes('global-config.vercel.com')) return Response.json(item);
    return to in files ? new Response(files[to]) : new Response('', { status: 404 });
  };
}

const embedOf = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0`;

describe('/video/embed with a YouTube video', () => {
  it('sends the player to the configured video', async () => {
    const { response } = await visit({ connection: CONNECTION, answer: OTHER });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(embedOf(OTHER));
  });

  it("asks Global Config for the video item with the connection's token", async () => {
    const { asked } = await visit({ connection: CONNECTION, answer: OTHER });

    expect(asked).toHaveLength(1);
    expect(asked[0].to).toBe('https://global-config.vercel.com/ecfg_test/item/video');
    expect((asked[0].init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer read-token',
    );
    expect(asked[0].init?.cache).toBe('no-store');
  });

  it('still works with a store connected as EDGE_CONFIG, before the rename', async () => {
    const connection = 'https://edge-config.vercel.com/ecfg_old?token=old-token';
    const { response, asked } = await visit({ connection, answer: OTHER, variable: 'EDGE_CONFIG' });

    expect(response.headers.get('location')).toBe(embedOf(OTHER));
    expect(asked[0].to).toBe('https://edge-config.vercel.com/ecfg_old/item/video');
  });

  it('plays the default video without a Global Config, and fetches nothing', async () => {
    const { response, asked } = await visit();

    expect(response.headers.get('location')).toBe(embedOf(DEFAULT_VIDEO));
    expect(asked).toHaveLength(0);
  });

  /* A typo in the dashboard, or Global Config being down, must not empty the player. */
  it('falls back to the default for anything short of a readable video', async () => {
    const failures: Record<string, Answer> = {
      'no video item': () => new Response('', { status: 404 }),
      'not a YouTube video or mp4': 'https://vimeo.com/123456',
      'a typo': 'GRBboPyuL5',
      'an object without an mp4': { id: OTHER },
      'Global Config unreachable': () => {
        throw new TypeError('fetch failed');
      },
      'Global Config answering nonsense': () => new Response('<html>', { status: 200 }),
    };
    for (const [name, answer] of Object.entries(failures)) {
      const { response } = await visit({ connection: CONNECTION, answer });
      expect([name, response.headers.get('location')]).toEqual([name, embedOf(DEFAULT_VIDEO)]);
    }

    const { response } = await visit({ connection: 'not a url', answer: OTHER });
    expect(response.headers.get('location')).toBe(embedOf(DEFAULT_VIDEO));
  });

  it('lets the CDN hold the answer briefly and browsers not at all', async () => {
    const { response } = await visit({ connection: CONNECTION, answer: OTHER });
    const cacheControl = response.headers.get('cache-control');

    expect(cacheControl).toMatch(/max-age=0/);
    expect(cacheControl).toMatch(/s-maxage=60/);
    expect(response.headers.get('referrer-policy')).toBeNull();
  });
});

describe('/video/embed with a video file', () => {
  it('serves our own player page for an mp4 link', async () => {
    const { response } = await visit({ connection: CONNECTION, answer: serving(MP4) });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/html/);
    expect(response.headers.get('cache-control')).toMatch(/s-maxage=60/);
    expect(body).toContain(`<source src="${MP4}" type="video/mp4">`);
    expect(body).toContain('<video controls playsinline preload="metadata">');
    expect(body).not.toMatch(/<track|poster=/);
  });

  it('holds the download until Play with a poster, and takes captions from this site', async () => {
    const item = { mp4: MP4, poster: POSTER, captions: CAPTIONS };
    const { response } = await visit({ connection: CONNECTION, answer: serving(item) });
    const body = await response.text();

    expect(body).toContain(`preload="none" poster="${POSTER}"`);
    expect(body).toContain(
      '<track kind="captions" src="/video/captions" srclang="en" label="English">',
    );
    expect(body).not.toContain('crossorigin');
  });

  it('loads nothing but its media, runs no script, and can only be framed here', async () => {
    const { response } = await visit({ connection: CONNECTION, answer: serving(MP4) });
    const policy = response.headers.get('content-security-policy')!;

    expect(policy).toMatch(/default-src 'none'/);
    expect(policy).toMatch(/media-src https: 'self'/);
    expect(policy).toMatch(/frame-ancestors 'self'/);
    expect(policy).not.toContain('script-src');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).not.toContain('<script');
  });

  it("falls back to the default for a file that isn't a plain https address", async () => {
    for (const value of [
      'http://store.example/teaser.mp4',
      'javascript:alert(1)//.mp4',
      'https://user:pass@store.example/teaser.mp4',
      'https://store.example/teaser.mov',
      { mp4: 'http://store.example/teaser.mp4' },
      { poster: POSTER },
      [MP4],
    ]) {
      const { response } = await visit({ connection: CONNECTION, answer: serving(value) });
      expect([JSON.stringify(value), response.status, response.headers.get('location')]).toEqual([
        JSON.stringify(value),
        302,
        embedOf(DEFAULT_VIDEO),
      ]);
    }
  });

  it("leaves out an extra that isn't https, and still plays the video", async () => {
    const item = { mp4: MP4, poster: 'http://store.example/poster.jpg', captions: 'not a link' };
    const { response } = await visit({ connection: CONNECTION, answer: serving(item) });

    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/poster=|<track/);
  });

  it('lets nothing in a configured address break out of its attribute', async () => {
    const item = {
      mp4: `${MP4}?a=1&b="><script>alert(1)</script>`,
      poster: `${POSTER}?"onerror="x`,
    };
    const { response } = await visit({ connection: CONNECTION, answer: serving(item) });
    const body = await response.text();

    expect(body).not.toMatch(/<script|"onerror/);
    expect(body).toContain('?a=1&amp;b=%22%3E%3Cscript%3E');
  });
});

describe('/video/captions', () => {
  it("relays the file host's captions as WebVTT", async () => {
    const item = { mp4: MP4, captions: CAPTIONS };
    const { response, asked } = await captions({
      connection: CONNECTION,
      answer: serving(item, { [CAPTIONS]: VTT }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/vtt; charset=utf-8');
    expect(await response.text()).toBe(VTT);
    expect(asked[1].to).toBe(CAPTIONS);

    const withBom = await captions({
      connection: CONNECTION,
      answer: serving(item, { [CAPTIONS]: `﻿${VTT}` }),
    });
    expect(withBom.response.status).toBe(200);
  });

  it("is a 404 when there are no captions, or they aren't WebVTT", async () => {
    const cases: Record<string, Answer> = {
      'a YouTube video': serving(OTHER),
      'a file with no captions': serving(MP4),
      'captions missing from the host': serving({ mp4: MP4, captions: CAPTIONS }),
      'an error page instead': serving(
        { mp4: MP4, captions: CAPTIONS },
        { [CAPTIONS]: '<html>Not found</html>' },
      ),
    };
    for (const [name, answer] of Object.entries(cases)) {
      const { response } = await captions({ connection: CONNECTION, answer });
      expect([name, response.status]).toEqual([name, 404]);
    }
  });
});

describe('videoId', () => {
  it('takes a pasted link as readily as an id', () => {
    for (const pasted of [
      OTHER,
      `  ${OTHER}\n`,
      `https://www.youtube.com/watch?v=${OTHER}&t=42s`,
      `https://m.youtube.com/watch?v=${OTHER}`,
      `https://youtu.be/${OTHER}?si=share`,
      `https://www.youtube.com/embed/${OTHER}`,
      `https://www.youtube-nocookie.com/embed/${OTHER}?rel=0`,
      `https://www.youtube.com/shorts/${OTHER}`,
      `https://www.youtube.com/live/${OTHER}`,
    ]) {
      expect([pasted, videoId(pasted)]).toEqual([pasted, OTHER]);
    }
  });

  /* The redirect goes wherever this says, so only a YouTube id may come out. */
  it('lets nothing but a YouTube video id through', () => {
    for (const value of [
      '',
      'https://www.youtube.com/@AskLinc',
      `https://evil.example/watch?v=${OTHER}`,
      `https://youtube.com.evil.example/watch?v=${OTHER}`,
      `https://www.youtube.com/watch?v=${OTHER}/../x`,
      `${OTHER}"><script>`,
      null,
      42,
    ]) {
      expect([String(value), videoId(value)]).toEqual([String(value), null]);
    }
  });
});

describe('TeaserVideo', () => {
  it('names no video itself; the player loads /video/embed', () => {
    const markup = renderToStaticMarkup(<TeaserVideo />);

    expect(markup).toContain('src="/video/embed"');
    expect(markup).not.toContain('youtube');
    expect(markup).toContain('referrerPolicy="strict-origin-when-cross-origin"');
  });

  /* The frame starts on our own origin and, for YouTube, lands on its host. */
  it('is allowed through frame-src at both ends of the redirect', () => {
    for (const isDevelopment of [false, true]) {
      const frameSrc = buildContentSecurityPolicy({ isDevelopment })
        .split('; ')
        .find((directive) => directive.startsWith('frame-src '))!
        .split(' ');

      expect(frameSrc).toContain("'self'");
      expect(frameSrc).toContain('https://www.youtube-nocookie.com');
    }
  });

  /*
   * The site policy's media and image sources would refuse a file host, so the
   * player page and captions carry their own — and nothing else goes without.
   * Matched the way Next matches a headers() source, strict and not.
   */
  it('keeps the site policy off the player page and captions only', () => {
    const { pathToRegexp } = jest.requireActual<{
      pathToRegexp: (path: string, keys: unknown[], options: object) => RegExp;
    }>('next/dist/compiled/path-to-regexp');

    for (const strict of [true, false]) {
      const covered = pathToRegexp(CSP_HEADER_SOURCE, [], { delimiter: '/', sensitive: false, strict });
      for (const path of ['/video/embed', '/video/captions']) {
        expect([path, covered.test(path)]).toEqual([path, false]);
      }
      for (const path of ['/', '/features', '/app/finances', '/video', '/video/other', '/video/embed/x']) {
        expect([path, covered.test(path)]).toEqual([path, true]);
      }
    }
  });
});
