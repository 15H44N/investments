import { MfApiClient } from '@/api/MfApiClient'
import { MfApiService } from '@/api/MfApiService'
import { InvestmentsRepository } from '@/repositories/InvestmentsRepository'
import { NavHistoryRepository } from '@/repositories/NavHistoryRepository'
import { SchemeListRepository } from '@/repositories/SchemeListRepository'

const service = new MfApiService(new MfApiClient(), new SchemeListRepository(), new NavHistoryRepository())

export const fetchNavHistory = async () => {
  const data = new InvestmentsRepository().get()
  if (!data) return

  const uniqueSchemeCodes = [
    ...new Set(
      data.transactions
        .map(t => t.matchingScheme?.schemeCode)
        .filter(Boolean) as number[],
    ),
  ]

  await service.prefetchNavHistory(uniqueSchemeCodes)
}
