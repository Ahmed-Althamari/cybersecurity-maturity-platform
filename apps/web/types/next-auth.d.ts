import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken: string;
    user: {
      id: string;
      email: string;
      name: string;
      tenantId: string;
      organisationId: string | null;
      role: string;
      roles: string[];
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    accessToken: string;
    tenantId: string;
    organisationId: string | null;
    role: string;
    roles: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken: string;
    tenantId: string;
    organisationId: string | null;
    role: string;
    roles: string[];
  }
}
