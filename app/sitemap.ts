import type { MetadataRoute } from "next";

const base =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://pulsar-ten-sigma.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/samples`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/experience`, changeFrequency: "monthly", priority: 0.4 },
  ];
}
