import { INestApplication } from '@nestjs/common';

import { createTestApp } from './support/app';

/**
 * Regression test for docs/security-architecture.md's "Known gaps" #3
 * (no CSP/HSTS/Referrer-Policy, no helmet) -- a future refactor that
 * drops `helmet()` from support/app.ts/main.ts's shared config would
 * otherwise only be caught by manually curling the running app, per the
 * "found and fixed" pattern used throughout this repo's other security
 * fixes. Boots the real AppModule, like every other *.e2e-spec.ts in
 * this directory, and checks a real HTTP response's headers directly.
 */
describe('Security headers (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends CSP, HSTS, Referrer-Policy, and the legacy frame/sniff headers on every response', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
});
