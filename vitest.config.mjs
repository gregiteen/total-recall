import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ['frontend/**', 'jsdom'],
      ['**', 'node']
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '.git/**',
      '.agent/**',
      '.agents/**',
      '.claude/**'
    ]
  }
});
