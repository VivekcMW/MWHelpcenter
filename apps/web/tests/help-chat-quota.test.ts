import { afterEach, describe, expect, it, vi } from 'vitest'
import { reserveHelpChatRequest } from '../app/lib/help-chat-quota.server'

const database = vi.hoisted(() => ({connect: vi.fn(), configure: vi.fn()}))
vi.mock('pg', () => ({
  Pool: class {
    constructor(options: {connectionString: string}) { database.configure(options) }
    connect = database.connect
    on() {}
    async end() {}
  },
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('HelpChat quota configuration', () => {
  it('fails closed without a database', async () => {
    await expect(reserveHelpChatRequest('', 10, 100)).rejects.toThrow('not configured')
  })

  it.each([
    'postgresql://example.test/db',
    'postgresql://example.test/db?sslmode=disable',
    'postgresql://example.test/db?sslmode=require&sslmode=verify-full',
    'postgresql://example.test/db?sslmode=require&hostaddr=127.0.0.1',
    'postgresql://example.test/db?sslmode=verify-full&host=localhost',
    'postgresql://localhost/db',
    'https://example.test/db?sslmode=verify-full',
  ])('rejects unsafe production database configuration', async (url) => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(reserveHelpChatRequest(url, 10, 100)).rejects.toThrow('requires PostgreSQL')
  })

  it('upgrades a hosted database URL before passing it to pg without changing credentials or other options', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    database.connect.mockRejectedValueOnce(new Error('test connection stopped'))
    const url = 'postgresql://user:p%40ss@pooled.example.test/db?sslmode=require&channel_binding=require'
    await expect(reserveHelpChatRequest(url, 10, 100)).rejects.toThrow('test connection stopped')
    expect(database.configure).toHaveBeenLastCalledWith(expect.objectContaining({
      connectionString: url.replace('sslmode=require', 'sslmode=verify-full'),
    }))
  })

  it('logs a safe configuration diagnosis without exposing an invalid URL', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(reserveHelpChatRequest('invalid-secret-url', 10, 100)).rejects.toThrow('URL is invalid')
    expect(log).toHaveBeenCalledWith('HelpChat quota failure:', {
      phase: 'configuration', reason: 'HelpChat quota database URL is invalid',
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('invalid-secret-url')
  })

  it('logs allowlisted database error codes without logging credentials or messages', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    database.connect.mockRejectedValueOnce(Object.assign(new Error('private password'), {code: '28P01'}))
    await expect(reserveHelpChatRequest('postgresql://user:secret@example.test/db?sslmode=verify-full', 10, 100)).rejects.toThrow()
    expect(log).toHaveBeenCalledWith('HelpChat quota failure:', {phase: 'connection', reason: '28P01'})
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret')
    expect(JSON.stringify(log.mock.calls)).not.toContain('private password')
  })

  it('does not log unrecognized error codes or messages', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    database.connect.mockRejectedValueOnce(Object.assign(new Error('private message'), {code: 'private-code'}))
    await expect(reserveHelpChatRequest('postgresql://user:secret@example.test/db?sslmode=verify-full', 10, 100)).rejects.toThrow()
    expect(log).toHaveBeenCalledWith('HelpChat quota failure:', {phase: 'connection', reason: 'unknown'})
  })
})
