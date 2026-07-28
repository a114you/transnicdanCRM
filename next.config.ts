import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Keep tesseract/native workers out of Turbopack rewrites (/ROOT/...)
  serverExternalPackages: ["tesseract.js", "tesseract.js-core"],
  allowedDevOrigins: [
    "10.56.198.61",
    "http://10.56.198.61:3000",
    "10.185.198.61",
    "http://10.185.198.61:3000",
    "10.193.5.61",
    "http://10.193.5.61:3000",
    "10.18.68.61",
    "http://10.18.68.61:3000",
    "10.68.20.61",
    "http://10.68.20.61:3000",
    "10.83.102.61",
    "http://10.83.102.61:3000",
    "10.161.41.61",
    "http://10.161.41.61:3000",
    "192.168.0.79",
    "http://192.168.0.79:3000",
    "10.157.41.61",
    "http://10.157.41.61:3000",
    "10.17.111.61",
    "http://10.17.111.61:3000",
  ],
  async headers() {
    return [
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        // elcats catalog iframe — must allow same-origin framing
        source: "/api/parts/elcats-embed",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/((?!api/parts/elcats-embed).*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
