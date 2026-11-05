import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['harness.test.ts'],
    setupFiles: ['./setup.ts'],
    fileParallelism: false,
    hookTimeout: 20_000,
    testTimeout: 60_000,
  },
});
