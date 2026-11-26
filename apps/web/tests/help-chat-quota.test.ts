import { afterEach, describe, expect, it, vi } from 'vitest'
import { reserveHelpChatRequest } from '../app/lib/help-chat-quota.server'

afterEach(() => vi.unstubAllEnvs())

describe('HelpChat quota configuration', () => {
  it('fails closed without a database', async () => {
    await expect(reserveHelpChatRequest('', 10, 100)).rejects.toThrow('not configured')
  })

  it.each([
    'postgresql://example.test/db',
    'postgresql://example.test/db?sslmode=require',
    'postgresql://example.test/db?sslmode=verify-full&host=localhost',
    'postgresql://localhost/db',
    'https://example.test/db?sslmode=verify-full',
  ])('rejects unsafe production database configuration', async (url) => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(reserveHelpChatRequest(url, 10, 100)).rejects.toThrow('requires PostgreSQL')
  })
})
