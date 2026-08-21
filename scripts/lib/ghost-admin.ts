/**
 * Ghost Admin API client shared by the blog scripts.
 *
 * Kept in one place because the authentication is easy to get subtly wrong:
 * tokens must carry a clock-skew-corrected `iat`, and `jsonwebtoken`'s
 * `noTimestamp` option silently deletes that claim even when it is supplied.
 */

import * as jwt from 'jsonwebtoken';

const GHOST_API_VERSION = 'v5.0';

export interface GhostTag {
  name?: string;
  slug?: string;
}

export interface GhostPostRecord {
  id: string;
  title?: string;
  slug?: string;
  status?: string;
  updated_at?: string;
  published_at?: string;
  excerpt?: string;
  custom_excerpt?: string;
  plaintext?: string;
  tags?: GhostTag[];
}

/** True when `post` carries the given internal tag, in either stored form. */
export function hasTag(post: GhostPostRecord, name: string): boolean {
  const bare = name.replace(/^#/, '').toLowerCase();
  return (post.tags || []).some((tag) => {
    const value = (tag.name || tag.slug || '').toLowerCase();
    return value === `#${bare}` || value === `hash-${bare}`;
  });
}

export class GhostAdmin {
  private skewSeconds = 0;

  constructor(private readonly baseUrl: string, private readonly adminKey: string) {}

  /**
   * Ghost rejects tokens whose `iat` sits in its future, so a machine clock
   * running behind the Ghost server produces tokens that are invalid on
   * arrival. Measure the offset once from a server response and apply it to
   * every token minted afterwards.
   */
  async calibrateClock(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/ghost/api/admin/site/`);
    const serverDate = res.headers.get('date');
    if (!serverDate) {
      console.warn('  ! Ghost sent no Date header; assuming no clock skew');
      return;
    }
    this.skewSeconds = Math.floor(new Date(serverDate).getTime() / 1000) - Math.floor(Date.now() / 1000);
    if (Math.abs(this.skewSeconds) > 2) {
      console.log(`  clock skew vs Ghost: ${this.skewSeconds}s (compensating)`);
    }
  }

  private token(): string {
    const [id, secret] = this.adminKey.split(':');
    if (!id || !secret) {
      throw new Error('GHOST_ADMIN_API_KEY must be in `id:secret` form (copy it from the Ghost integration page)');
    }
    const now = Math.floor(Date.now() / 1000) + this.skewSeconds;
    // `noTimestamp` must not be set here: jsonwebtoken implements it by
    // deleting `iat` from the payload even when the claim was supplied
    // explicitly, which would drop the skew-corrected timestamp Ghost requires
    // and make every authenticated request fail.
    return jwt.sign(
      { iat: now, exp: now + 300, aud: '/admin/' },
      Buffer.from(secret, 'hex'),
      { algorithm: 'HS256', keyid: id },
    );
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}/ghost/api/admin${path}`, {
      method,
      headers: {
        Authorization: `Ghost ${this.token()}`,
        'Content-Type': 'application/json',
        'Accept-Version': GHOST_API_VERSION,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Ghost ${method} ${path} failed (${res.status}): ${text.slice(0, 400)}`);
    }
    return text ? JSON.parse(text) as T : ({} as T);
  }

  /** Every post with its tags, following pagination. */
  async allPosts(): Promise<GhostPostRecord[]> {
    const collected: GhostPostRecord[] = [];
    for (let page = 1; ; page++) {
      const res = await this.request<{ posts: GhostPostRecord[]; meta?: { pagination?: { pages: number } } }>(
        'GET',
        `/posts/?limit=100&page=${page}&fields=id,title,slug,status&include=tags`,
      );
      collected.push(...(res.posts || []));
      if (page >= (res.meta?.pagination?.pages ?? 1)) return collected;
    }
  }

  /**
   * The blog's public tag vocabulary. Internal tags (name prefixed with `#`)
   * are provenance markers, not categories, so they are excluded.
   */
  async allTags(): Promise<string[]> {
    const res = await this.request<{ tags: Array<{ name?: string; visibility?: string }> }>(
      'GET',
      '/tags/?limit=all&fields=name,visibility',
    );
    return (res.tags || [])
      .filter((tag) => tag.name && tag.visibility !== 'internal' && !tag.name.startsWith('#'))
      .map((tag) => tag.name as string);
  }

  /**
   * Published posts with their tags and plaintext body, newest first.
   */
  async publishedPosts(): Promise<GhostPostRecord[]> {
    const collected: GhostPostRecord[] = [];
    for (let page = 1; ; page++) {
      const res = await this.request<{ posts: GhostPostRecord[]; meta?: { pagination?: { pages: number } } }>(
        'GET',
        `/posts/?limit=100&page=${page}&filter=status:published&include=tags&formats=plaintext&order=published_at%20DESC`,
      );
      collected.push(...(res.posts || []));
      if (page >= (res.meta?.pagination?.pages ?? 1)) return collected;
    }
  }

  /**
   * Append tags to a post. Ghost replaces the whole tag set on write, so the
   * existing tags — internal ones included — are sent back alongside the new
   * one or they would be dropped.
   */
  async addTags(post: GhostPostRecord, names: string[]): Promise<void> {
    const existing = (post.tags || [])
      .map((tag) => tag.name || tag.slug)
      .filter((name): name is string => Boolean(name));

    await this.request('PUT', `/posts/${post.id}/`, {
      posts: [{
        tags: [...new Set([...existing, ...names])].map((name) => ({ name })),
        updated_at: post.updated_at,
      }],
    });
  }

  /**
   * Remove a post that could not be completed, so its feed item is retried on
   * the next run rather than being skipped forever by its dedupe tag.
   */
  async deletePost(id: string, slug: string): Promise<void> {
    try {
      await this.request('DELETE', `/posts/${id}/`);
    } catch (error) {
      // Surfaced rather than swallowed: the post is now both broken and
      // permanently skipped, which needs a person.
      console.error(
        `  ! could not roll back partial post "${slug}" (${id}): ${(error as Error).message}\n` +
        '    Delete it in Ghost by hand, or the next run will skip this item.',
      );
    }
  }

  /**
   * Mirror a remote image into Ghost's own storage. Soro serves featured images
   * from a Supabase bucket; copying them means the OpenGraph and schema.org
   * image URLs stay valid even if Soro rotates or deletes the original.
   */
  async uploadImage(sourceUrl: string, slug: string): Promise<string | null> {
    try {
      const res = await fetch(sourceUrl);
      if (!res.ok) throw new Error(`source responded ${res.status}`);

      const contentType = res.headers.get('content-type') || 'image/webp';
      const extension = (contentType.split('/')[1] || 'webp').split(';')[0];
      const form = new FormData();
      form.append('file', new Blob([await res.arrayBuffer()], { type: contentType }), `${slug}.${extension}`);
      form.append('purpose', 'image');

      const upload = await fetch(`${this.baseUrl}/ghost/api/admin/images/upload/`, {
        method: 'POST',
        headers: { Authorization: `Ghost ${this.token()}`, 'Accept-Version': GHOST_API_VERSION },
        body: form,
      });
      if (!upload.ok) throw new Error(`Ghost responded ${upload.status}: ${(await upload.text()).slice(0, 200)}`);

      return (await upload.json() as { images: Array<{ url: string }> }).images[0].url;
    } catch (error) {
      // A missing hero image costs social preview quality, not the post.
      console.warn(`  ! image upload failed, keeping the Soro URL: ${(error as Error).message}`);
      return null;
    }
  }
}
