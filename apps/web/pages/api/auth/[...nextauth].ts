import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

// This runs server-side only, so it must reach the API over whatever
// network the *server* sits on -- in Docker Compose that's the internal
// service hostname (INTERNAL_API_URL=http://api:3001), not the
// browser-facing NEXT_PUBLIC_API_URL the client-side lib/api.ts calls use.
// Outside Docker (this repo's native dev workflow, and any single-host
// deployment) both are the same address, so falling back to
// NEXT_PUBLIC_API_URL keeps that path working unchanged.
const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface LoginResponse {
  access_token: string;
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

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'email@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const response = await fetch(`${API_URL}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        });

        if (!response.ok) {
          return null;
        }

        const data: LoginResponse = await response.json();
        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          accessToken: data.access_token,
          tenantId: data.user.tenantId,
          organisationId: data.user.organisationId,
          role: data.user.role,
          roles: data.user.roles,
        };
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken;
        token.tenantId = user.tenantId;
        token.organisationId = user.organisationId;
        token.role = user.role;
        token.roles = user.roles;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.user = {
        id: token.sub!,
        email: token.email!,
        name: token.name!,
        tenantId: token.tenantId,
        organisationId: token.organisationId,
        role: token.role,
        roles: token.roles,
      };
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    // Matches the NestJS API's own token lifetime (auth.module.ts: expiresIn: '24h')
    // -- no point in a NextAuth session outliving the backend token it wraps.
    maxAge: 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
