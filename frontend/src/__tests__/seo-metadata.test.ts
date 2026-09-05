import { processGhostHtml } from '@/lib/ghost';
import { buildMarketingMetadata } from '@/lib/seo';

describe('SEO metadata', () => {
  it('builds canonical and social metadata for a marketing page', () => {
    const metadata = buildMarketingMetadata({
      title: 'A Useful Page | Ask Linc',
      description: 'A page description written for people deciding whether this result is useful.',
      path: '/useful-page',
      imageAlt: 'Useful Ask Linc page',
    });

    expect(metadata).toMatchObject({
      alternates: { canonical: 'https://asklinc.com/useful-page' },
      openGraph: {
        title: 'A Useful Page | Ask Linc',
        url: 'https://asklinc.com/useful-page',
        images: [{ url: 'https://asklinc.com/og-image.jpg', alt: 'Useful Ask Linc page' }],
      },
      twitter: {
        card: 'summary_large_image',
        images: ['https://asklinc.com/og-image.jpg'],
      },
      robots: { index: true, follow: true },
    });
  });

  it('wraps tables so a wide one scrolls instead of stretching the article', () => {
    const processed = processGhostHtml('<p>Intro</p><table><tr><td>Ask Linc</td></tr></table><p>Outro</p>');

    expect(processed).toContain('<div class="ghost-table-wrap"><table>');
    expect(processed).toContain('</table></div>');
    // A grid item sized by its widest child drags the whole column past the
    // viewport, so the wrapper has to be there for every table.
    expect(processed.match(/ghost-table-wrap/g)).toHaveLength(1);
    expect(processed).toContain('<p>Intro</p>');
  });

  it('wraps tables that carry attributes', () => {
    const processed = processGhostHtml('<table class="kg-table" data-x="1"><tr><td>a</td></tr></table>');

    // kg- is rewritten to ghost-kg- earlier in the same chain.
    expect(processed).toContain('<div class="ghost-table-wrap"><table class="ghost-kg-table" data-x="1">');
    expect(processed).toContain('</table></div>');
  });

  it('keeps rendered Ghost links on clean canonical URLs', () => {
    const html = [
      '<a href="https://blog.asklinc.com/first-post/">Legacy</a>',
      '<a href="https://asklinc.com/blog/second-post?ref=blog.asklinc.com">Current</a>',
      '<a href="https://asklinc.com/?utm_source=ghost&amp;utm_medium=blog">Campaign</a>',
    ].join('');

    const processed = processGhostHtml(html);

    expect(processed).toContain('href="/blog/first-post/"');
    expect(processed).toContain('href="https://asklinc.com/blog/second-post"');
    expect(processed).not.toContain('?ref=blog.asklinc.com');
    expect(processed).toContain('utm_source=ghost');
  });
});
