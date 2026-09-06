import { PHASE_PRODUCTION_BUILD } from "next/constants.js";

// Kept in sync by hand with scripts/check-env.js's placeholder set -- see
// that file for why this check also has to exist there, separately, for
// the actual Docker deployment path.
const KNOWN_NEXTAUTH_SECRET_PLACEHOLDERS = new Set([
  "dev-nextauth-secret-change-in-production-min-32-chars",
  "your-secret-here-min-32-chars-long",
]);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Traces only the dependencies each page actually needs into .next/standalone, so the
  // production Docker image doesn't have to carry the full node_modules tree.
  output: "standalone",
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  images: {
    unoptimized: process.env.NODE_ENV === "development",
  },
  headers: async () => {
    // The browser calls the API directly (NEXT_PUBLIC_API_URL), not via
    // this server, so connect-src must allow it explicitly or every
    // api.ts fetch() call would be blocked. style-src needs 'unsafe-inline'
    // for the chart components (Recharts renders inline `style=""`
    // attributes on SVG elements, not just external CSS) -- script-src
    // stays locked to 'self' with no such exception, which is the
    // directive that actually matters for stopping injected-script XSS.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src 'self' ${apiUrl}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
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
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Content-Security-Policy",
            value: csp,
          },
        ],
      },
    ];
  },
};

// Exported as a function (not the plain object) so we get `phase`: `next
// build` (PHASE_PRODUCTION_BUILD) internally forces NODE_ENV=production
// regardless of the ambient env, but infrastructure/Dockerfile.web's build
// stage never has NEXTAUTH_SECRET available -- it's only injected into the
// container at runtime, alongside the separate `ENV NODE_ENV=production` in
// the runner stage. So the check below must fire when the standalone server
// actually starts (`node apps/web/server.js`, PHASE_PRODUCTION_SERVER), not
// during the build that produces it, or every production image build would
// fail without a NEXTAUTH_SECRET build secret nothing else needs.
export default function config(phase) {
  if (phase !== PHASE_PRODUCTION_BUILD && process.env.NODE_ENV === "production") {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret || KNOWN_NEXTAUTH_SECRET_PLACEHOLDERS.has(secret)) {
      throw new Error(
        "NEXTAUTH_SECRET is unset or is still the docker-compose.yml default placeholder. " +
          "Refusing to start with NODE_ENV=production: set a real, random NEXTAUTH_SECRET " +
          "(32+ characters) before deploying."
      );
    }
  }

  return nextConfig;
}
