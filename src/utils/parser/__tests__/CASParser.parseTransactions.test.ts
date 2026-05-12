import { describe, it, expect } from 'vitest'
import { CASParser } from '../CASParser'
import { AuditLogger } from '../AuditLogger'
import { MfScheme } from '@/types/investments'

const MOCK_SCHEMES: MfScheme[] = [
  { schemeCode: 100, schemeName: 'HDFC Balanced Advantage Fund - Direct Growth', isinGrowth: 'INF179K01DP5', isinDivReinvestment: null },
  { schemeCode: 200, schemeName: 'Kotak Small Cap Fund - Direct Growth', isinGrowth: 'INF174K01211', isinDivReinvestment: null },
]

// parseTransactions filters: index > totalRowIndex + 1
// So the fund/folio line must be at totalRowIndex + 2 or later.
const FOLIO_LINE = 'HDFC Mutual Fund - HDFC Balanced Advantage Fund - Direct - Growth - ISIN : INF179K01DP5 Folio No: 1234567890/01 CAMS'

function makeLines(extraTxLines: string[] = []) {
  return [
    'CASMF-120526103838-01052000-12052026-CP000000000.pdf', // 0
    'CONSOLIDATED ACCOUNT STATEMENT',                        // 1
    '01-May-2000 To 12-May-2026',                           // 2
    'PORTFOLIO SUMMARY',                                     // 3
    'HDFC Mutual Fund 80000.00 120000.00',                   // 4
    'Total 80000.00 120000.00',                              // 5  ← totalRowIndex=5
    'HDFC Mutual Fund',                                      // 6  ← totalRowIndex+1 (excluded by filter)
    FOLIO_LINE,                                              // 7  ← first processed line
    '01-Jan-2020 50000.00 10.1234 4938.271 PURCHASE (P1)',   // 8
    '01-Mar-2021 (25000.00) 12.5000 (2000.000) REDEMPTION', // 9
    ...extraTxLines,
  ]
}

describe('CASParser.parseTransactions', () => {
  it('returns parsed transactions from injected schemes', () => {
    const parser = new CASParser(new AuditLogger())
    const txs = parser.parseTransactions(makeLines(), MOCK_SCHEMES)
    expect(txs).toHaveLength(2)
  })

  it('parses Investment transaction correctly', () => {
    const parser = new CASParser(new AuditLogger())
    const [tx] = parser.parseTransactions(makeLines(), MOCK_SCHEMES)

    expect(tx.type).toBe('Investment')
    expect(tx.amount).toBe(50000)
    expect(tx.price).toBe(10.1234)
    expect(tx.units).toBe(4938.271)
    expect(tx.mfNameFull).toContain('HDFC Balanced Advantage Fund')
    expect(tx.mfHouse).toBe('HDFC Mutual Fund')
    expect(tx.isin).toBe('INF179K01DP5')
    expect(tx.folio).toBe('1234567890')
    expect(tx.matchingScheme.schemeCode).toBe(100)
  })

  it('parses Redemption transaction correctly', () => {
    const parser = new CASParser(new AuditLogger())
    const txs = parser.parseTransactions(makeLines(), MOCK_SCHEMES)
    const redemption = txs.find(t => t.type === 'Redemption')!

    expect(redemption.type).toBe('Redemption')
    expect(redemption.amount).toBe(25000)
    expect(redemption.units).toBe(2000)
  })

  it('filters out NaN amount transactions', () => {
    const parser = new CASParser(new AuditLogger())
    // Empty parens → strToCur('') → NaN
    const lines = makeLines(['01-Feb-2022 () 15.0000 () NaN TRANSACTION'])
    const txs = parser.parseTransactions(lines, MOCK_SCHEMES)
    expect(txs.every(tx => !isNaN(tx.amount))).toBe(true)
  })

  it('handles large amounts (2 commas — Indian format) without NaN', () => {
    const parser = new CASParser(new AuditLogger())
    const lines = makeLines(['29-Jul-2025 1,175,262.56 20.5003 57318.076 SWITCH IN'])
    const txs = parser.parseTransactions(lines, MOCK_SCHEMES)
    const switchIn = txs.find(tx => tx.amount === 1175262.56)
    expect(switchIn).toBeDefined()
    expect(switchIn!.amount).toBe(1175262.56)
  })

  it('strips folio sub-account suffix', () => {
    const parser = new CASParser(new AuditLogger())
    const txs = parser.parseTransactions(makeLines(), MOCK_SCHEMES)
    expect(txs[0].folio).toBe('1234567890') // not "1234567890/01"
  })

  it('emits isin-lookup info events', () => {
    const logger = new AuditLogger()
    new CASParser(logger).parseTransactions(makeLines(), MOCK_SCHEMES)
    const events = logger.getEvents()
    expect(events.some(e => e.phase === 'isin-lookup' && e.message === 'ISIN matched')).toBe(true)
  })

  it('emits transaction-parse events', () => {
    const logger = new AuditLogger()
    new CASParser(logger).parseTransactions(makeLines(), MOCK_SCHEMES)
    const txEvents = logger.getEvents().filter(e => e.phase === 'transaction-parse' && e.data?.['type'] !== undefined)
    expect(txEvents).toHaveLength(2)
  })

  it('throws when ISIN is missing', () => {
    const parser = new CASParser(new AuditLogger())
    const lines = makeLines()
    // Replace the folio line (index 7) with one that has no ISIN section
    lines[7] = 'HDFC Mutual Fund - HDFC BAF Folio No: 1234567890/01 CAMS'
    expect(() => parser.parseTransactions(lines, MOCK_SCHEMES)).toThrow('No ISIN found')
  })

  it('throws when no matching scheme for ISIN', () => {
    const parser = new CASParser(new AuditLogger())
    const lines = makeLines()
    lines[7] = 'HDFC Mutual Fund - HDFC BAF - ISIN : UNKNOWN0000X Folio No: 1234567890/01 CAMS'
    expect(() => parser.parseTransactions(lines, MOCK_SCHEMES)).toThrow('No matching scheme found for ISIN')
  })
})
