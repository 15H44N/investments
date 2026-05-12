/**
 * Tax rules for Indian mutual funds.
 * Used by Portfolio page (per-lot LT/ST display) and Tax Analysis page.
 *
 * Rules as of Budget 2024:
 * - Equity / equity-oriented hybrid (>65% equity):
 *     LTCG: held > 12 months → taxed at 12.5% (₹1.25L annual exemption)
 *     STCG: held ≤ 12 months → taxed at 20%
 * - Debt funds (purchased on or after 1 Apr 2023):
 *     All gains at slab rate (no LTCG benefit)
 * - Debt funds (purchased before 1 Apr 2023):
 *     LTCG: held > 36 months → 10% without indexation (legacy, per old law)
 *     STCG: held ≤ 36 months → slab rate
 */

export type FundType = 'equity' | 'debt' | 'hybrid'
export type CapitalGainType = 'LTCG' | 'STCG' | 'slab'

const DEBT_KEYWORDS = [
  'arbitrage', 'liquid', ' bond', 'debt', 'credit risk', 'gilt',
  'duration', 'money market', 'psu bond', 'corporate bond', 'banking and psu',
  'overnight', 'ultra short', 'low duration', 'short duration', 'medium duration',
  'long duration', 'fmp', 'fixed maturity', 'income fund',
]

const HYBRID_KEYWORDS = [
  'balanced advantage', 'multi asset', 'dynamic asset allocation',
  'hybrid', 'retirement', 'conservative hybrid', 'asset allocator',
]

/** April 1 2023 — date from which debt fund LTCG benefit was removed */
const DEBT_LTCG_CUTOFF = new Date('2023-04-01')

const MS_PER_DAY = 1000 * 60 * 60 * 24

export class TaxRules {
  /** Infer fund type from MFAPI scheme name (best-effort heuristic). */
  static inferFundType(schemeName: string): FundType {
    const name = schemeName.toLowerCase()
    if (DEBT_KEYWORDS.some(k => name.includes(k))) return 'debt'
    if (HYBRID_KEYWORDS.some(k => name.includes(k))) return 'hybrid'
    return 'equity'
  }

  /** Whether the plan is Direct (vs Regular). */
  static isDirectPlan(schemeName: string): boolean {
    return schemeName.toLowerCase().includes('direct')
  }

  /**
   * Holding period in full days from purchaseDate to today.
   * Pass `asOf` to override "today" (useful in tests).
   */
  static holdingDays(purchaseDate: Date, asOf: Date = new Date()): number {
    return Math.floor((asOf.getTime() - purchaseDate.getTime()) / MS_PER_DAY)
  }

  /**
   * Capital gain classification for a given lot.
   *
   * Equity / hybrid → LTCG if held > 365 days, else STCG.
   * Debt purchased before Apr-2023 → LTCG if held > 1095 days (3 years), else slab.
   * Debt purchased on/after Apr-2023 → always slab.
   */
  static capitalGainType(
    purchaseDate: Date,
    fundType: FundType,
    asOf: Date = new Date(),
  ): CapitalGainType {
    const days = TaxRules.holdingDays(purchaseDate, asOf)

    if (fundType === 'equity' || fundType === 'hybrid') {
      return days > 365 ? 'LTCG' : 'STCG'
    }

    // Debt
    if (purchaseDate < DEBT_LTCG_CUTOFF) {
      return days > 1095 ? 'LTCG' : 'slab'
    }
    return 'slab'
  }

  /** Tax rate for the gain type. Returns null for slab-rate (user-specific). */
  static taxRate(gainType: CapitalGainType): number | null {
    if (gainType === 'LTCG') return 0.125  // 12.5% (post Budget 2024)
    if (gainType === 'STCG') return 0.20   // 20%   (post Budget 2024)
    return null
  }

  /** LTCG annual exemption (₹1.25L from Budget 2024). */
  static readonly LTCG_EXEMPTION = 125_000
}
