import { getDB, STORE_NAV_HISTORY, NavData, NavResponse } from '@/utils/db'
import { INavHistoryRepository } from './types'

export class NavHistoryRepository implements INavHistoryRepository {
  async get(schemeCode: number): Promise<NavData | undefined> {
    const database = await getDB()
    return database.get(STORE_NAV_HISTORY, schemeCode)
  }

  async set(schemeCode: number, data: NavResponse): Promise<void> {
    const database = await getDB()
    const navData: NavData = { data, timestamp: Date.now() }
    await database.put(STORE_NAV_HISTORY, navData, schemeCode)
  }

  async getAll(): Promise<NavData[]> {
    const database = await getDB()
    return database.getAll(STORE_NAV_HISTORY)
  }

  async clear(): Promise<void> {
    const database = await getDB()
    await database.clear(STORE_NAV_HISTORY)
  }
}
