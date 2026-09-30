import { defineConfig } from 'vitest/config'

export default defineConfig({
  envDir: false,
  test: {
    include: ['apps/web/tests/**/*.test.{ts,tsx,mjs}', 'packages/content/**/*.test.ts'],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
  },
})