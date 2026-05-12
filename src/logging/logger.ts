export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogContext = Record<string, unknown>

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
  child(scope: string, context?: LogContext): Logger
}

class ConsoleLogger implements Logger {
  constructor(
    private scope: string,
    private baseContext: LogContext = {},
  ) {}

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context)
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context)
  }

  error(message: string, context?: LogContext): void {
    this.write('error', message, context)
  }

  child(scope: string, context: LogContext = {}): Logger {
    const nextScope = this.scope ? `${this.scope}:${scope}` : scope
    return new ConsoleLogger(nextScope, {
      ...this.baseContext,
      ...context,
    })
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    const payload = {
      ...this.baseContext,
      ...context,
    }
    const prefix = `[${this.scope}] ${message}`

    if (Object.keys(payload).length > 0) {
      console[level](prefix, payload)
      return
    }

    console[level](prefix)
  }
}

export function createLogger(scope: string, context: LogContext = {}): Logger {
  return new ConsoleLogger(scope, context)
}
