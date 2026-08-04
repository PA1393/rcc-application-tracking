import dotenv from "dotenv";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

dotenv.config({
  path: "../../apps/web/.env",
});

export default defineConfig({
  schema: path.join("prisma", "schema"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    // Session pooler (5432). DDL cannot run through the transaction
    // pooler that DATABASE_URL points at.
    url: env("DIRECT_URL"),
  },
});

