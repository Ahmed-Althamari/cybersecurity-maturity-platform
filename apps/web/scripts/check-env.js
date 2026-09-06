#!/usr/bin/env node
// Runs as a Docker CMD step before apps/web/server.js starts (see
// infrastructure/Dockerfile.web). output: "standalone" resolves
// next.config.mjs at *build* time and bakes the result into the generated
// server.js, which never re-requires next.config.mjs at runtime -- so a
// check placed there (kept anyway, for the non-Docker `next start` path)
// never actually runs for this, the real deployment path. This script is
// the one that does.
const KNOWN_NEXTAUTH_SECRET_PLACEHOLDERS = new Set([
  // docker-compose.yml's own fallback for an unset NEXTAUTH_SECRET.
  'dev-nextauth-secret-change-in-production-min-32-chars',
  // .env.example's own placeholder -- copying that file to .env without
  // editing it is, if anything, a more likely real-world mistake than
  // leaving the variable unset entirely.
  'your-secret-here-min-32-chars-long',
]);

if (process.env.NODE_ENV === 'production') {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || KNOWN_NEXTAUTH_SECRET_PLACEHOLDERS.has(secret)) {
    console.error(
      'NEXTAUTH_SECRET is unset or is still the docker-compose.yml default placeholder. ' +
        'Refusing to start with NODE_ENV=production: set a real, random NEXTAUTH_SECRET ' +
        '(32+ characters) before deploying.',
    );
    process.exit(1);
  }
}
