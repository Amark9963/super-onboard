import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://localhost:8000";
    return ["auth", "ai", "organizations", "projects"].map((route) => ({
      source: `/api/${route}/:path*`,
      destination: `${backend}/api/${route}/:path*`,
    }));
  },
};
export default config;
