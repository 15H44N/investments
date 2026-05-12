export type AuditLevel = 'info' | 'warn' | 'error'

export type AuditPhase =
  | 'text-filter'
  | 'meta'
  | 'holder'
  | 'summary'
  | 'transaction-parse'
  | 'isin-lookup'
  | 'comparison'
  | 'session'

export interface AuditEvent {
  id: string
  timestamp: string
  phase: AuditPhase
  level: AuditLevel
  message: string
  page?: number
  data?: Record<string, unknown>
}

export interface ComparisonResult {
  fundHouse: string
  camsInvested: number
  grossInvested: number
  grossRedeemed: number
  computed: number   // grossInvested - grossRedeemed
  diff: number       // computed - camsInvested
  diffPercent: number
}

export interface ParseSessionStats {
  totalTransactions: number
  totalFunds: number
  totalFolios: number
  totalPages: number
  dateRange: { from: string; to: string }
}

export interface SummaryFundHouse {
  fundHouse: string
  invested: number
  currentValue: number
}

export interface SummaryData {
  invested: number
  currentValue: number
  mutualFunds: SummaryFundHouse[]
}

export interface ParseSession {
  id: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'success' | 'error'
  errorMessage?: string
  holderName?: string
  events: AuditEvent[]
  comparison?: ComparisonResult[]
  stats?: ParseSessionStats
}
