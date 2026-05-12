import { ParseSession } from '@/utils/parser/types'
import { IParseSessionRepository } from './types'

const KEY = 'parseSessions'
const MAX_SESSIONS = 10

export class ParseSessionRepository implements IParseSessionRepository {
  getAll(): ParseSession[] {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ParseSession[]) : []
  }

  save(session: ParseSession): void {
    const existing = this.getAll()
    const updated = [session, ...existing].slice(0, MAX_SESSIONS)
    sessionStorage.setItem(KEY, JSON.stringify(updated))
  }

  clearAll(): void {
    sessionStorage.removeItem(KEY)
  }
}
