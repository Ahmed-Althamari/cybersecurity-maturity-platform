import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const API_URL = process.env.API_URL || 'http://localhost:3001';

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
        if (!credentials?.email || !credentials.password) {
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

        const data = (await response.json()) as LoginResponse;

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
    error: '/auth/signin',
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
      session.tenantId = token.tenantId;
      session.organisationId = token.organisationId;
      session.role = token.role;
      session.roles = token.roles;
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours - matches the NestJS API's own JWT expiry
  },
  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
