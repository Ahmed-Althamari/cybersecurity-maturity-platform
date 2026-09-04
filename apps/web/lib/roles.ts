// UX-only role gating — hides buttons the caller couldn't use anyway. The API enforces every one
// of these role checks server-side regardless (RolesGuard); this just avoids showing a control
// that would 403.

export const RISK_WRITE_ROLES = ['PLATFORM_ADMIN', 'ORGANISATION_ADMIN', 'CISO', 'GRC_MANAGER', 'SECURITY_ARCHITECT'];
export const RISK_DELETE_ROLES = ['PLATFORM_ADMIN', 'ORGANISATION_ADMIN'];

export function hasAnyRole(userRoles: string[], allowed: string[]): boolean {
  return userRoles.some((role) => allowed.includes(role));
}
