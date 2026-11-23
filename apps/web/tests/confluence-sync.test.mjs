import {createHmac} from 'node:crypto'
import {describe, expect, it} from 'vitest'
import {parseConfluenceEvent, stableHash, verifyConfluenceSignature} from '../scripts/confluence-sync-service.mjs'

const secret = 'confluence-webhook-test-secret-0123456789'

describe('Confluence sync webhook handling', () => {
  it('verifies HMAC-SHA256 signatures with or without the algorithm prefix', () => {
    const body = Buffer.from('{"event":"page_updated"}')
    const signature = createHmac('sha256', secret).update(body).digest('hex')

    expect(verifyConfluenceSignature(body, signature, secret)).toBe(true)
    expect(verifyConfluenceSignature(body, `sha256=${signature}`, secret)).toBe(true)
    expect(verifyConfluenceSignature(Buffer.from('tampered'), signature, secret)).toBe(false)
    expect(verifyConfluenceSignature(body, signature, 'wrong-secret')).toBe(false)
    expect(verifyConfluenceSignature(body, 'not-a-signature', secret)).toBe(false)
  })

  it('parses page create/update events into stable, Helpdesk-scoped queue events', () => {
    const payload = {
      event: 'page_updated',
      timestamp: 100,
      page: {
        id: 304939126,
        title: 'CMS setup',
        spaceKey: 'Helpdesk',
        version: 7,
        self: 'https://movingwallshub.atlassian.net/wiki/spaces/Helpdesk/pages/304939126',
      },
    }

    const first = parseConfluenceEvent(payload, 'payload-hash')
    const retry = parseConfluenceEvent(payload, 'payload-hash')

    expect(first).toMatchObject({
      kind: 'queued',
      eventType: 'page_updated',
      pageId: '304939126',
      sourceVersion: 7,
      sourceTitle: 'CMS setup',
      sourceUrl: payload.page.self,
      deleted: false,
    })
    expect(first.eventKey).toBe(retry.eventKey)
  })

  it('queues attachment events against their containing page and flags page deletions for review', () => {
    const attachment = parseConfluenceEvent({
      event: 'attachment_updated',
      attachment: {id: 304939129, title: 'capture.png', spaceKey: 'Helpdesk', container: {id: 304939126}, version: {number: 2}},
    }, 'attachment-hash')
    const deletion = parseConfluenceEvent({
      event: 'page_trashed',
      page: {id: 304939126, title: 'CMS setup', spaceKey: 'Helpdesk'},
    }, 'delete-hash')

    expect(attachment).toMatchObject({kind: 'queued', pageId: '304939126', attachmentId: '304939129', sourceVersion: 2})
    expect(deletion).toMatchObject({kind: 'queued', pageId: '304939126', deleted: true})
  })

  it('ignores events from other spaces and non-page content', () => {
    expect(parseConfluenceEvent({
      event: 'page_updated',
      page: {id: 1, title: 'Other space', spaceKey: 'Marketing'},
    }, 'other-space').kind).toBe('ignored')
    expect(parseConfluenceEvent({
      event: 'content_updated',
      content: {id: 2, contentType: 'comment', spaceKey: 'Helpdesk'},
    }, 'comment').kind).toBe('ignored')
  })

  it('routes malformed or incomplete events to review instead of syncing guessed IDs', () => {
    expect(parseConfluenceEvent({event: 'page_updated', page: {id: '../secret'}}, 'bad-id'))
      .toMatchObject({kind: 'review', errorCode: 'missing_content_id'})
    expect(parseConfluenceEvent(null, 'not-json'))
      .toMatchObject({kind: 'review', errorCode: 'invalid_payload'})
  })

  it('ignores Sanity system metadata when comparing draft content fingerprints', () => {
    const source = {_id: 'article-1', _rev: 'revision-a', _createdAt: '2026-01-01', title: 'Guide', body: [{_key: 'a', _type: 'block'}]}
    const reloaded = {_id: 'drafts.article-1', _rev: 'revision-b', _updatedAt: '2026-02-01', body: [{_type: 'block', _key: 'a'}], title: 'Guide'}

    expect(stableHash(source)).toBe(stableHash(reloaded))
    expect(stableHash({...source, title: 'Changed'})).not.toBe(stableHash(source))
  })
})
