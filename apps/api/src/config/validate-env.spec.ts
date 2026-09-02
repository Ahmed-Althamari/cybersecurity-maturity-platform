import { validateEnv } from './validate-env';

describe('validateEnv', () => {
  it('does nothing outside production, even with no JWT_SECRET', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => validateEnv({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => validateEnv({})).not.toThrow();
  });

  it('throws in production when JWT_SECRET is unset', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('throws in production when JWT_SECRET is the JwtModule hardcoded placeholder', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'your-secret-key-change-in-production',
      }),
    ).toThrow(/hardcoded development placeholder/);
  });

  it('throws in production when JWT_SECRET is the docker-compose default placeholder', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'dev-jwt-secret-change-in-production-min-32-chars',
      }),
    ).toThrow(/hardcoded development placeholder/);
  });

  it('throws in production when JWT_SECRET is the .env.example placeholder', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'your-jwt-secret-here-min-32-chars-long',
      }),
    ).toThrow(/hardcoded development placeholder/);
  });

  it('does not throw in production with a real JWT_SECRET', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-real-random-secret-that-is-at-least-32-chars-long',
      }),
    ).not.toThrow();
  });
});
