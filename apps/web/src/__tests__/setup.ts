import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load apps/web/.env before any test file imports the Prisma client
config({ path: path.resolve(__dirname, "../../.env") });
