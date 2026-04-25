import type { NextConfig } from "next";

// CSP is set per-request in middleware.ts so each response gets a fresh
// nonce that replaces 'unsafe-inline' on script-src. Static security
// headers (HSTS, frame, MIME sniff, referrer, permissions) stay here.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // FLoC's interest-cohort and its Topics-API successor browsing-topics each
  // log "Unrecognized feature" in browsers that don't implement them. Skip both;
  // Topics API requires sites to opt in via JS, so it's off for us by default.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
