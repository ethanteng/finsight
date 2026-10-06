import { processGhostHtml } from '@/lib/ghost';
import { buildContentSecurityPolicy } from '@/lib/csp';

const STORAGE = 'https://storage.ghost.io/c/52/0a/520a2e00-9a1f-4bb6-9b0a-dbfb8030c46f/content/media/2026/10';

/*
 * A video card as Ghost's Content API renders it (SVG paths trimmed). This is
 * the "loop" setting: Ghost adds autoplay and muted, and hides its player.
 */
const LOOPING_CARD = `<figure class="kg-card kg-video-card kg-width-regular" data-kg-thumbnail="${STORAGE}/Cash-Flow-Demo_thumb.jpg" data-kg-custom-thumbnail="">
  <div class="kg-video-container">
    <video src="${STORAGE}/Cash-Flow-Demo.mp4" poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" width="1920" height="1080" loop="" autoplay="" muted="" playsinline="" preload="metadata" style="aspect-ratio: 1920 / 1080; background: transparent url('${STORAGE}/Cash-Flow-Demo_thumb.jpg') 50% 50% / cover no-repeat;"></video>
    <div class="kg-video-overlay">
      <button class="kg-video-large-play-icon" aria-label="Play video"><svg viewBox="0 0 24 24"><path d="M0 0"></path></svg></button>
    </div>
    <div class="kg-video-player-container kg-video-hide">
      <div class="kg-video-player">
        <button class="kg-video-play-icon" aria-label="Play video"><svg viewBox="0 0 24 24"><path d="M0 0"></path></svg></button>
        <button class="kg-video-pause-icon kg-video-hide" aria-label="Pause video"><svg viewBox="0 0 24 24"><rect x="3" y="1"></rect></svg></button>
        <span class="kg-video-current-time">0:00</span>
        <div class="kg-video-time">/<span class="kg-video-duration">0:47</span></div>
        <input type="range" class="kg-video-seek-slider" max="100" value="0">
        <button class="kg-video-playback-rate" aria-label="Adjust playback speed">1&#215;</button>
        <button class="kg-video-unmute-icon" aria-label="Unmute"><svg viewBox="0 0 24 24"><path d="M0 0"></path></svg></button>
        <button class="kg-video-mute-icon kg-video-hide" aria-label="Mute"><svg viewBox="0 0 24 24"><path d="M0 0"></path></svg></button>
        <input type="range" class="kg-video-volume-slider" max="100" value="100">
      </div>
    </div>
  </div>
</figure>`;

function renderArticle(html: string): HTMLElement {
  const article = document.createElement('article');
  article.innerHTML = processGhostHtml(html);
  return article;
}

describe('Ghost video cards', () => {
  it('keeps the video on Ghost storage instead of pointing it at a blog page', () => {
    const processed = processGhostHtml(LOOPING_CARD);

    expect(processed).not.toContain('/blog/c/');
    const video = renderArticle(LOOPING_CARD).querySelector('video')!;
    expect(video.getAttribute('src')).toBe(`${STORAGE}/Cash-Flow-Demo.mp4`);
    expect(video.getAttribute('poster')).toBe(`${STORAGE}/Cash-Flow-Demo_thumb.jpg`);
  });

  it("drops Ghost's script-driven player, which nothing on the page runs", () => {
    const article = renderArticle(LOOPING_CARD);

    expect(article.querySelectorAll('button, input, svg')).toHaveLength(0);
    expect(article.textContent).not.toContain('0:47');
    expect(article.textContent).not.toContain('1×');
    expect(article.querySelectorAll('figure > video')).toHaveLength(1);
  });

  it('plays a looping video the way Ghost does: muted, on its own, without controls', () => {
    const video = renderArticle(LOOPING_CARD).querySelector('video')!;

    for (const attribute of ['loop', 'autoplay', 'muted', 'playsinline']) {
      expect([attribute, video.hasAttribute(attribute)]).toEqual([attribute, true]);
    }
    expect(video.hasAttribute('controls')).toBe(false);
    expect(video.getAttribute('width')).toBe('1920');
    expect(video.getAttribute('height')).toBe('1080');
  });

  it('gives any other video the browser controls, its custom thumbnail, and its caption', () => {
    const card = LOOPING_CARD
      .replace(' loop="" autoplay="" muted=""', '')
      .replace('kg-width-regular"', 'kg-width-regular kg-card-hascaption"')
      .replace('data-kg-custom-thumbnail=""', `data-kg-custom-thumbnail="${STORAGE}/custom.jpg"`)
      .replace('</div>\n</figure>', '</div>\n<figcaption><p><span>How the forecast moves</span></p></figcaption></figure>');

    const article = renderArticle(card);
    const video = article.querySelector('video')!;

    expect(video.hasAttribute('controls')).toBe(true);
    expect(video.hasAttribute('autoplay')).toBe(false);
    expect(video.hasAttribute('loop')).toBe(false);
    expect(video.getAttribute('preload')).toBe('metadata');
    expect(video.getAttribute('poster')).toBe(`${STORAGE}/custom.jpg`);
    expect(article.querySelector('figcaption')?.textContent).toBe('How the forecast moves');
    expect(article.querySelector('figcaption')?.className).toBe('ghost-caption');
  });

  it('leaves the rest of the article alone', () => {
    const processed = processGhostHtml(`<p>Before</p>${LOOPING_CARD}<p>After</p>`);

    expect(processed.startsWith('<p>Before</p><figure class="ghost-kg-card kg-video-card kg-width-regular">')).toBe(true);
    expect(processed.endsWith('</figure><p>After</p>')).toBe(true);
  });
});

describe('Ghost file URLs', () => {
  it('rewrites links to posts but not uploaded files', () => {
    const processed = processGhostHtml([
      '<img src="https://storage.ghost.io/c/52/0a/x/content/images/2026/10/chart.png">',
      '<img src="https://blog.asklinc.com/content/images/2025/01/chart.png">',
      '<a href="https://ask-linc-blog.ghost.io/content/files/2026/10/guide.pdf">Guide</a>',
      '<a href="https://ask-linc-blog.ghost.io/first-post/">Post</a>',
      '<a href="https://blog.asklinc.com/second-post/">Post</a>',
    ].join(''));

    expect(processed).toContain('src="https://storage.ghost.io/c/52/0a/x/content/images/2026/10/chart.png"');
    expect(processed).toContain('src="https://blog.asklinc.com/content/images/2025/01/chart.png"');
    expect(processed).toContain('href="https://ask-linc-blog.ghost.io/content/files/2026/10/guide.pdf"');
    expect(processed).toContain('href="/blog/first-post"');
    expect(processed).toContain('href="/blog/second-post"');
  });

  it('lets the site policy load video from where Ghost stores it', () => {
    for (const isDevelopment of [false, true]) {
      const mediaSrc = buildContentSecurityPolicy({ isDevelopment })
        .split('; ')
        .find((directive) => directive.startsWith('media-src '))!
        .split(' ');

      expect(mediaSrc).toEqual(["media-src", "'self'", 'https://*.ghost.io', 'https://blog.asklinc.com']);
    }
  });
});
