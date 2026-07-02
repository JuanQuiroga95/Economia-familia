import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Usuario', type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
        token: { label: 'Token', type: 'text' }
      },
      async authorize(credentials) {
        if (credentials?.token) {
          try {
            const account = await prisma.account.findUnique({
              where: { magicToken: credentials.token },
            });
            if (!account) return null;

            // Invalida el token después de usarlo por seguridad (opcional, pero recomendado)
            await prisma.account.update({
              where: { id: account.id },
              data: { magicToken: null }
            });

            return {
              id: account.id,
              name: account.label,
              email: account.username,
            };
          } catch (error) {
            console.error('Magic link error:', error);
            return null;
          }
        }

        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        try {
          const account = await prisma.account.findUnique({
            where: { username: credentials.username },
          });

          if (!account) {
            return null;
          }

          const isValid = await bcrypt.compare(
            credentials.password,
            account.password
          );

          if (!isValid) {
            return null;
          }

          return {
            id: account.id,
            name: account.label,
            email: account.username, // NextAuth requires email field, we use username
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accountId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).accountId = token.accountId;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
