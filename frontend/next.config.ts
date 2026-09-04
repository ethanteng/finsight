import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./src/lib/csp";

// Injected content by Sentry CLI
const { withSentryConfig } = require("@sentry/nextjs");

const noindexRoutes = [
  "/admin/:path*",
  "/app/:path*",
  "/finances/:path*",
  "/forgot-password/:path*",
  "/login/:path*",
  "/payment-success/:path*",
  "/profile/:path*",
  "/register/:path*",
  "/reset-password/:path*",
  "/transactions/:path*",
  "/verify-email/:path*",
];

const noindexHeaders = [
  {
    key: "X-Robots-Tag",
    value: "noindex, nofollow",
  },
];

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
      ...noindexRoutes.map((source) => ({ source, headers: noindexHeaders })),
    ];
  },
  async redirects() {
    return [
      {
        source: "/buying-a-house",
        destination: "/use-cases/home-buying",
        permanent: true,
      },
      {
        source: "/retirement-readiness",
        destination: "/use-cases/retirement",
        permanent: true,
      },
      {
        source: "/privacy-policy",
        destination: "/privacy",
        permanent: true,
      },
      {
        source: "/blog/standard-tier-welcome-to-the-juggle",
        destination: "/pricing",
        permanent: true,
      },
      {
        source: "/blog/today-in-markets-money-retirement-math-in-a-4-world",
        destination: "/blog/treasury-yields-5-percent-what-it-means-for-your-money",
        permanent: true,
      },
      {
        source: "/blog/why-ask-linc-is-not-just-chatgpt-for-your-bank",
        destination: "/vs/chatgpt",
        permanent: true,
      },
      {
        source: "/blog/the-feds-stuck-in-rate-limbo-cut-or-nah",
        destination: "/blog/treasury-yields-5-percent-what-it-means-for-your-money",
        permanent: true,
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
