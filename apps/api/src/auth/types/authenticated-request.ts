import type { Request } from 'express';

export interface RequestUser {
  sub: string;
  email: string;
  name: string;
  tenantId: string;
  organisationId: string | null;
  role: string;
  roles: string[];
}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}
