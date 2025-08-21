import type { NextConfig } from "next";

// Injected content by Sentry CLI
const { withSentryConfig } = require("@sentry/nextjs");

const nextConfig: NextConfig = {
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
