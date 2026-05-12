import { describe, it, expect, beforeEach } from 'vitest'
import { AuditLogger } from '../AuditLogger'

describe('AuditLogger', () => {
  let logger: AuditLogger

  beforeEach(() => {
    logger = new AuditLogger()
  })

  it('has a sessionId and startedAt on construction', () => {
    expect(logger.sessionId).toMatch(/^[0-9a-f-]{36}$/) // UUID format
    expect(new Date(logger.startedAt).getTime()).not.toBeNaN()
  })

  describe('emit', () => {
    it('stores events in emission order', () => {
      logger.emit('meta', 'info', 'first')
      logger.emit('holder', 'warn', 'second')
      logger.emit('session', 'error', 'third')

      const events = logger.getEvents()
      expect(events).toHaveLength(3)
      expect(events[0].message).toBe('first')
      expect(events[1].message).toBe('second')
      expect(events[2].message).toBe('third')
    })

    it('assigns unique ids to each event', () => {
      logger.emit('meta', 'info', 'a')
      logger.emit('meta', 'info', 'b')

      const events = logger.getEvents()
      expect(events[0].id).not.toBe(events[1].id)
    })

    it('stores phase, level, message, page, and data', () => {
      logger.emit('transaction-parse', 'warn', 'NaN amount', { line: 'xxx' }, 22)

      const [event] = logger.getEvents()
      expect(event.phase).toBe('transaction-parse')
      expect(event.level).toBe('warn')
      expect(event.message).toBe('NaN amount')
      expect(event.data).toEqual({ line: 'xxx' })
      expect(event.page).toBe(22)
    })

    it('stores a valid ISO timestamp', () => {
      logger.emit('meta', 'info', 'test')
      const [event] = logger.getEvents()
      expect(new Date(event.timestamp).getTime()).not.toBeNaN()
    })
  })

  describe('info / warn / error helpers', () => {
    it('info emits with level info', () => {
      logger.info('meta', 'hello', { x: 1 }, 3)
      expect(logger.getEvents()[0].level).toBe('info')
      expect(logger.getEvents()[0].page).toBe(3)
    })

    it('warn emits with level warn', () => {
      logger.warn('summary', 'uh oh')
      expect(logger.getEvents()[0].level).toBe('warn')
    })

    it('error emits with level error', () => {
      logger.error('isin-lookup', 'not found', { isin: 'INF123' })
      expect(logger.getEvents()[0].level).toBe('error')
      expect(logger.getEvents()[0].data).toEqual({ isin: 'INF123' })
    })
  })

  describe('getEvents', () => {
    it('returns a copy, not the internal array', () => {
      logger.info('meta', 'a')
      const events = logger.getEvents()
      events.push({ id: 'x', timestamp: '', phase: 'meta', level: 'info', message: 'injected' })

      expect(logger.getEvents()).toHaveLength(1)
    })
  })

  describe('finalize', () => {
    it('returns a ParseSession with success status', () => {
      logger.info('session', 'done')
      const session = logger.finalize('success', {
        holderName: 'Test User',
        stats: {
          totalTransactions: 10,
          totalFunds: 3,
          totalFolios: 2,
          totalPages: 5,
          dateRange: { from: '2020-01-01', to: '2026-01-01' },
        },
      })

      expect(session.id).toBe(logger.sessionId)
      expect(session.startedAt).toBe(logger.startedAt)
      expect(session.status).toBe('success')
      expect(session.holderName).toBe('Test User')
      expect(session.stats?.totalTransactions).toBe(10)
      expect(session.events).toHaveLength(1)
      expect(new Date(session.completedAt!).getTime()).not.toBeNaN()
    })

    it('returns a ParseSession with error status and message', () => {
      const session = logger.finalize('error', { errorMessage: 'Parse failed' })
      expect(session.status).toBe('error')
      expect(session.errorMessage).toBe('Parse failed')
    })

    it('includes comparison results when provided', () => {
      const comparison = [
        { fundHouse: 'HDFC', camsInvested: 100000, computed: 100500, diff: 500, diffPercent: 0.5 },
      ]
      const session = logger.finalize('success', { comparison })
      expect(session.comparison).toEqual(comparison)
    })

    it('does not share event array with internal state', () => {
      logger.info('session', 'event1')
      const session = logger.finalize('success')
      logger.info('session', 'event2')

      expect(session.events).toHaveLength(1)
      expect(logger.getEvents()).toHaveLength(2)
    })
  })
})
