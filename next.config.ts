import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "mammoth", "cheerio"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // pdf-parse/index.js loads test PDF at require time which fails
      // during Next.js page data collection phase on Railway
      config.resolve.alias = {
        ...config.resolve.alias,
        "pdf-parse": "pdf-parse/lib/pdf-parse.js",
      };
    }
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
