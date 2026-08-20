import { createEmailHtml, getBaseUrl, getEmailAssetBaseUrl } from '../../email/templates';

const ENV_KEYS = ['NODE_ENV', 'FRONTEND_URL', 'EMAIL_ASSET_BASE_URL'] as const;

describe('email template branding URLs', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    ENV_KEYS.forEach(key => {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    ENV_KEYS.forEach(key => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  });

  describe('getEmailAssetBaseUrl', () => {
    it('falls back to the public site when nothing is configured', () => {
      expect(getEmailAssetBaseUrl()).toBe('https://asklinc.com');
    });

    it('ignores a local FRONTEND_URL', () => {
      process.env.NODE_ENV = 'development';
      process.env.FRONTEND_URL = 'http://localhost:3001';
      expect(getEmailAssetBaseUrl()).toBe('https://asklinc.com');
    });

    it('uses FRONTEND_URL when it points at a public host', () => {
      process.env.NODE_ENV = 'production';
      process.env.FRONTEND_URL = 'https://asklinc.com';
      expect(getEmailAssetBaseUrl()).toBe('https://asklinc.com');
    });

    it('prefers EMAIL_ASSET_BASE_URL and strips trailing slashes', () => {
      process.env.FRONTEND_URL = 'https://asklinc.com';
      process.env.EMAIL_ASSET_BASE_URL = 'https://assets.asklinc.com/';
      expect(getEmailAssetBaseUrl()).toBe('https://assets.asklinc.com');
    });

    it('ignores a local EMAIL_ASSET_BASE_URL and falls through to FRONTEND_URL', () => {
      process.env.EMAIL_ASSET_BASE_URL = 'http://127.0.0.1:3001';
      process.env.FRONTEND_URL = 'https://staging.asklinc.com';
      expect(getEmailAssetBaseUrl()).toBe('https://staging.asklinc.com');
    });

    it.each([
      ['private IPv4', 'http://192.168.1.20:3001'],
      ['private IPv4 (10/8)', 'http://10.0.0.5:3001'],
      ['private IPv4 (172.16/12)', 'http://172.20.1.1:3001'],
      ['link-local IPv4', 'http://169.254.10.10:3001'],
      ['carrier-grade NAT IPv4', 'http://100.80.0.1:3001'],
      ['docker host alias', 'http://host.docker.internal:3001'],
      ['mDNS hostname', 'http://ethans-macbook.local:3001'],
      ['IPv6 loopback', 'http://[::1]:3001'],
      ['IPv6 unique-local', 'http://[fd00::1]:3001'],
      ['scheme-less hostname', 'asklinc.com'],
      ['bare path', '/assets'],
      ['non-http scheme', 'file:///tmp/assets'],
    ])('rejects a %s and falls back to the public site', (_label, value) => {
      process.env.EMAIL_ASSET_BASE_URL = value;
      expect(getEmailAssetBaseUrl()).toBe('https://asklinc.com');
    });

    it('accepts a public host that merely looks private-ish', () => {
      process.env.EMAIL_ASSET_BASE_URL = 'https://172.15.0.1';
      expect(getEmailAssetBaseUrl()).toBe('https://172.15.0.1');
    });

    it('keeps a path prefix on the asset host', () => {
      process.env.EMAIL_ASSET_BASE_URL = 'https://cdn.asklinc.com/email/';
      expect(getEmailAssetBaseUrl()).toBe('https://cdn.asklinc.com/email');
    });
  });

  describe('createEmailHtml', () => {
    it('renders a publicly fetchable header banner when sending from a dev machine', () => {
      process.env.NODE_ENV = 'development';
      process.env.FRONTEND_URL = 'http://localhost:3001';

      const html = createEmailHtml('<p>hello</p>', { title: 'Test' });

      expect(html).toContain('src="https://asklinc.com/ask-linc-logo.png"');
      expect(html).not.toContain('src="http://localhost:3001/ask-linc-logo.png"');
    });

    it('keeps marketing footer links on the public site in development', () => {
      process.env.NODE_ENV = 'development';

      const html = createEmailHtml('<p>hello</p>');

      expect(html).toContain('href="https://asklinc.com/features"');
      expect(html).toContain('href="https://asklinc.com/how-we-protect-your-data"');
      expect(html).toContain('href="https://asklinc.com/contact"');
    });

    it('uses the configured asset host for the banner in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.FRONTEND_URL = 'https://asklinc.com';

      const html = createEmailHtml('<p>hello</p>');

      expect(html).toContain('src="https://asklinc.com/ask-linc-logo.png"');
    });
  });

  describe('getBaseUrl', () => {
    it('still points action links at the local frontend in development', () => {
      process.env.NODE_ENV = 'development';
      expect(getBaseUrl()).toBe('http://localhost:3001');
    });

    it('uses FRONTEND_URL in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.FRONTEND_URL = 'https://asklinc.com';
      expect(getBaseUrl()).toBe('https://asklinc.com');
    });
  });
});
