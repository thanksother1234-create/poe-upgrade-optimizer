import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "web.poecdn.com" },
      { protocol: "https", hostname: "www.poewiki.net" },
    ],
  },
};

export default nextConfig;
