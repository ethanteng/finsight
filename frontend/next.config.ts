import type { NextConfig } from "next";

// Injected content by Sentry CLI
const { withSentryConfig } = require("@sentry/nextjs");

const nextConfig: NextConfig = {
  outputFileTracingRoot: require("path").join(__dirname),
  async redirects() {
    return [
      {
        source: '/:l([a-z0-9])',
        destination: '/?utm_source=heycatch&utm_campaign=:l',
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://plausible.io https://t.contentsquare.net https://googleads.g.doubleclick.net https://cdn.plaid.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // No blanket `https:`. An answer is rendered as Markdown, so an
              // image URL that reached the model through a search snippet or a
              // transaction description would otherwise load on sight and take
              // whatever is in its query string with it. Hosts here are the
              // ones the app actually renders: next/image remotePatterns, the
              // Plaid merchant logos on transaction rows, institution logos,
              // and analytics pixels.
              "img-src 'self' data: blob: https://logo.clearbit.com https://*.plaid.com https://images.ghost.io https://static.ghost.org https://blog.asklinc.com https://*.ghost.io https://images.unsplash.com https://www.google-analytics.com https://www.googletagmanager.com https://googleads.g.doubleclick.net https://plausible.io https://*.contentsquare.net",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' http://localhost:3000 http://localhost:3001 https://in.heycatch.ai https://*.sentry.io https://www.google-analytics.com https://www.google.com https://www.googletagmanager.com https://plausible.io https://*.asklinc.com wss://*.asklinc.com https://*.onrender.com https://production.plaid.com https://cdn.plaid.com https://*.contentsquare.net https://*.ghost.io https://blog.asklinc.com https://images.ghost.io https://static.ghost.org",
              "frame-src 'self' https://*.plaid.com https://cdn.plaid.com https://www.googletagmanager.com https://app.snaptrade.com https://*.snaptrade.com",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.ghost.io',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'static.ghost.org',
      },
      {
        protocol: 'https',
        hostname: 'blog.asklinc.com',
      },
      // Ghost(Pro) subdomains - author profile images come from the blog's domain (e.g. ask-linc-blog.ghost.io)
      {
        protocol: 'https',
        hostname: '**.ghost.io',
      },
    ],
  },
};

const sentryWebpackPluginOptions = {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
};

// Make sure adding Sentry options is the last code change in this file
module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);

export default nextConfig;
