import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/rls/**/*.test.ts"],
    testTimeout: 20000,
    // RLS files share one Development database (and its test users), so they must not run at the same time.
    fileParallelism: false,
  },
});
