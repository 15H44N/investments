import type { InvestmentsData, MfScheme } from '../../types/investments'
import { AuditLogger } from './AuditLogger'
import { CASParser } from './CASParser'
import type { ParseSession } from './types'

interface ParsePipelineOptions {
  logger?: AuditLogger
  totalPages?: number
}

export interface ParsePipelineResult {
  data: InvestmentsData
  filteredText: string
  logger: AuditLogger
  session: ParseSession
}

export function runParsePipeline(
  rawText: string,
  schemes: MfScheme[],
  options: ParsePipelineOptions = {},
): ParsePipelineResult {
  const logger = options.logger ?? new AuditLogger()
  const parser = new CASParser(logger)
  const filteredText = parser.filterText(rawText)
  const data = parser.parse(filteredText, schemes)

  const session = logger.finalize('success', {
    holderName: data.holder.name,
    stats: {
      totalTransactions: data.transactions.length,
      totalFunds: new Set(data.transactions.map(tx => tx.mfName)).size,
      totalFolios: new Set(data.transactions.map(tx => tx.folio)).size,
      totalPages: options.totalPages ?? 0,
      dateRange: { from: data.meta.from, to: data.meta.to },
    },
    comparison: data.comparison,
  })

  return { data, filteredText, logger, session }
}

export function finalizeParseError(logger: AuditLogger, errorMessage: string): ParseSession {
  return logger.finalize('error', { errorMessage })
}
