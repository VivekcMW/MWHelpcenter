import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { Pool } from 'pg'

const databaseUrl = process.env.HELP_CHAT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)('shared HelpChat quota (isolated PostgreSQL)', () => {
  let admin: Pool
  let reserve: typeof import('../app/lib/help-chat-quota.server').reserveHelpChatRequest
  let otherInstance: typeof reserve

  beforeAll(async () => {
    const url = new URL(databaseUrl!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/helpchat_quota_test') {
      throw new Error('Integration tests require a dedicated local helpchat_quota_test database')
    }
    admin = new Pool({connectionString: databaseUrl})
    reserve = (await import('../app/lib/help-chat-quota.server')).reserveHelpChatRequest
    vi.resetModules()
    otherInstance = (await import('../app/lib/help-chat-quota.server')).reserveHelpChatRequest
  })

  afterAll(async () => { await admin.end() })

  it('enforces a global limit under concurrent requests from separate instances', async () => {
    await admin.query("UPDATE help_chat_quota SET minute_start = '1970-01-01', minute_count = 0, day_start = '1970-01-01', day_count = 0 WHERE id = true")
    const results = await Promise.all(Array.from({length: 24}, (_, i) =>
      (i % 2 ? reserve : otherInstance)(databaseUrl!, 7, 100),
    ))
    expect(results.filter(Boolean)).toHaveLength(7)
    const {rows} = await admin.query('SELECT minute_count, day_count FROM help_chat_quota WHERE id = true')
    expect(rows[0]).toEqual({minute_count: 7, day_count: 7})
  })

  it('enforces the daily limit across minute resets and resets at a new UTC day', async () => {
    await admin.query("UPDATE help_chat_quota SET minute_start = '1970-01-01', minute_count = 0, day_start = date_trunc('day', statement_timestamp() AT TIME ZONE 'UTC'), day_count = 2 WHERE id = true")
    expect(await reserve(databaseUrl!, 10, 2)).toBe(false)
    await admin.query("UPDATE help_chat_quota SET day_start = '1970-01-01' WHERE id = true")
    expect(await otherInstance(databaseUrl!, 10, 2)).toBe(true)
    const {rows} = await admin.query('SELECT minute_count, day_count FROM help_chat_quota WHERE id = true')
    expect(rows[0]).toEqual({minute_count: 1, day_count: 1})
  })
})
