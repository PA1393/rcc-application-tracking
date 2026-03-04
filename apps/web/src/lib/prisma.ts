// apps/web/src/lib/prisma.ts
// Singleton Prisma client wrapper to avoid too many connections during dev hot-reload.

import { PrismaClient } from "../../../../packages/db/prisma/generated";

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient__: PrismaClient | undefined;
}

const client = global.__prismaClient__ ?? new PrismaClient();

if (!global.__prismaClient__) {
  global.__prismaClient__ = client;
}

export default client;