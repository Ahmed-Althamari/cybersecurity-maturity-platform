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
  swcMinify: true,
  // Traces only the node_modules each page actually needs into
  // .next/standalone, so the production Docker image doesn't need the
  // whole monorepo's node_modules copied into it.
  output: "standalone",
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  images: {
    unoptimized: process.env.NODE_ENV === "development",
  },
  headers: async () => {
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
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
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
