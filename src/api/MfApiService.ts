import { MfScheme } from '@/types/investments'
import { ISchemeListRepository, INavHistoryRepository } from '@/repositories/types'
import { NavResponse } from '@/utils/db'
import { MfApiClient } from './MfApiClient'

/** TTL for the full scheme list: 24 hours */
const SCHEME_LIST_TTL_MS = 24 * 60 * 60 * 1000

function navNeedsRefresh(timestamp: number): boolean {
  const lastFetch = new Date(timestamp)
  const now = new Date()
  if (lastFetch.toDateString() === now.toDateString()) return false
  return now.getHours() >= 1
}

/**
 * Cache-first service for mfapi.in data.
 * Orchestrates the HTTP client and repository layer — all caching logic lives here.
 */
export class MfApiService {
  constructor(
    private client: MfApiClient,
    private schemeRepo: ISchemeListRepository,
    private navRepo: INavHistoryRepository,
  ) {}

  /**
   * Returns the full scheme list (ISIN → schemeCode mapping).
   * Served from IndexedDB cache if fresh (< 24h), otherwise fetches upstream.
   */
  async getSchemes(): Promise<MfScheme[]> {
    const cached = await this.schemeRepo.get()
    if (cached && Date.now() - cached.timestamp < SCHEME_LIST_TTL_MS) {
      return cached.schemes as MfScheme[]
    }

    const schemes = await this.client.fetchSchemes()
    await this.schemeRepo.save(schemes)
    return schemes
  }

  /**
   * Returns NAV history for the given scheme code.
   * Served from IndexedDB cache unless stale (next day after 1am).
   */
  async getNavHistory(schemeCode: number): Promise<NavResponse> {
    const cached = await this.navRepo.get(schemeCode)
    if (cached && !navNeedsRefresh(cached.timestamp)) {
      return cached.data
    }

    const data = await this.client.fetchNavHistory(schemeCode)
    await this.navRepo.set(schemeCode, data)
    return data
  }

  /**
   * Pre-fetches NAV history for a set of scheme codes (e.g. after import).
   * Skips codes that already have fresh cached data.
   */
  async prefetchNavHistory(schemeCodes: number[]): Promise<void> {
    for (const code of schemeCodes) {
      await this.getNavHistory(code)
    }
  }
}
