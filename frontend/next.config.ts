import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://localhost:8000";
    return ["auth", "ai", "organizations", "projects", "public"].map(
      (route) => ({
        source: `/api/${route}/:path*`,
        destination: `${backend}/api/${route}/:path*`,
      }),
    );
  },
  async headers() {
    // Review links are bearer capabilities: never leak them via Referer, caches or indexes.
    return [
      {
        source: "/review/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};
export default config;
