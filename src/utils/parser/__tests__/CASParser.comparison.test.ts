import { describe, it, expect, beforeEach } from 'vitest'
import { CASParser } from '../CASParser'
import { AuditLogger } from '../AuditLogger'
import { SummaryData } from '../types'
import { Transaction } from '@/types/investments'

function makeTx(mfHouse: string, type: 'Investment' | 'Redemption', amount: number): Transaction {
  return {
    mfNameFull: mfHouse,
    mfHouse,
    isin: 'INF000000000',
    matchingScheme: { schemeCode: 1, schemeName: '', isinGrowth: '', isinDivReinvestment: null },
    mfName: mfHouse.split(' ')[0],
    folio: '123',
    date: '2020-01-01T00:00:00.000Z',
    amount,
    type,
    price: 10,
    units: amount / 10,
    content: '',
    key: 0,
  } as Transaction
}

describe('CASParser.compareSummaryVsTransactions', () => {
  let parser: CASParser
  let logger: AuditLogger

  beforeEach(() => {
    logger = new AuditLogger()
    parser = new CASParser(logger)
  })

  const summary: SummaryData = {
    invested: 80000,
    currentValue: 120000,
    mutualFunds: [
      { fundHouse: 'HDFC Mutual Fund', invested: 50000, currentValue: 75000 },
      { fundHouse: 'Kotak Mahindra Mutual Fund', invested: 30000, currentValue: 45000 },
    ],
  }

  it('returns one ComparisonResult per fund house', () => {
    const txs = [
      makeTx('HDFC Mutual Fund', 'Investment', 50000),
      makeTx('Kotak Mahindra Mutual Fund', 'Investment', 30000),
    ]

    const results = parser.compareSummaryVsTransactions(summary, txs)
    expect(results).toHaveLength(2)
  })

  it('computes diff=0 when computed matches CAMS', () => {
    const txs = [
      makeTx('HDFC Mutual Fund', 'Investment', 50000),
      makeTx('Kotak Mahindra Mutual Fund', 'Investment', 30000),
    ]

    const results = parser.compareSummaryVsTransactions(summary, txs)
    expect(results[0].diff).toBe(0)
    expect(results[0].diffPercent).toBe(0)
  })

  it('subtracts Redemption amounts from computed total', () => {
    const txs = [
      makeTx('HDFC Mutual Fund', 'Investment', 60000),
      makeTx('HDFC Mutual Fund', 'Redemption', 10000),
    ]

    const results = parser.compareSummaryVsTransactions(summary, txs)
    const hdfc = results.find(r => r.fundHouse === 'HDFC Mutual Fund')!
    expect(hdfc.computed).toBe(50000)
    expect(hdfc.diff).toBe(0)
  })

  it('reports a positive diff when computed > cams', () => {
    const txs = [
      makeTx('HDFC Mutual Fund', 'Investment', 52000), // 2000 extra
    ]

    const results = parser.compareSummaryVsTransactions(summary, txs)
    const hdfc = results.find(r => r.fundHouse === 'HDFC Mutual Fund')!
    expect(hdfc.diff).toBe(2000)
    expect(hdfc.diffPercent).toBeGreaterThan(0)
  })

  it('emits warn for fund house with diff > 1%', () => {
    const txs = [
      makeTx('HDFC Mutual Fund', 'Investment', 10000), // way off
    ]

    parser.compareSummaryVsTransactions(summary, txs)
    const warnEvents = logger.getEvents().filter(e => e.phase === 'comparison' && e.level === 'warn')
    expect(warnEvents.length).toBeGreaterThan(0)
  })

  it('emits info for fund house with diff <= 1%', () => {
    const txs = [
      makeTx('HDFC Mutual Fund', 'Investment', 50000), // exact match
      makeTx('Kotak Mahindra Mutual Fund', 'Investment', 30000),
    ]

    parser.compareSummaryVsTransactions(summary, txs)
    const infoEvents = logger.getEvents().filter(e => e.phase === 'comparison' && e.level === 'info')
    expect(infoEvents.length).toBe(2)
  })
})
