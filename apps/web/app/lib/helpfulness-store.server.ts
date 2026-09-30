import { chmodSync, closeSync, constants, fchmodSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Locale } from '../i18n/config'

export type HelpfulnessVote = 'yes' | 'no'
export type HelpfulnessReason = '' | 'unclear' | 'missing' | 'outdated' | 'other'
export interface HelpfulnessStoreConfig {
  path: string
  source: 'demo' | 'sanity'
}
export interface HelpfulnessKey {
  articleId: string
  locale: Locale
  visitorHash: string
}
export interface StoredHelpfulness {
  vote: HelpfulnessVote
  reason: HelpfulnessReason
}

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const RATE_WINDOW_MS = 60 * 1000

function enableWal(db: DatabaseSync): void {
  // Simultaneous first opens can hit SQLITE_BUSY during the journal-mode lock
  // upgrade without invoking SQLite's busy handler. Retry that setup step only;
  // never retry a vote transaction whose commit outcome might be ambiguous.
  const deadline = performance.now() + 5000
  const pause = new Int32Array(new SharedArrayBuffer(4))
  while (true) {
    try {
      db.exec('PRAGMA journal_mode = WAL')
      return
    } catch (error) {
      if (!(error instanceof Error) || !('errcode' in error) || error.errcode !== 5 || performance.now() >= deadline) throw error
      Atomics.wait(pause, 0, 0, 10)
    }
  }
}

// Local disk only: use a dedicated private directory, not a shared/network volume.
// Connections are deliberately not cached (including when opening/SQL fails).
function withDatabase<T>(config: HelpfulnessStoreConfig, operation: (db: DatabaseSync) => T): T {
  const parent = dirname(config.path)
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  chmodSync(parent, 0o700)
  const fd = openSync(config.path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600)
  try {
    fchmodSync(fd, 0o600)
  } finally {
    closeSync(fd)
  }
  const db = new DatabaseSync(config.path)
  try {
    db.exec('PRAGMA busy_timeout = 5000')
    enableWal(db)
    db.exec(`
      PRAGMA secure_delete = ON;
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS helpfulness_votes (
        source TEXT NOT NULL CHECK (source IN ('demo', 'sanity')),
        article_id TEXT NOT NULL,
        locale TEXT NOT NULL CHECK (locale IN ('en', 'ja')),
        visitor_hash TEXT NOT NULL CHECK (length(visitor_hash) = 64 AND visitor_hash NOT GLOB '*[^0-9a-f]*'),
        vote TEXT NOT NULL CHECK (vote IN ('yes', 'no')),
        reason TEXT NOT NULL CHECK (reason IN ('', 'unclear', 'missing', 'outdated', 'other')),
        updated_at INTEGER NOT NULL,
        CHECK (vote = 'no' OR reason = ''),
        PRIMARY KEY (source, article_id, locale, visitor_hash)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS helpfulness_votes_expiry ON helpfulness_votes(updated_at);
      CREATE TABLE IF NOT EXISTS helpfulness_rate_events (
        visitor_hash TEXT NOT NULL CHECK (length(visitor_hash) = 64 AND visitor_hash NOT GLOB '*[^0-9a-f]*'),
        submitted_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS helpfulness_rate_expiry ON helpfulness_rate_events(submitted_at);
      CREATE INDEX IF NOT EXISTS helpfulness_rate_visitor ON helpfulness_rate_events(visitor_hash, submitted_at);
      COMMIT;
    `)
    return operation(db)
  } finally {
    db.close()
  }
}

// A null key probes availability without creating a visitor or storing a read.
export function readHelpfulnessVote(config: HelpfulnessStoreConfig, key: HelpfulnessKey | null, now = Date.now()): StoredHelpfulness | null {
  return withDatabase(config, (db) => {
    if (!key) return null
    const row = db.prepare(`SELECT vote, reason FROM helpfulness_votes
      WHERE source = ? AND article_id = ? AND locale = ? AND visitor_hash = ? AND updated_at > ?
    `).get(config.source, key.articleId, key.locale, key.visitorHash, now - RETENTION_MS)
    return row ? { vote: row.vote as HelpfulnessVote, reason: row.reason as HelpfulnessReason } : null
  })
}

// Global means all visitors/articles/locales/sources in this SQLite file. Rolling
// windows avoid a fixed-minute boundary burst. Rejected requests add no events.
export function writeHelpfulnessVote(
  config: HelpfulnessStoreConfig,
  key: HelpfulnessKey,
  feedback: StoredHelpfulness,
  now = Date.now(),
): 'saved' | 'rateLimited' {
  return withDatabase(config, (db) => {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM helpfulness_votes WHERE updated_at <= ?').run(now - RETENTION_MS)
      db.prepare('DELETE FROM helpfulness_rate_events WHERE submitted_at <= ?').run(now - RATE_WINDOW_MS)
      const counts = db.prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN visitor_hash = ? THEN 1 ELSE 0 END), 0) AS visitor
        FROM helpfulness_rate_events`).get(key.visitorHash)!
      if (Number(counts.total) >= 100 || Number(counts.visitor) >= 10) {
        db.exec('COMMIT')
        return 'rateLimited'
      }
      db.prepare('INSERT INTO helpfulness_rate_events (visitor_hash, submitted_at) VALUES (?, ?)').run(key.visitorHash, now)
      db.prepare(`INSERT INTO helpfulness_votes (source, article_id, locale, visitor_hash, vote, reason, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (source, article_id, locale, visitor_hash) DO UPDATE SET
          vote = excluded.vote, reason = excluded.reason, updated_at = excluded.updated_at
      `).run(config.source, key.articleId, key.locale, key.visitorHash, feedback.vote, feedback.vote === 'yes' ? '' : feedback.reason, now)
      db.exec('COMMIT')
      return 'saved'
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  })
}