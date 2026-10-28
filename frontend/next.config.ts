import type { NextConfig } from "next";

// Applied to every page and API response served through the web origin. Later rules override
// earlier ones for the same header, so the review-link rule below wins on /review/*.
const baseline = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // A partial policy: it blocks framing, plugins, base-tag and form-target tricks without
  // constraining Next.js's own inline scripts. TLS (HSTS) belongs to the TLS-terminating proxy.
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
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
      { source: "/:path*", headers: baseline },
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
