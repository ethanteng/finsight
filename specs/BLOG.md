You use Ghost only as the editor. Your Next.js site pulls posts via the **Ghost Content API** and renders them at `asklinc.com/blog/...`. This preserves SEO on your root domain and keeps your current authoring flow.

### How to implement (quick version)

1. **Create a Content API key** in Ghost
   Ghost Admin → *Settings → Integrations → Add custom integration* → copy **Content API Key** and your Ghost URL (e.g., `https://ask-linc-blog.ghost.io`).

2. **Add env vars on Vercel**

   ```
   GHOST_URL=https://ask-linc-blog.ghost.io
   GHOST_CONTENT_KEY=xxxxxxxxxxxxxxxx
   ```

3. **Install the SDK in your app**

   ```bash
   npm i @tryghost/content-api
   ```

4. **Create the blog routes**

   * `pages/blog/index.tsx` → list posts
   * `pages/blog/[slug].tsx` → individual post

   ```ts
   // lib/ghost.ts
   import GhostContentAPI from '@tryghost/content-api';
   export const ghost = new GhostContentAPI({
     url: process.env.GHOST_URL!,
     key: process.env.GHOST_CONTENT_KEY!,
     version: 'v5.0'
   });
   ```

   ```ts
   // pages/blog/index.tsx
   import { ghost } from '@/lib/ghost';
   export async function getStaticProps() {
     const posts = await ghost.posts.browse({ limit: 20, include: ['tags','authors'] });
     return { props: { posts }, revalidate: 60 }; // ISR
   }
   ```

   ```ts
   // pages/blog/[slug].tsx
   import { ghost } from '@/lib/ghost';
   export async function getStaticPaths() {
     const posts = await ghost.posts.browse({ limit: 'all', fields: ['slug'] });
     return { paths: posts.map(p => ({ params: { slug: p.slug } })), fallback: 'blocking' };
   }
   export async function getStaticProps({ params }) {
     const post = await ghost.posts.read({ slug: params.slug }, { include: ['tags','authors'] });
     return { props: { post }, revalidate: 60 };
   }
   ```

5. **Render HTML safely**
   Ghost returns HTML. Render with `dangerouslySetInnerHTML` and:

   * Rewrite **absolute links** from `https://blog.asklinc.com/...` → `/blog/...` (simple string replace).
   * Allow images from Ghost: in `next.config.js` set `images.domains = ['images.ghost.io','static.ghost.org','ask-linc-blog.ghost.io']`.

6. **SEO + Canonicals**

   * Set `<link rel="canonical" href={`[https://asklinc.com/blog/\${slug}\`}](https://asklinc.com/blog/${slug}`}) />\` on post pages.
   * Use Ghost meta (title, description, feature image) when present; otherwise fall back to your own defaults.

7. **Sitemap & RSS**

   * Generate a **site-wide sitemap** in your app that includes `/blog/*`.