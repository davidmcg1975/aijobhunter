import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone: a self-contained server with only the node_modules
  // it actually traced. Keeps the production image small and means the server
  // starts without a full npm install on the host.
  output: "standalone",
  // PGlite ships a WebAssembly build that resolves its own .wasm/.data files
  // relative to its module location. Bundling it breaks that resolution with
  // "File URL path must be absolute", so it must stay external.
  serverExternalPackages: [
    "unpdf",
    "mammoth",
    "@anthropic-ai/sdk",
    "@electric-sql/pglite",
    "pglite-prisma-adapter",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // React's development build uses eval() for debugging features
              // (reconstructing call stacks, source maps). It never does so in
              // production, so 'unsafe-eval' is granted in dev only.
              process.env.NODE_ENV === "development"
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
