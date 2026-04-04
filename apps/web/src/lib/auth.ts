import NextAuth, { type DefaultSession } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

// ── Env validation ────────────────────────────────────────────────────────────
// Fail loudly at startup rather than producing a cryptic OAuth callback error.
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error(
    "[auth] Missing NEXTAUTH_SECRET. Add a random 32+ character string to .env.\n" +
      "Generate one with:  openssl rand -base64 32"
  );
}
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error(
    "[auth] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env."
  );
}

// ── Google Cloud Console requirements ────────────────────────────────────────
// In your OAuth 2.0 client settings, you MUST have these configured:
//   Authorized JavaScript origin:  http://localhost:3001
//   Authorized redirect URI:       http://localhost:3001/api/auth/callback/google
// Without the redirect URI, Google will reject the OAuth handshake and Auth.js
// will show "There is a problem with the server configuration."

// Extend the built-in session/JWT types with id and role
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma as any),
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) return null;

        const match = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!match) return null;

        return user;
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      // Only restrict Google sign-ins. Credentials are handled by `authorize`.
      if (account?.provider === "google") {
        const email = profile?.email;
        if (!email) return false;
        const existing = await prisma.user.findUnique({ where: { email } });
        // Deny sign-in if the email is not already in the User table.
        // Redirect to /login with a clear error code instead of the generic error page.
        if (!existing) return "/login?error=AccessDenied";
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // user.role exists on our User model but not on Auth.js's built-in User type
        token.role = (user as { role?: string }).role ?? "reviewer";
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      if (token.role) session.user.role = token.role as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});

// Named exports for the API route
export const { GET, POST } = handlers;
