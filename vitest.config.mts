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
    // Every test file in tests/ shares ONE real local Postgres instance and
    // mutates the same numeros/reservas pool without any per-file isolation
    // (no schema-per-file, no savepoint rollback) -- several tests assert
    // exact counts of the shared pool (e.g. "exactly 5 numbers remain
    // available"). Vitest's default is to run test files in parallel, which
    // races those assertions against each other. Force sequential file
    // execution so the suite is deterministic.
    fileParallelism: false,
  },
});
