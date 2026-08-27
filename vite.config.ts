import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    open: false,
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
