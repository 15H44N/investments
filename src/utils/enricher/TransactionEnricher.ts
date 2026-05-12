import { Transaction } from '@/types/investments'
import { FundType, TaxRules } from '@/utils/tax/TaxRules'

export interface EnrichedTransaction extends Transaction {
  fundType: FundType
  isDirectPlan: boolean
}

export class TransactionEnricher {
  static enrich(transactions: Transaction[]): EnrichedTransaction[] {
    return transactions.map(tx => ({
      ...tx,
      fundType: TaxRules.inferFundType(tx.matchingScheme.schemeName),
      isDirectPlan: TaxRules.isDirectPlan(tx.matchingScheme.schemeName),
    }))
  }
}
