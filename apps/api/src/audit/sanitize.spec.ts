import { safeStringifyForAudit, sanitizeForAudit } from './sanitize';

describe('sanitizeForAudit', () => {
  it('redacts a top-level password field', () => {
    expect(sanitizeForAudit({ email: 'a@b.com', password: 'hunter2' })).toEqual({ email: 'a@b.com', password: '[REDACTED]' });
  });

  it('redacts sensitive fields nested inside objects and arrays', () => {
    expect(sanitizeForAudit({ users: [{ email: 'a@b.com', token: 'abc123' }] })).toEqual({
      users: [{ email: 'a@b.com', token: '[REDACTED]' }],
    });
  });

  it('leaves non-sensitive fields untouched', () => {
    expect(sanitizeForAudit({ title: 'Roll out MFA', priority: 3 })).toEqual({ title: 'Roll out MFA', priority: 3 });
  });
});

describe('safeStringifyForAudit', () => {
  it('returns undefined for undefined, null, or an empty object', () => {
    expect(safeStringifyForAudit(undefined)).toBeUndefined();
    expect(safeStringifyForAudit(null)).toBeUndefined();
    expect(safeStringifyForAudit({})).toBeUndefined();
  });

  it('stringifies a sanitized object', () => {
    expect(safeStringifyForAudit({ email: 'a@b.com', password: 'hunter2' })).toBe(JSON.stringify({ email: 'a@b.com', password: '[REDACTED]' }));
  });
});
