import type { MfScheme } from '../types/investments'
import type { NavResponse } from '../utils/db'

const BASE = 'https://api.mfapi.in/mf'

/** Pure HTTP client for mfapi.in — no caching, no side-effects. */
export class MfApiClient {
  async fetchSchemes(): Promise<MfScheme[]> {
    const response = await fetch(BASE)
    return response.json()
  }

  async fetchNavHistory(schemeCode: number): Promise<NavResponse> {
    const response = await fetch(`${BASE}/${schemeCode}`)
    return response.json()
  }
}
