/**
 * `JwtModule`/`JwtStrategy` fall back to a hardcoded placeholder secret
 * (see auth.module.ts / strategies/jwt.strategy.ts) so the app still boots
 * for local development without a .env file. That convenience becomes a
 * real vulnerability -- a publicly known signing key -- the moment it
 * reaches a production deployment. This is the code-level guarantee that
 * docs/threat-model.md's gap list asked for: refuse to boot rather than
 * rely on an operator remembering to override the default.
 */
const KNOWN_JWT_SECRET_PLACEHOLDERS = new Set([
  'your-secret-key-change-in-production',
  'dev-jwt-secret-change-in-production-min-32-chars',
  // .env.example's own placeholder -- copying that file to .env without
  // editing it is, if anything, a more likely real-world mistake than
  // leaving the variable unset entirely.
  'your-jwt-secret-here-min-32-chars-long',
]);

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || KNOWN_JWT_SECRET_PLACEHOLDERS.has(jwtSecret)) {
    throw new Error(
      'JWT_SECRET is unset or is still the hardcoded development placeholder. ' +
        'Refusing to start with NODE_ENV=production: set a real, random JWT_SECRET ' +
        '(32+ characters) before deploying.',
    );
  }
}
