import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./src/lib/csp";

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
            value: buildContentSecurityPolicy({
              isDevelopment: process.env.NODE_ENV !== "production",
            }),
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
