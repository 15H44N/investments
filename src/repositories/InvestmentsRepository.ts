import { InvestmentsData } from '@/types/investments'
import { IInvestmentsRepository } from './types'

const KEY = 'investmentsData'

export class InvestmentsRepository implements IInvestmentsRepository {
  get(): InvestmentsData | null {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as InvestmentsData) : null
  }

  save(data: InvestmentsData): void {
    localStorage.setItem(KEY, JSON.stringify(data))
  }

  clear(): void {
    localStorage.removeItem(KEY)
  }
}
