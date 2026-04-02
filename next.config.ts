import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const CDN_URL = process.env.CDN_URL;

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "mammoth", "tiktoken", "sharp", "bullmq"],
  // ESLint runs in CI (GitHub Actions) — skip during Railway builds to avoid
  // pre-existing lint debt blocking deploys.
  eslint: { ignoreDuringBuilds: true },

  // Disable source maps in edge runtime to avoid eval() errors in Next.js 15.5
  // Source maps in edge functions cause "Code generation from strings disallowed" errors
  productionBrowserSourceMaps: false,

  // When CDN_URL is configured, serve _next/static/* from CDN edge.
  // Example: CDN_URL=https://cdn.example.com
  ...(CDN_URL ? { assetPrefix: CDN_URL } : {}),

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },

  async headers() {
    return [
      {
        // Next.js build output — immutable, content-hashed filenames
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Public static assets (embed.js, images, etc.)
        source: "/embed.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/test-embed.html",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=86400",
          },
        ],
      },
      {
        source: "/favicon.ico",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, immutable",
          },
        ],
      },
      {
        // API responses — no caching by default
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      sourcemaps: {
        disable: !process.env.SENTRY_AUTH_TOKEN,
      },
    })
  : nextConfig;
