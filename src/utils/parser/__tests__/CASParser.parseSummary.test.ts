import { describe, it, expect, beforeEach } from 'vitest'
import { CASParser } from '../CASParser'
import { AuditLogger } from '../AuditLogger'

describe('CASParser.parseSummary', () => {
  let parser: CASParser

  beforeEach(() => {
    parser = new CASParser(new AuditLogger())
  })

  const makeLines = () => [
    'CASMF-120526103838-01052000-12052026-CP000000000.pdf', // 0
    'CONSOLIDATED ACCOUNT STATEMENT',                        // 1
    '01-May-2000 To 12-May-2026',                           // 2
    'PORTFOLIO SUMMARY',                                     // 3
    'HDFC Mutual Fund 50000.00 75000.00',                    // 4
    'Kotak Mahindra Mutual Fund 30000.00 45000.00',          // 5
    'Total 80000.00 120000.00',                              // 6
    'Some other line',                                       // 7
  ]

  it('extracts total invested and currentValue', () => {
    const summary = parser.parseSummary(makeLines())
    expect(summary.invested).toBe(80000)
    expect(summary.currentValue).toBe(120000)
  })

  it('extracts per-fund-house rows', () => {
    const summary = parser.parseSummary(makeLines())
    expect(summary.mutualFunds).toHaveLength(2)
    expect(summary.mutualFunds[0].fundHouse).toBe('HDFC Mutual Fund')
    expect(summary.mutualFunds[0].invested).toBe(50000)
    expect(summary.mutualFunds[0].currentValue).toBe(75000)
    expect(summary.mutualFunds[1].fundHouse).toBe('Kotak Mahindra Mutual Fund')
    expect(summary.mutualFunds[1].invested).toBe(30000)
  })

  it('handles large Indian-format numbers (2 commas)', () => {
    const lines = [
      'CASMF-120526103838-01052000-12052026-CP000000000.pdf',
      'CONSOLIDATED ACCOUNT STATEMENT',
      '01-May-2000 To 12-May-2026',
      'PORTFOLIO SUMMARY',
      'HDFC Mutual Fund 51,09,726.07 83,95,111.48',
      'Total 51,09,726.07 83,95,111.48',
    ]

    const summary = parser.parseSummary(lines)
    expect(summary.invested).toBe(5109726.07)
    expect(summary.currentValue).toBe(8395111.48)
    expect(summary.mutualFunds[0].invested).toBe(5109726.07)
  })

  it('emits a summary phase info event', () => {
    const logger = new AuditLogger()
    new CASParser(logger).parseSummary(makeLines())
    expect(logger.getEvents().some(e => e.phase === 'summary' && e.level === 'info')).toBe(true)
  })
})
