import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Run integration tests sequentially — they share containers
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    alias: {
      'imagiverse-shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
