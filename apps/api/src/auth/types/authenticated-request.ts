import type { Request } from 'express';

export interface RequestUser {
  sub: string;
  email: string;
  name: string;
  tenantId: string;
  organisationId: string | null;
  role: string;
  roles: string[];
  /** This token's unique id — logout revokes exactly this one. */
  jti: string;
  /** Standard JWT `exp` claim, seconds since epoch — logout stores this as the revocation's expiry. */
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}
