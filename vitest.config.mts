import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Integration tests hit a real local Postgres via the Supabase CLI and
    // run many concurrent RPC calls — give them more room than the default
    // 5s unit-test timeout.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
  },
});
