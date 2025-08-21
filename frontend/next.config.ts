import type { NextConfig } from "next";

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

export default nextConfig;
