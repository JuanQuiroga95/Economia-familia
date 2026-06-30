import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const masterEmail = process.env.MASTER_EMAIL;
        const masterPasswordHash = process.env.MASTER_PASSWORD_HASH;

        if (!masterEmail || !masterPasswordHash) {
          console.error('MASTER_EMAIL or MASTER_PASSWORD_HASH not set');
          return null;
        }

        if (credentials.email !== masterEmail) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          masterPasswordHash
        );

        if (!isValid) {
          return null;
        }

        return {
          id: '1',
          email: masterEmail,
          name: 'Admin',
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
