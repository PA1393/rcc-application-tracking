// Minimal next-auth stub for Vitest.
// next-auth tries to import next/server internally, which doesn't resolve in
// the Vitest Node environment. This stub satisfies the import without loading
// any Next.js internals.
export default function NextAuth(_config: unknown) {
  return { handlers: {}, auth: () => null, signIn: () => null, signOut: () => null };
}
export const handlers = {};
export const auth = () => null;
export const signIn = () => null;
export const signOut = () => null;
