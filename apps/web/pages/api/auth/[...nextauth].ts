import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'email@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // TODO: In production, call actual authentication API
        // For MVP, use demo credentials
        const demoUsers = [
          { email: 'admin@example.local', password: 'DemoPassword123!', role: 'PLATFORM_ADMIN' },
          { email: 'ciso@example.local', password: 'DemoPassword123!', role: 'CISO' },
          { email: 'assessor@example.local', password: 'DemoPassword123!', role: 'ASSESSOR' },
          { email: 'viewer@example.local', password: 'DemoPassword123!', role: 'READ_ONLY_VIEWER' },
        ];

        const user = demoUsers.find(
          (u) =>
            u.email === credentials?.email &&
            u.password === credentials?.password
        );

        if (user) {
          return {
            id: user.email,
            email: user.email,
            name: user.email.split('@')[0],
            role: user.role,
          };
        }

        return null;
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
