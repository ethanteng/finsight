import type { NextConfig } from "next";

// Injected content by Sentry CLI
const { withSentryConfig } = require("@sentry/nextjs");

const nextConfig: NextConfig = {
  outputFileTracingRoot: require("path").join(__dirname),
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
              "img-src 'self' data: https: blob: https://logo.clearbit.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' http://localhost:3000 http://localhost:3001 https://*.sentry.io https://www.google-analytics.com https://plausible.io https://*.asklinc.com wss://*.asklinc.com https://*.onrender.com https://production.plaid.com https://cdn.plaid.com https://*.contentsquare.net",
              "frame-src 'self' https://*.plaid.com https://cdn.plaid.com https://www.googletagmanager.com",
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
        hostname: 'static.ghost.org',
      },
      {
        protocol: 'https',
        hostname: 'blog.asklinc.com',
      },
    ],
  },
};

const sentryWebpackPluginOptions = {
  // Additional config options for the Sentry Webpack plugin
  silent: true, // Suppresses source map upload logs during build
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
};

// Make sure adding Sentry options is the last code change in this file
module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);

export default nextConfig;
