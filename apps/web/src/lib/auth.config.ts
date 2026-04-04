import type { NextAuthConfig } from "next-auth";

// Edge-safe config — no Prisma, no Node.js-only deps.
// Used by middleware to decode JWT tokens without touching the database.
// The full config (with adapter + providers) lives in auth.ts.
export const authConfig = {
  session: { strategy: "jwt" as const },
  providers: [],
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
