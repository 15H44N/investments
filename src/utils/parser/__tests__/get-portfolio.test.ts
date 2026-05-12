import { describe, it, expect, vi, beforeEach } from 'vitest'
import getPortfolio from '@/utils/get-portfolio'
import { Transaction } from '@/types/investments'

// Mock navHistoryDB used inside getPortfolio
vi.mock('@/utils/db', () => ({
  navHistoryDB: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    clear: vi.fn(),
  },
  getDB: vi.fn(),
  STORE_NAV_HISTORY: 'nav-history',
  STORE_SCHEMES: 'scheme-list',
}))

const SCHEME = {
  schemeCode: 100,
  schemeName: 'HDFC Growth Fund',
  isinGrowth: 'INF179K01DP5',
  isinDivReinvestment: null,
}

function makeTx(
  overrides: Partial<Transaction> & { date: string; type: 'Investment' | 'Redemption'; units: number; price: number; amount: number }
): Transaction {
  return {
    mfNameFull: 'HDFC Mutual Fund - HDFC Growth Fund',
    mfHouse: 'HDFC Mutual Fund',
    isin: 'INF179K01DP5',
    matchingScheme: SCHEME,
    mfName: 'HDFC Growth Fund',
    folio: '7803197/01',
    content: '',
    key: 0,
    ...overrides,
  }
}

describe('getPortfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes portfolio for a single investment with no redemption', async () => {
    const txns: Transaction[] = [
      makeTx({ date: '2020-01-01', type: 'Investment', units: 100, price: 50, amount: 5000 }),
    ]

    const { portfolio, realisedProfitByDate } = await getPortfolio(txns)

    expect(portfolio).toHaveLength(1)
    const row = portfolio[0]
    expect(row.mfName).toBe('HDFC Growth Fund')
    expect(row.currentUnits).toBeCloseTo(100)
    // currentInvested uses integer-scaled math; Math.round(units*1000 * price*10000 / 10_000_000)
    expect(row.currentInvested).toBe(Math.round(100 * 1000 * 50 * 10000 / 10_000_000))
    expect(row.realisedProfit).toBe(0)
    expect(realisedProfitByDate).toHaveLength(0)
  })

  it('full redemption removes all units and records realised profit', async () => {
    const txns: Transaction[] = [
      makeTx({ date: '2020-01-01', type: 'Investment', units: 100, price: 50, amount: 5000 }),
      makeTx({ date: '2021-01-01', type: 'Redemption', units: 100, price: 80, amount: 8000 }),
    ]

    const { portfolio, realisedProfitByDate } = await getPortfolio(txns)

    const row = portfolio[0]
    expect(row.currentUnits).toBe(0)
    expect(row.realisedProfit).toBeCloseTo((80 - 50) * 100) // 3000
    expect(realisedProfitByDate).toHaveLength(1)
    expect(realisedProfitByDate[0].profit).toBeCloseTo(3000)
    expect(realisedProfitByDate[0].mfName).toBe('HDFC Growth Fund')
  })

  it('partial redemption reduces units correctly', async () => {
    const txns: Transaction[] = [
      makeTx({ date: '2020-01-01', type: 'Investment', units: 100, price: 50, amount: 5000 }),
      makeTx({ date: '2021-06-01', type: 'Redemption', units: 40, price: 75, amount: 3000 }),
    ]

    const { portfolio, realisedProfitByDate } = await getPortfolio(txns)

    const row = portfolio[0]
    expect(row.currentUnits).toBeCloseTo(60)
    expect(row.realisedProfit).toBeCloseTo((75 - 50) * 40) // 1000
    expect(realisedProfitByDate).toHaveLength(1)
    expect(realisedProfitByDate[0].profit).toBeCloseTo(1000)
  })

  it('multi-lot FIFO redemption spanning two purchase lots', async () => {
    const txns: Transaction[] = [
      makeTx({ date: '2019-01-01', type: 'Investment', units: 60, price: 40, amount: 2400 }),
      makeTx({ date: '2020-01-01', type: 'Investment', units: 60, price: 60, amount: 3600 }),
      // Redeem 80 — should consume all 60 from lot 1 and 20 from lot 2
      makeTx({ date: '2021-01-01', type: 'Redemption', units: 80, price: 100, amount: 8000 }),
    ]

    const { portfolio, realisedProfitByDate } = await getPortfolio(txns)

    const row = portfolio[0]
    // 120 invested, 80 redeemed → 40 remaining
    expect(row.currentUnits).toBeCloseTo(40)

    // Lot 1: (100-40)*60 = 3600
    // Lot 2: (100-60)*20 = 800
    expect(row.realisedProfit).toBeCloseTo(3600 + 800)
    // Two realisedProfitByDate entries (one per lot consumed)
    expect(realisedProfitByDate).toHaveLength(2)
    expect(realisedProfitByDate[0].profit).toBeCloseTo(3600)
    expect(realisedProfitByDate[1].profit).toBeCloseTo(800)
  })

  it('two different funds tracked independently', async () => {
    const SCHEME2 = { schemeCode: 200, schemeName: 'Axis Bluechip', isinGrowth: 'INF846K01DP5', isinDivReinvestment: null }
    const txns: Transaction[] = [
      makeTx({ date: '2020-01-01', type: 'Investment', units: 100, price: 50, amount: 5000 }),
      {
        mfNameFull: 'Axis Mutual Fund - Axis Bluechip',
        mfHouse: 'Axis Mutual Fund',
        isin: 'INF846K01DP5',
        matchingScheme: SCHEME2,
        mfName: 'Axis Bluechip',
        folio: '1234567/01',
        date: '2020-06-01',
        type: 'Investment',
        units: 200,
        price: 30,
        amount: 6000,
        content: '',
        key: 1,
      },
    ]

    const { portfolio } = await getPortfolio(txns)

    expect(portfolio).toHaveLength(2)
    const names = portfolio.map(r => r.mfName)
    expect(names).toContain('HDFC Growth Fund')
    expect(names).toContain('Axis Bluechip')
  })

  it('uses latest NAV price from navHistoryDB when available', async () => {
    const { navHistoryDB } = await import('@/utils/db')
    vi.mocked(navHistoryDB.get).mockResolvedValue({
      data: { data: [{ nav: '120' }] },
    } as never)

    const txns: Transaction[] = [
      makeTx({ date: '2020-01-01', type: 'Investment', units: 100, price: 50, amount: 5000 }),
    ]

    const { portfolio } = await getPortfolio(txns)

    expect(portfolio[0].latestPrice).toBe(120)
    expect(portfolio[0].currentValue).toBeCloseTo(100 * 120)
    expect(portfolio[0].profit).toBeCloseTo(100 * 120 - portfolio[0].currentInvested)
  })

  it('percentage adds up to 100 for multiple funds', async () => {
    const SCHEME2 = { schemeCode: 200, schemeName: 'Axis Bluechip', isinGrowth: 'INF846K01DP5', isinDivReinvestment: null }
    const txns: Transaction[] = [
      makeTx({ date: '2020-01-01', type: 'Investment', units: 100, price: 100, amount: 10000 }),
      {
        mfNameFull: 'Axis Mutual Fund - Axis Bluechip',
        mfHouse: 'Axis Mutual Fund',
        isin: 'INF846K01DP5',
        matchingScheme: SCHEME2,
        mfName: 'Axis Bluechip',
        folio: '1234567/01',
        date: '2020-06-01',
        type: 'Investment' as const,
        units: 100,
        price: 100,
        amount: 10000,
        content: '',
        key: 1,
      },
    ]

    const { portfolio } = await getPortfolio(txns)

    const totalPct = portfolio.reduce((sum, r) => sum + r.percentage, 0)
    expect(totalPct).toBeCloseTo(100)
  })
})
