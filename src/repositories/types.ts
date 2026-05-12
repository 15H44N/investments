import { InvestmentsData, MfScheme } from '@/types/investments'
import { ParseSession } from '@/utils/parser/types'

export interface IInvestmentsRepository {
  get(): InvestmentsData | null
  save(data: InvestmentsData): void
  clear(): void
}

export interface IParseSessionRepository {
  getAll(): ParseSession[]
  save(session: ParseSession): void  // keeps last 10
  clearAll(): void
}

export interface ISchemeListRepository {
  get(): Promise<{ schemes: MfScheme[]; timestamp: number } | null>
  save(schemes: MfScheme[]): Promise<void>
}

export interface INavHistoryRepository {
  get(schemeCode: number): Promise<import('@/utils/db').NavData | undefined>
  set(schemeCode: number, data: import('@/utils/db').NavResponse): Promise<void>
  getAll(): Promise<import('@/utils/db').NavData[]>
  clear(): Promise<void>
}
