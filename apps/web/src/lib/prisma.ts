import { PrismaClient } from "../../../../packages/db/prisma/generated";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  var __prismaClient__: PrismaClient | undefined;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool as any);

const client = global.__prismaClient__ ?? new PrismaClient({ adapter });

if (!global.__prismaClient__) {
  global.__prismaClient__ = client;
}

export default client;