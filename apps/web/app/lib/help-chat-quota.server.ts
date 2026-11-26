import { Pool } from 'pg'

let pool: Pool | undefined
let poolUrl: string | undefined

const safeErrorCodes = new Set([
  '28P01', '28000', '3D000', '42P01', '42501',
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
])

export async function reserveHelpChatRequest(databaseUrl: string, perMinute: number, perDay: number) {
  let phase = 'configuration'
  try {
    if (!databaseUrl) throw new Error('HelpChat quota database is not configured')
    if (!URL.canParse(databaseUrl)) throw new Error('HelpChat quota database URL is invalid')
    const url = new URL(databaseUrl)
    const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
    const localDevelopment = local && ['development', 'test'].includes(process.env.NODE_ENV ?? '')
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
        url.searchParams.has('host') || url.searchParams.has('hostaddr') ||
        (!localDevelopment &&
          (url.searchParams.getAll('sslmode').length !== 1 || url.searchParams.get('sslmode') !== 'verify-full'))) {
      throw new Error('HelpChat quota database requires PostgreSQL with sslmode=verify-full')
    }
    phase = 'connection'
    if (!pool || poolUrl !== databaseUrl) {
      if (pool) await pool.end()
      pool = new Pool({connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 4000, query_timeout: 5000})
      pool.on('error', () => console.error('HelpChat quota database idle connection failed'))
      poolUrl = databaseUrl
    }
    const client = await pool.connect()
    phase = 'query'
    try {
      await client.query('BEGIN')
      const locked = await client.query('SELECT id FROM help_chat_quota WHERE id = true FOR UPDATE')
      if (locked.rowCount !== 1) throw new Error('HelpChat quota row is not provisioned')
      const result = await client.query(`
      UPDATE help_chat_quota SET
        minute_count = CASE WHEN minute_start = date_trunc('minute', statement_timestamp() AT TIME ZONE 'UTC') THEN minute_count + 1 ELSE 1 END,
        minute_start = date_trunc('minute', statement_timestamp() AT TIME ZONE 'UTC'),
        day_count = CASE WHEN day_start = date_trunc('day', statement_timestamp() AT TIME ZONE 'UTC') THEN day_count + 1 ELSE 1 END,
        day_start = date_trunc('day', statement_timestamp() AT TIME ZONE 'UTC')
      WHERE id = true
        AND (minute_start <> date_trunc('minute', statement_timestamp() AT TIME ZONE 'UTC') OR minute_count < $1)
        AND (day_start <> date_trunc('day', statement_timestamp() AT TIME ZONE 'UTC') OR day_count < $2)
      RETURNING id
    `, [perMinute, perDay])
      await client.query('COMMIT')
      return result.rowCount === 1
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    const knownMessages = [
      'HelpChat quota database is not configured',
      'HelpChat quota database URL is invalid',
      'HelpChat quota database requires PostgreSQL with sslmode=verify-full',
      'HelpChat quota row is not provisioned',
    ]
    const reason = error instanceof Error && knownMessages.includes(error.message)
      ? error.message
      : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && safeErrorCodes.has(error.code)
        ? error.code
        : 'unknown'
    console.error('HelpChat quota failure:', {phase, reason})
    throw error
  }
}
