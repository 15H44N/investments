import type { ComparisonResult, SummaryData } from '../utils/parser/types'
import type { CapitalGainType, FundType } from '../utils/tax/TaxRules'

export interface InvestmentsData {
  meta: Meta
  holder: Holder
  summary: SummaryData
  transactions: Transaction[]
  comparison: ComparisonResult[]
}

export interface Meta {
  exportedAt: string
  from: string
  to: string
}

export interface Holder {
  name: string
  email: string
  mobile: string
  address: string
}

export interface Transaction {
  mfNameFull: string
  mfHouse: string
  isin: string
  matchingScheme: MatchingScheme
  mfName: string
  folio: string
  date: string
  amount: number
  type: "Investment" | "Redemption"
  price: number
  units: number
  content: string
  key: number
}

export interface MatchingScheme {
  schemeCode: number
  schemeName: string
  isinGrowth: string
  isinDivReinvestment: string | null
}

/** Raw entry from https://api.mfapi.in/mf */
export type MfScheme = MatchingScheme

export type Portfolio = PortfolioRow[]

export interface PortfolioRow {
  mfName: string
  schemeCode: number
  allTransactions: Transaction[]
  existingFunds: ExistingFund[]
  realisedProfit: number
  latestPrice: number
  currentInvested: number
  currentUnits: number
  currentValue: number
  profit: number
  color: string
  percentage: number
  // Enriched fields
  isin: string[]
  folio: string[]
  fundType: FundType
  isDirectPlan: boolean
  ltcgGain: number
  stcgGain: number
  ltValue: number
  stValue: number
}

export interface ExistingFund {
  price: number
  units: number
  date: Date
  invested: number
  currentValue: number
  profit: number
  gain: number
  // Enriched fields
  capitalGainType: CapitalGainType
  daysHeld: number
}
