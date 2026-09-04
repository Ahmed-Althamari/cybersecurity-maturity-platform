import type { DefaultSession, DefaultUser } from 'next-auth';
import type { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface User extends DefaultUser {
    accessToken: string;
    tenantId: string;
    organisationId: string | null;
    role: string;
    roles: string[];
  }

  interface Session extends DefaultSession {
    accessToken: string;
    tenantId: string;
    organisationId: string | null;
    role: string;
    roles: string[];
    user?: DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    accessToken: string;
    tenantId: string;
    organisationId: string | null;
    role: string;
    roles: string[];
  }
}
