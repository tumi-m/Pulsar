import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /api/card reads its fonts from disk by a computed path (lib/cards/fonts.ts),
  // which file tracing can't follow — without this the function deploys
  // without them and every card is a 500.
  outputFileTracingIncludes: {
    "/api/card": [
      "./node_modules/@fontsource/inter/files/inter-*-700-normal.woff",
      "./node_modules/@fontsource/inter/files/inter-*-900-normal.woff",
      "./node_modules/@fontsource/space-mono/files/space-mono-*-normal.woff",
    ],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "**.mzstatic.com" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.bcbits.com" },
      { protocol: "https", hostname: "**.ytimg.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "**.dzcdn.net" },
      { protocol: "https", hostname: "coverartarchive.org" },
      { protocol: "https", hostname: "**.archive.org" },
    ],
  },
};

export default nextConfig;
