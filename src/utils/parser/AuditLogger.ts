import { AuditEvent, AuditLevel, AuditPhase, ComparisonResult, ParseSession, ParseSessionStats } from './types'
import { createLogger, Logger } from '@/logging/logger'

export class AuditLogger {
  private events: AuditEvent[] = []
  private counter = 0
  readonly sessionId: string
  readonly startedAt: string

  constructor(
    private sink: Logger | null = typeof window === 'undefined'
      ? null
      : createLogger('parser'),
  ) {
    this.sessionId = crypto.randomUUID()
    this.startedAt = new Date().toISOString()
  }

  emit(phase: AuditPhase, level: AuditLevel, message: string, data?: Record<string, unknown>, page?: number): void {
    this.events.push({
      id: `${Date.now()}-${this.counter++}`,
      timestamp: new Date().toISOString(),
      phase,
      level,
      message,
      page,
      data,
    })

    const context = {
      phase,
      page,
      ...data,
    }

    if (level === 'warn') {
      this.sink?.warn(message, context)
      return
    }

    if (level === 'error') {
      this.sink?.error(message, context)
      return
    }

    this.sink?.info(message, context)
  }

  info(phase: AuditPhase, message: string, data?: Record<string, unknown>, page?: number): void {
    this.emit(phase, 'info', message, data, page)
  }

  warn(phase: AuditPhase, message: string, data?: Record<string, unknown>, page?: number): void {
    this.emit(phase, 'warn', message, data, page)
  }

  error(phase: AuditPhase, message: string, data?: Record<string, unknown>, page?: number): void {
    this.emit(phase, 'error', message, data, page)
  }

  getEvents(): AuditEvent[] {
    return [...this.events]
  }

  finalize(
    status: 'success' | 'error',
    options?: {
      stats?: ParseSessionStats
      comparison?: ComparisonResult[]
      holderName?: string
      errorMessage?: string
    }
  ): ParseSession {
    return {
      id: this.sessionId,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
      status,
      errorMessage: options?.errorMessage,
      holderName: options?.holderName,
      events: [...this.events],
      comparison: options?.comparison,
      stats: options?.stats,
    }
  }
}
