import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    setupFiles: ["./src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // next-auth imports next/server internally which doesn't resolve in the
      // Vitest Node environment. Redirect to a minimal stub for all tests.
      "next-auth": path.resolve(__dirname, "./src/__tests__/__mocks__/next-auth.ts"),
    },
  },
});
