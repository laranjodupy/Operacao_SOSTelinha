/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.LOCAL_SCREENSHOT_MODE === "true" && process.env.NODE_ENV === "development" && !process.env.VERCEL ? ".next-prints" : ".next",
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingExcludes: {
    "*": [
      "./.env*",
      "./data/**/*",
      "./backups/**/*",
      "./tests/**/*",
      "./docs/**/*",
      "./integrations/**/*",
    ],
  },
  serverExternalPackages: ["pg"],
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
