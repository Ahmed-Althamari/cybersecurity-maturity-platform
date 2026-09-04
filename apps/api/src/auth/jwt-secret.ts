import { Logger } from '@nestjs/common';

const FALLBACK_SECRET = 'your-secret-key-change-in-production';

/**
 * A JWT_SECRET fallback baked into the public source tree is only a real
 * vulnerability once it's actually signing or verifying tokens someone
 * might rely on — i.e. in production. Refuse to start rather than
 * silently using a value anyone can read on GitHub; local dev/CI keep
 * the fallback (with a loud warning) so this doesn't force every
 * environment to configure a secret just to run the test suite.
 *
 * Both AuthModule (signs tokens) and JwtStrategy (verifies them) call
 * this — kept in its own file, rather than defined in either of the two,
 * to avoid a circular import between them.
 */
export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production — refusing to start with the public fallback value.');
  }
  new Logger('AuthModule').warn('JWT_SECRET is not set — using an insecure fallback value. Set JWT_SECRET before deploying.');
  return FALLBACK_SECRET;
}
