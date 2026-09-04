import { resolveJwtSecret } from './auth.module';

describe('resolveJwtSecret', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns JWT_SECRET when set, regardless of NODE_ENV', () => {
    process.env.JWT_SECRET = 'a-real-secret';
    process.env.NODE_ENV = 'production';
    expect(resolveJwtSecret()).toBe('a-real-secret');
  });

  it('throws in production when JWT_SECRET is unset', () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET must be set in production/);
  });

  it('falls back to the insecure default outside production when JWT_SECRET is unset', () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'development';
    expect(resolveJwtSecret()).toBe('your-secret-key-change-in-production');
  });

  it('falls back when NODE_ENV is unset entirely (never treat "unset" as production)', () => {
    delete process.env.JWT_SECRET;
    delete process.env.NODE_ENV;
    expect(resolveJwtSecret()).toBe('your-secret-key-change-in-production');
  });
});
