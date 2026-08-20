/**
 * Shared email template module for Ask Linc.
 * Uses the same cream, deep green, and lime palette as the marketing site.
 */

/** Public marketing site, used when no publicly reachable base URL is configured. */
const PUBLIC_SITE_URL = 'https://asklinc.com';

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * True for hosts a mail client outside our network can never reach: loopback,
 * private, link-local, carrier-grade NAT, and development-only hostnames.
 */
function isNonPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'host.docker.internal'
  ) {
    return true;
  }

  // IPv6 literal: loopback, unspecified, link-local (fe80::/10), unique-local (fc00::/7),
  // and IPv4-mapped addresses (::ffff:a.b.c.d / ::ffff:x:x) that wrap a non-public IPv4.
  if (host.includes(':')) {
    if (host === '::1' || host === '::' || /^fe[89ab]/.test(host) || /^f[cd]/.test(host)) {
      return true;
    }

    const dottedMapped = host.match(
      /^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i
    );
    if (dottedMapped) {
      return isNonPublicHost(dottedMapped.slice(1).join('.'));
    }

    const hexMapped = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16);
      const lo = parseInt(hexMapped[2], 16);
      return isNonPublicHost(
        [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join('.')
      );
    }

    return false;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1, 3).map(Number);
    return (
      a === 0 ||                          // unspecified / "this network"
      a === 10 ||                         // private
      a === 127 ||                        // loopback
      (a === 169 && b === 254) ||         // link-local
      (a === 172 && b >= 16 && b <= 31) ||// private
      (a === 192 && b === 168) ||         // private
      (a === 100 && b >= 64 && b <= 127)  // carrier-grade NAT
    );
  }

  return false;
}

/**
 * Normalizes a configured base URL, or returns null when it is unusable in an
 * email: not an absolute http(s) URL (a bare hostname or path would render as
 * a relative, unresolvable src), or pointing at a host only reachable from the
 * sending machine's network.
 */
function toPublicBaseUrl(candidate: string | undefined): string | null {
  if (!candidate?.trim()) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isNonPublicHost(parsed.hostname)) return null;

  // Rebuild from origin + path so userinfo, query, and hash never land in email HTML.
  const path =
    !parsed.pathname || parsed.pathname === '/'
      ? ''
      : stripTrailingSlashes(parsed.pathname);
  return `${parsed.origin}${path}`;
}

/**
 * Base URL for environment-specific action links (verify, reset password,
 * admin dashboard). Stays on localhost in development so locally sent emails
 * link back to the local frontend.
 */
export function getBaseUrl(): string {
  const isDevelopment =
    !process.env.NODE_ENV ||
    process.env.NODE_ENV === 'development' ||
    process.env.FRONTEND_URL?.includes('localhost');
  return isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'http://localhost:3001');
}

/**
 * Base URL for assets and marketing links embedded in emails (header banner,
 * footer links). Emails are always rendered outside this process, so a URL that
 * only resolves on the sending machine can never be fetched by the recipient —
 * the header banner just renders as broken alt text. Always resolves to an
 * absolute, publicly reachable URL, even when an email is sent from a developer
 * machine.
 *
 * Order: EMAIL_ASSET_BASE_URL, then FRONTEND_URL, then the public site.
 * Candidates that are not absolute http(s) URLs, or that point at a
 * loopback/private/link-local host, are skipped.
 */
export function getEmailAssetBaseUrl(): string {
  for (const candidate of [process.env.EMAIL_ASSET_BASE_URL, process.env.FRONTEND_URL]) {
    const publicUrl = toPublicBaseUrl(candidate);
    if (publicUrl) return publicUrl;
  }
  return PUBLIC_SITE_URL;
}

export interface CreateEmailHtmlOptions {
  /** Page title (used in <title>) */
  title?: string;
  /** Footer note shown below copyright (e.g. "This email was sent to X") */
  footerNote?: string;
}

/**
 * Creates a full HTML email with Ask Linc branding.
 * Important presentation styles are repeated inline for email clients that
 * strip or only partially support embedded CSS.
 */
export function createEmailHtml(content: string, options: CreateEmailHtmlOptions = {}): string {
  const assetBaseUrl = getEmailAssetBaseUrl();
  const { title = 'Ask Linc', footerNote } = options;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <title>${title}</title>
  <style>
    body {
      width: 100% !important;
      margin: 0;
      padding: 0;
      background-color: #f5f1e8;
      color: #123c2f;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .email-shell { width: 100%; background-color: #f5f1e8; }
    .email-pad { padding: 36px 18px; }
    .container {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      overflow: hidden;
      border: 1px solid #d8d2c5;
      border-radius: 18px;
      background-color: #fffdf7;
      box-shadow: 0 16px 42px rgba(18, 60, 47, 0.09);
    }
    .accent-bar { height: 6px; background-color: #cfff68; font-size: 0; line-height: 0; }
    .header {
      padding: 25px 32px 23px;
      border-bottom: 1px solid #e2ddd2;
      background-color: #fffdf7;
      text-align: left;
    }
    .brand-logo { display: block; width: 180px; max-width: 100%; height: auto; border: 0; }
    .content { padding: 42px 42px 36px; background-color: #fffdf7; }
    .welcome-message {
      margin: 0 0 16px;
      color: #123c2f;
      font-size: 30px;
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.035em;
    }
    .description {
      margin: 0 0 28px;
      color: #526d64;
      font-size: 16px;
      line-height: 1.7;
    }
    .verification-code {
      margin: 26px 0;
      padding: 23px 18px;
      border: 1px solid #b8c8bc;
      border-radius: 14px;
      background-color: #edf4e9;
      color: #123c2f;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
      font-size: 32px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 8px;
      text-align: center;
    }
    .expiration-notice, .time-limit {
      margin: 22px 0;
      padding: 14px 16px;
      border: 1px solid #d7debd;
      border-radius: 12px;
      background-color: #f4f8e7;
    }
    .expiration-notice p, .time-limit p { margin: 0; color: #4c632d; font-size: 14px; line-height: 1.55; }
    .button-wrap { margin: 28px 0; text-align: center; }
    .cta-button {
      display: inline-block;
      margin: 0;
      padding: 14px 26px;
      border: 1px solid #123c2f;
      border-radius: 999px;
      background-color: #123c2f;
      color: #ffffff !important;
      font-size: 15px;
      font-weight: 700;
      line-height: 1.2;
      text-align: center;
      text-decoration: none;
    }
    .fallback-link {
      margin: 22px 0;
      padding: 16px;
      border: 1px solid #d8d2c5;
      border-radius: 12px;
      background-color: #f8f5ed;
      color: #526d64;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
      font-size: 12px;
      line-height: 1.6;
      word-break: break-all;
    }
    .fallback-link strong { color: #29483f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .security-note {
      margin: 24px 0 0;
      padding: 16px;
      border-left: 3px solid #537266;
      border-radius: 0 10px 10px 0;
      background-color: #edf2ef;
    }
    .security-note p { margin: 0; color: #476258; font-size: 13px; line-height: 1.6; }
    .tier-badge {
      display: inline-block;
      margin: 0 0 20px;
      padding: 7px 13px;
      border-radius: 999px;
      background-color: #eaf5d5;
      color: #34551c;
      font-size: 13px;
      font-weight: 700;
    }
    .feature-list, .message-block {
      margin: 22px 0;
      padding: 20px;
      border: 1px solid #d8d2c5;
      border-radius: 14px;
      background-color: #f8f5ed;
    }
    .feature-item { margin: 0 0 12px; color: #526d64; font-size: 14px; line-height: 1.5; }
    .feature-item:last-child { margin-bottom: 0; }
    .feature-check { margin-right: 9px; color: #397052; font-weight: 700; }
    .footer { padding: 28px 32px; background-color: #123c2f; color: #d7e1dc; text-align: center; }
    .footer-links { margin: 0 0 18px; }
    .footer-link { margin: 0 9px; color: #cfff68 !important; font-size: 12px; font-weight: 600; text-decoration: none; }
    .footer p { color: #d7e1dc; }
    @media only screen and (max-width: 620px) {
      .email-pad { padding: 0; }
      .container { border: 0; border-radius: 0; box-shadow: none; }
      .header { padding: 22px 24px 20px; }
      .brand-logo { width: 160px; }
      .content { padding: 34px 24px 30px; }
      .welcome-message { font-size: 27px; }
      .verification-code { font-size: 28px; letter-spacing: 5px; }
      .footer { padding: 26px 20px; }
      .footer-link { display: inline-block; margin: 5px 7px; }
    }
  </style>
</head>
<body>
  <table role="presentation" class="email-shell" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; background-color: #f5f1e8;">
    <tr>
      <td class="email-pad" style="padding: 36px 18px;">
        <div class="container" style="width: 100%; max-width: 600px; margin: 0 auto; overflow: hidden; border: 1px solid #d8d2c5; border-radius: 18px; background-color: #fffdf7;">
          <div class="accent-bar" style="height: 6px; background-color: #cfff68; font-size: 0; line-height: 0;">&nbsp;</div>
          <div class="header" style="padding: 25px 32px 23px; border-bottom: 1px solid #e2ddd2; background-color: #fffdf7; text-align: left;">
            <a href="${assetBaseUrl}" aria-label="Ask Linc home" style="display: inline-block; text-decoration: none;">
              <img class="brand-logo" src="${assetBaseUrl}/ask-linc-logo.png" alt="Ask Linc" width="180" style="display: block; width: 180px; max-width: 100%; height: auto; border: 0;" />
            </a>
          </div>

          <div class="content" style="padding: 42px 42px 36px; background-color: #fffdf7;">
            ${content}
          </div>

          <div class="footer" style="padding: 28px 32px; background-color: #123c2f; color: #d7e1dc; text-align: center;">
            <div class="footer-links" style="margin: 0 0 18px;">
              <a class="footer-link" href="${assetBaseUrl}" style="margin: 0 9px; color: #cfff68; font-size: 12px; font-weight: 600; text-decoration: none;">Home</a>
              <a class="footer-link" href="${assetBaseUrl}/features" style="margin: 0 9px; color: #cfff68; font-size: 12px; font-weight: 600; text-decoration: none;">Features</a>
              <a class="footer-link" href="${assetBaseUrl}/how-we-protect-your-data" style="margin: 0 9px; color: #cfff68; font-size: 12px; font-weight: 600; text-decoration: none;">Privacy &amp; Security</a>
              <a class="footer-link" href="${assetBaseUrl}/contact" style="margin: 0 9px; color: #cfff68; font-size: 12px; font-weight: 600; text-decoration: none;">Contact</a>
            </div>
            <p style="margin: 0; color: #d7e1dc; font-size: 12px; line-height: 1.6;">© ${new Date().getFullYear()} Ethan Teng Consulting LLC</p>
            ${footerNote ? `<p style="margin: 5px 0 0; color: #aebeb6; font-size: 11px; line-height: 1.5;">${footerNote}</p>` : ''}
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}
