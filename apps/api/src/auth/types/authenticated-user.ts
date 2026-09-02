/**
 * Exactly what JwtStrategy.validate() attaches to `request.user` -- and so
 * exactly what `@CurrentUser()` returns -- on every authenticated request.
 * Replaces `@CurrentUser() user: any`, used verbatim across every
 * controller until this point (a real type-safety gap, not a functional
 * one: nothing here changes behavior, only what the compiler can catch).
 */
export interface AuthenticatedUser {
  sub: string;
  email: string;
  name: string;
  tenantId: string;
  organisationId: string | null;
  role: string;
  roles: string[];
  jti: string;
  exp: number;
}
