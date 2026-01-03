import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['**/*.{test,spec}.{js,mjs}'],
    exclude: ['node_modules/**'],
  }
});
