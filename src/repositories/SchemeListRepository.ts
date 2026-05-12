import { MfScheme } from '@/types/investments'
import { getDB, STORE_SCHEMES } from '@/utils/db'
import { ISchemeListRepository } from './types'

const RECORD_KEY = 'data'

export class SchemeListRepository implements ISchemeListRepository {
  async get(): Promise<{ schemes: MfScheme[]; timestamp: number } | null> {
    const database = await getDB()
    return database.get(STORE_SCHEMES, RECORD_KEY) ?? null
  }

  async save(schemes: MfScheme[]): Promise<void> {
    const database = await getDB()
    await database.put(STORE_SCHEMES, { schemes, timestamp: Date.now() }, RECORD_KEY)
  }
}
