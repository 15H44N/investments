import { openDB, IDBPDatabase } from 'idb'

const DB_NAME = 'mf-tracker'
const DB_VERSION = 2

export const STORE_NAV_HISTORY = 'nav-history'
export const STORE_SCHEMES = 'scheme-list'

interface NavMeta {
  fund_house: string
  scheme_type: string
  scheme_category: string
  scheme_code: number
  scheme_name: string
  isin_growth: string | null
  isin_div_reinvestment: string | null
}

interface NavDataPoint {
  date: string
  nav: string
}

export interface NavResponse {
  meta: NavMeta
  data: NavDataPoint[]
  status: string
}

export interface NavData {
  data: NavResponse
  timestamp: number
}

export interface SchemeListData {
  schemes: unknown[]
  timestamp: number
}

let db: IDBPDatabase | null = null

export const getDB = async (): Promise<IDBPDatabase> => {
  if (!db) {
    db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          database.createObjectStore(STORE_NAV_HISTORY)
        }
        if (oldVersion < 2) {
          database.createObjectStore(STORE_SCHEMES)
        }
      },
    })
  }
  return db
}

// Legacy export kept for nav-fetcher.ts and get-portfolio.tsx compatibility
export const navHistoryDB = {
  async get(schemeCode: number) {
    const database = await getDB()
    return database.get(STORE_NAV_HISTORY, schemeCode) as Promise<NavData | undefined>
  },

  async set(schemeCode: number, data: NavResponse) {
    const database = await getDB()
    const navData: NavData = { data, timestamp: Date.now() }
    return database.put(STORE_NAV_HISTORY, navData, schemeCode)
  },

  async getAll() {
    const database = await getDB()
    return database.getAll(STORE_NAV_HISTORY) as Promise<NavData[]>
  },

  async clear() {
    const database = await getDB()
    return database.clear(STORE_NAV_HISTORY)
  },
}
