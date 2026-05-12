import { describe, it, expect, beforeEach } from 'vitest'
import { CASParser } from '../CASParser'
import { AuditLogger } from '../AuditLogger'

describe('CASParser.parseMeta', () => {
  let parser: CASParser

  beforeEach(() => {
    parser = new CASParser(new AuditLogger())
  })

  it('parses exportedAt, from, to from lines', () => {
    // Line 0: filename where split('-')[1] gives DDMMYYHHMMSSS timestamp
    // "120526103838" → day=12 month=05 year=2026 hour=10 min=38 sec=38
    const lines = [
      'CASMF-120526103838-01052000-12052026-CP000000000.pdf',
      'CONSOLIDATED ACCOUNT STATEMENT',
      '01-May-2000 To 12-May-2026',
    ]

    const meta = parser.parseMeta(lines)

    expect(meta.exportedAt).toBeDefined()
    expect(meta.from).toBeDefined()
    expect(meta.to).toBeDefined()

    const exportedAt = new Date(meta.exportedAt)
    expect(exportedAt.getFullYear()).toBe(2026)
    expect(exportedAt.getMonth()).toBe(4) // May = 4 (0-indexed)
    expect(exportedAt.getDate()).toBe(12)

    const from = new Date(meta.from)
    expect(from.getFullYear()).toBe(2000)
    expect(from.getMonth()).toBe(4) // May
    expect(from.getDate()).toBe(1)

    const to = new Date(meta.to)
    expect(to.getFullYear()).toBe(2026)
    expect(to.getMonth()).toBe(4) // May
    expect(to.getDate()).toBe(12)
  })

  it('emits an info event in the meta phase', () => {
    const logger = new AuditLogger()
    const p = new CASParser(logger)
    const lines = [
      'CASMF-120526103838-01052000-12052026-CP000000000.pdf',
      'CONSOLIDATED ACCOUNT STATEMENT',
      '01-May-2000 To 12-May-2026',
    ]

    p.parseMeta(lines)

    const events = logger.getEvents()
    expect(events.some(e => e.phase === 'meta' && e.level === 'info')).toBe(true)
  })
})
