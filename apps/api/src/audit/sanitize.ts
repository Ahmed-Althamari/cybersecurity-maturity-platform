const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'secret',
  'apiKey',
]);

const REDACTED = '[REDACTED]';

/**
 * Deep-clones a request body for storage in AuditEvent.newValue, replacing
 * any credential-shaped field (password, token, secret, ...) so the
 * immutable audit trail never becomes a place secrets leak from. Applied
 * generically by AuditInterceptor across every decorated endpoint, so it
 * has no per-DTO knowledge — it matches on key name alone.
 */
export function sanitizeForAudit(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForAudit(entry));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.has(key) ? REDACTED : sanitizeForAudit(entry);
    }
    return result;
  }
  return value;
}

/** JSON-stringifies a sanitized value for storage, or undefined for an empty/absent body. */
export function safeStringifyForAudit(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'object' && Object.keys(value as Record<string, unknown>).length === 0) {
    return undefined;
  }
  try {
    return JSON.stringify(sanitizeForAudit(value));
  } catch {
    return undefined;
  }
}
