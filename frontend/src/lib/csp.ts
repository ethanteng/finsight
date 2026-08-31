/**
 * The site's Content-Security-Policy, in one place so the header can be
 * reasoned about (and tested) without booting Next.
 */

// Contentsquare serves the tracking tag from t.contentsquare.net, but the
// screenshot-capture toolbar that builds heatmaps pulls further scripts from
// sibling hosts (d., c., and friends). Pinning a single host let the tag load
// while every capture script was refused, so heatmaps silently never built.
const CONTENTSQUARE = "https://*.contentsquare.net";

// The dev frontend talks to a backend on localhost; production never should,
// and listing it there would let a compromised page beacon to a local port.
const LOCAL_API_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

export function buildContentSecurityPolicy({ isDevelopment }: { isDevelopment: boolean }): string {
  const connectSrc = [
    "connect-src 'self'",
    ...(isDevelopment ? LOCAL_API_ORIGINS : []),
    "https://*.sentry.io",
    "https://www.google-analytics.com",
    "https://www.google.com",
    "https://www.googletagmanager.com",
    "https://*.asklinc.com",
    "wss://*.asklinc.com",
    "https://*.onrender.com",
    "https://production.plaid.com",
    "https://cdn.plaid.com",
    CONTENTSQUARE,
    "https://*.ghost.io",
    "https://blog.asklinc.com",
    "https://images.ghost.io",
    "https://static.ghost.org",
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com ${CONTENTSQUARE} https://googleads.g.doubleclick.net https://cdn.plaid.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // No blanket `https:`. An answer is rendered as Markdown, so an
    // image URL that reached the model through a search snippet or a
    // transaction description would otherwise load on sight and take
    // whatever is in its query string with it. Hosts here are the
    // ones the app actually renders: next/image remotePatterns, the
    // Plaid merchant logos on transaction rows, institution logos,
    // and analytics pixels.
    `img-src 'self' data: blob: https://logo.clearbit.com https://*.plaid.com https://images.ghost.io https://static.ghost.org https://blog.asklinc.com https://*.ghost.io https://images.unsplash.com https://www.google-analytics.com https://www.googletagmanager.com https://googleads.g.doubleclick.net ${CONTENTSQUARE}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    connectSrc,
    `frame-src 'self' https://*.plaid.com https://cdn.plaid.com https://www.googletagmanager.com https://app.snaptrade.com https://*.snaptrade.com ${CONTENTSQUARE}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
