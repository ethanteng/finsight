/**
 * @jest-environment node
 *
 * The route handler runs on the server, and `next/server` is built on the web
 * Request and Response, which jsdom does not provide.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { GET } from '@/app/video/embed/route';
import { TeaserVideo } from '@/components/marketing/TeaserVideo';
import { buildContentSecurityPolicy } from '@/lib/csp';
import { DEFAULT_VIDEO, videoId } from '@/lib/teaser-video';

const CONNECTION = 'https://global-config.vercel.com/ecfg_test?token=read-token';
const OTHER = 'dQw4w9WgXcQ';
const VARIABLES = ['GLOBAL_CONFIG', 'EDGE_CONFIG'] as const;

type Answer = unknown | ((to: string) => Response);

/**
 * Asks /video/embed where to go, with `variable` (GLOBAL_CONFIG unless given)
 * set to `connection` and Global Config answering with `answer` — a function
 * from the request to a Response, or a value to send as JSON. Returns the
 * response and every request Global Config received.
 */
async function visit({
  connection,
  answer,
  variable = 'GLOBAL_CONFIG',
}: { connection?: string; answer?: Answer; variable?: (typeof VARIABLES)[number] } = {}) {
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
    return { response: await GET(), asked };
  } finally {
    fetchSpy.mockRestore();
    for (const name of VARIABLES) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
}

const embedOf = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0`;

describe('/video/embed', () => {
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
      'not a YouTube video': 'https://vimeo.com/123456',
      'a typo': 'GRBboPyuL5',
      'not a string': { id: OTHER },
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

  /* The frame starts on our own origin and lands on YouTube's; both are checked. */
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
});
