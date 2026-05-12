import type { Holder, InvestmentsData, Meta, MfScheme, Transaction } from '../../types/investments'
import { AuditLogger } from './AuditLogger'
import type { ComparisonResult, SummaryData } from './types'
import { strToCur, strToPrice, strToUnits, MONTHS } from './string-converters'
import { textUtils } from './text-utils'

export class CASParser {
  constructor(private logger: AuditLogger) {}

  private getIndexByStartingText(lines: string[], text: string): number {
    return lines.indexOf(lines.filter(line => line.startsWith(text))[0])
  }

  private dateToString(date: Date): string {
    return JSON.parse(JSON.stringify(date))
  }

  filterText(rawText: string): string {
    const lines = rawText.split('\n')
    this.logger.info('text-filter', 'Filtering started', { rawLines: lines.length })

    let filteredLines = textUtils.filterLinesWithText(lines)

    filteredLines = textUtils.excludeLinesThatStartWith(filteredLines, 'Page')
    filteredLines = textUtils.excludeLinesThatStartWith(filteredLines, 'Date Amount')
    filteredLines = textUtils.excludeLinesThatStartWith(filteredLines, '(INR) (INR)')
    filteredLines = textUtils.excludeLinesThatStartWith(filteredLines, 'PAN:')

    filteredLines = filteredLines.filter((line, index) => {
      return index <= 2 || ![lines[0], lines[1], lines[2]].includes(line)
    })

    // Merge stamp duty lines (*** lines) into previous transaction line
    let stampDutyCount = 0
    filteredLines.forEach((line, index) => {
      if (line.startsWith('***')) {
        filteredLines[index - 1] += ' ' + filteredLines[index]
        stampDutyCount++
      }
    })
    filteredLines = textUtils.excludeLinesThatStartWith(filteredLines, '***')

    if (stampDutyCount > 0) {
      this.logger.info('text-filter', 'Stamp duty lines merged', { count: stampDutyCount })
    }

    let ci = filteredLines.findIndex(line => line.startsWith('Total')) + 2
    let start = false
    let started = true
    let si: number | undefined

    while (ci <= filteredLines.length - 1) {
      if (start) {
        if (filteredLines[ci].startsWith('Folio No:') && !filteredLines[ci + 1]?.includes('Folio No:')) {
          start = false
        } else {
          filteredLines[si!] = filteredLines[si!] + ' ' + filteredLines[ci]
          filteredLines[ci] = ''
        }
      } else {
        if (filteredLines[ci].startsWith('Closing') || started) {
          started = true
          if (filteredLines[ci].includes('-')) {
            start = true
            si = ci
            started = false
          }
        }
      }
      ci++
    }

    filteredLines = textUtils.filterLinesWithText(filteredLines)

    // Remove nominee blocks (3-line block containing "Nominee 1:")
    filteredLines = filteredLines.filter((line, index) => {
      if (filteredLines[index - 1] && filteredLines[index + 1]) {
        if (line.includes('Nominee 1:')) return false
        if (filteredLines[index - 1].includes('Nominee 1:')) return false
        if (filteredLines[index + 1].includes('Nominee 1:')) return false
      }
      return true
    })

    // Strip market-value-only sections between transactions
    let newFilteredLines: string[] = []
    let read = true

    for (let i = 0; i < filteredLines.length; i++) {
      if (read) {
        newFilteredLines.push(filteredLines[i])
      }
      if (filteredLines[i].includes('Market Value on')) {
        read = false
      }
      if (filteredLines[i].includes('Closing Unit Balance')) {
        newFilteredLines.push(filteredLines[i])
        read = true
      }
    }

    newFilteredLines = textUtils.excludeLinesThatInclude(newFilteredLines, 'Market Value on')

    newFilteredLines = newFilteredLines.filter((_line, index) => {
      if (newFilteredLines[index - 1] && newFilteredLines[index + 2]) {
        if (newFilteredLines[index - 1].includes('Closing Unit Balance')) {
          if (newFilteredLines[index + 2].includes('Folio No: ')) {
            return false
          }
        }
      }
      return true
    })

    newFilteredLines = textUtils.excludeLinesThatInclude(newFilteredLines, 'Closing Unit Balance')

    // Fix split transaction lines (PDF wrapping artefact)
    let retry = true
    while (retry) {
      retry = false
      const linesToDelete: number[] = []

      newFilteredLines.forEach((line, index) => {
        if (
          index > 3 &&
          line.length > 11 &&
          line[2] === '-' &&
          line[6] === '-' &&
          line[11] === ' ' &&
          newFilteredLines[index + 1]
        ) {
          const nextLine = newFilteredLines[index + 1]
          const nextIsDateLine =
            nextLine.length > 11 && nextLine[2] === '-' && nextLine[6] === '-' && nextLine[11] === ' '

          if (!nextIsDateLine) {
            if (!(newFilteredLines[index + 2]?.startsWith('Folio No: '))) {
              retry = true
              newFilteredLines[index] = newFilteredLines[index] + ' ' + newFilteredLines[index + 1]
              linesToDelete.push(index + 1)
            }
          }
        }
      })

      newFilteredLines = newFilteredLines.filter((_v, index) => !linesToDelete.includes(index))
    }

    this.logger.info('text-filter', 'Filtering complete', { outputLines: newFilteredLines.length })
    return newFilteredLines.join('\n')
  }

  parseMeta(lines: string[]): Meta {
    const timestamp = lines[0].split(' ')[0].split('-')[1]
    const from = lines[2].split(' ')[0].split('-')
    const to = lines[2].split(' ')[2].split('-')

    const meta: Meta = {
      exportedAt: this.dateToString(new Date(
        Number('20' + timestamp.substring(4, 6)),
        Number(timestamp.substring(2, 4)) - 1,
        Number(timestamp.substring(0, 2)),
        Number(timestamp.substring(6, 8)),
        Number(timestamp.substring(8, 10)),
        Number(timestamp.substring(10, 12))
      )),
      from: this.dateToString(new Date(Number(from[2]), MONTHS.indexOf(from[1]), Number(from[0]))),
      to: this.dateToString(new Date(Number(to[2]), MONTHS.indexOf(to[1]), Number(to[0]))),
    }

    this.logger.info('meta', 'Meta parsed', { exportedAt: meta.exportedAt, from: meta.from, to: meta.to })
    return meta
  }

  parseHolder(lines: string[]): Holder {
    const mobileRowIndex = this.getIndexByStartingText(lines, 'Mobile')
    const emailRowIndex = this.getIndexByStartingText(lines, 'Email Id')

    const holder: Holder = {
      name: lines[4],
      email: lines[emailRowIndex].split(' ')[2],
      mobile: lines[mobileRowIndex].split(' ')[1],
      address: lines.slice(emailRowIndex + 2, mobileRowIndex).join('\n'),
    }

    this.logger.info('holder', 'Holder parsed', { name: holder.name })
    return holder
  }

  parseSummary(lines: string[]): SummaryData {
    const totalRowIndex = this.getIndexByStartingText(lines, 'Total')
    const summaryRowIndex = this.getIndexByStartingText(lines, 'PORTFOLIO SUMMARY')

    const data: SummaryData = {
      invested: strToCur(lines[totalRowIndex].split(' ')[1]),
      currentValue: strToCur(lines[totalRowIndex].split(' ')[2]),
      mutualFunds: lines.slice(summaryRowIndex + 1, totalRowIndex).map(mf => {
        const parts = mf.trim().split(' ')
        return {
          fundHouse: parts.slice(0, parts.length - 2).join(' '),
          invested: strToCur(parts[parts.length - 2]),
          currentValue: strToCur(parts[parts.length - 1]),
        }
      }),
    }

    this.logger.info('summary', 'Summary parsed', {
      invested: data.invested,
      currentValue: data.currentValue,
      fundHouses: data.mutualFunds.length,
    })
    return data
  }

  parseTransactions(lines: string[], schemes: MfScheme[]): Transaction[] {
    this.logger.info('isin-lookup', 'Resolving ISINs from scheme list', { totalSchemes: schemes.length })

    const totalRowIndex = this.getIndexByStartingText(lines, 'Total')

    let filteredLines: (string | Transaction)[] = lines.filter((_line, index) => index > totalRowIndex + 1)

    // Stamp duty: merge into previous transaction line's amount field
    ;(filteredLines as string[]).forEach((line, index) => {
      if ((line as string).includes('*** Stamp Duty ***')) {
        const stampDuty = strToPrice((line as string).split(' ')[1])
        const amount = strToPrice((filteredLines[index - 1] as string).split(' ')[1])

        if (isNaN(stampDuty) || isNaN(amount)) {
          this.logger.warn('transaction-parse', `Stamp duty skipped (parse error) — stampDuty=${stampDuty} amount=${amount}`, { line: line as string })
          return
        }

        filteredLines[index - 1] = (filteredLines[index - 1] as string).split(' ')
        ;(filteredLines[index - 1] as unknown as string[])[1] = (amount + stampDuty).toFixed(2)
        filteredLines[index - 1] = (filteredLines[index - 1] as unknown as string[]).join(' ')

        this.logger.info('transaction-parse', `Stamp duty ₹${stampDuty} merged into ₹${amount} → ₹${(amount + stampDuty).toFixed(2)}`, {
          stampDuty,
          amount,
        })
      }
    })

    filteredLines = filteredLines.filter(line => !(line as string).includes('***'))

    // Merge "Folio No:" lines into the preceding fund name line
    ;(filteredLines as string[]).forEach((line, index) => {
      if ((line as string).startsWith('Folio No:')) {
        filteredLines[index - 1] = (filteredLines[index - 1] as string) + ' ' + line
      }
    })
    filteredLines = filteredLines.filter(line => !(line as string).startsWith('Folio No:'))

    let mfNameFull = '', mfHouse = '', mfName = '', folio = '', isin = ''
    let matchingScheme: MfScheme | undefined

    ;(filteredLines as string[]).forEach((line, index) => {
      if (line.includes('Folio No:')) {
        ;[mfNameFull, folio] = line.split(' Folio No: ')
        isin = line.split(' - ISIN : ')[1]?.split('(')[0]?.split('Registrar')[0]?.split(' ').join('').trim().slice(0, 12) ?? ''

        if (!isin) {
          this.logger.error('isin-lookup', 'No ISIN found', { line })
          throw new Error(`No ISIN found for line: ${line}`)
        }

        matchingScheme = schemes.find(
          (scheme: MfScheme) => scheme.isinGrowth === isin || scheme.isinDivReinvestment === isin
        )

        if (!matchingScheme) {
          this.logger.error('isin-lookup', `No matching scheme found for ISIN: ${isin}`, { isin })
          throw new Error(`No matching scheme found for ISIN: ${isin}`)
        }

        this.logger.info('isin-lookup', `ISIN matched: ${isin} → ${matchingScheme.schemeName} [${matchingScheme.schemeCode}]`, {
          isin,
          schemeCode: matchingScheme.schemeCode,
          schemeName: matchingScheme.schemeName,
        })

        mfNameFull = mfNameFull.split(' - ISIN : ')[0].trim()
        mfHouse = mfNameFull.split(' -')[0].trim()
        mfNameFull = mfNameFull.split(' -').splice(1).join(' -').trim()

        mfName = mfNameFull
          .split('Direct').join('').split('DIRECT').join('')
          .split('Growth').join('').split('GROWTH').join('')
          .split('Plan').join('').split('PLAN').join('')
          .split('Option').join('').split('OPTION').join('')
          .split('( Non - Demat )').join('')
          .split('( formerly')[0].trim()

        while (mfName.charAt(mfName.length - 1) === '-' || mfName.charAt(mfName.length - 1) === ' ') {
          mfName = mfName.slice(0, -1)
        }

        this.logger.info('transaction-parse', `Folio ${folio.split('/')[0].trim()}  [${mfHouse}]  ${mfName}`, { mfHouse, mfNameFull, isin, folio: folio.split('/')[0].trim() })
      } else {
        if (line[2] === '-') {
          const amountStr = line.split(' ')[1]
          const unitsStr = line.split(' ')[3]
          let type: 'Investment' | 'Redemption' = 'Investment'
          let amount: number

          if (amountStr[0] === '(') {
            amount = strToCur(amountStr.slice(1, -1))
            type = 'Redemption'
          } else {
            amount = strToCur(amountStr)
          }

          let units: number
          if (unitsStr[0] === '(') {
            units = strToUnits(unitsStr.slice(1, -1))
          } else {
            units = strToUnits(unitsStr)
          }

          folio = folio.split('/')[0].trim()

          filteredLines[index] = {
            mfNameFull,
            mfHouse,
            isin,
            matchingScheme: matchingScheme!,
            mfName,
            folio,
            date: this.dateToString(new Date(
              Number(line.split(' ')[0].split('-')[2]),
              MONTHS.indexOf(line.split(' ')[0].split('-')[1]),
              Number(line.split(' ')[0].split('-')[0]),
            )),
            amount,
            type,
            price: strToPrice(line.split(' ')[2]),
            units,
            content: line,
            key: index,
          } as Transaction

          if (isNaN(amount)) {
            this.logger.warn('transaction-parse', `NaN amount skipped — raw line: ${line}`, { line, folio, mfName })
          } else if (amount === 0) {
            this.logger.warn('transaction-parse', `Zero amount (possible parse error) — raw line: ${line}`, { line, folio, mfName })
          } else {
            const tx = filteredLines[index] as Transaction
            const sign = type === 'Redemption' ? '-' : '+'
            this.logger.info('transaction-parse', `${tx.date.slice(0, 10)}  ${sign}₹${amount.toLocaleString('en-IN')}  ${units} units @ ₹${tx.price}  ${mfName}`, {
              date: tx.date,
              type,
              amount,
              units,
              mfName,
            })
          }
        }
      }
    })

    const transactions = (filteredLines as Transaction[]).filter(line => typeof line !== 'string')
    const valid = transactions.filter(tx => !isNaN(tx.amount) && tx.amount !== 0)

    const skipped = transactions.length - valid.length
    this.logger.info('transaction-parse', `Parsed ${valid.length} transactions${skipped > 0 ? ` (${skipped} skipped)` : ''}`, { total: transactions.length, valid: valid.length, skipped })

    return valid
  }

  compareSummaryVsTransactions(summary: SummaryData, transactions: Transaction[]): ComparisonResult[] {
    const fundHouseNames = summary.mutualFunds.map(mf => mf.fundHouse)

    const grossByHouse: Record<string, { invested: number; redeemed: number }> = {}

    for (const tx of transactions) {
      // Primary: match by first word of scheme name (e.g. "HDFC" → "HDFC Mutual Fund")
      // Fallback: match by first word of mfHouse code (e.g. "PP" → "PPFAS Mutual Fund")
      const fundHouse =
        fundHouseNames.find(fh => fh.toLowerCase().startsWith(tx.mfNameFull.split(' ')[0].toLowerCase())) ??
        fundHouseNames.find(fh => fh.toLowerCase().startsWith(tx.mfHouse.split(' ')[0].toLowerCase())) ??
        tx.mfNameFull.split(' ')[0]

      if (!grossByHouse[fundHouse]) grossByHouse[fundHouse] = { invested: 0, redeemed: 0 }
      if (tx.type === 'Investment') {
        grossByHouse[fundHouse].invested += tx.amount
      } else {
        grossByHouse[fundHouse].redeemed += tx.amount
      }
    }

    return summary.mutualFunds.map(mf => {
      const g = grossByHouse[mf.fundHouse] ?? { invested: 0, redeemed: 0 }
      const grossInvested = Math.round(g.invested * 100) / 100
      const grossRedeemed = Math.round(g.redeemed * 100) / 100
      const computed = Math.round((grossInvested - grossRedeemed) * 100) / 100
      const diff = Math.round((computed - mf.invested) * 100) / 100
      const diffPercent = mf.invested !== 0 ? Math.round((diff / mf.invested) * 10000) / 100 : 0

      const level = Math.abs(diffPercent) > 1 ? 'warn' : 'info'
      this.logger.emit(
        'comparison',
        level,
        `${mf.fundHouse} — CAMS: ₹${mf.invested.toLocaleString('en-IN')} | Computed: ₹${computed.toLocaleString('en-IN')} | Diff: ${diff >= 0 ? '+' : ''}₹${Math.abs(diff).toLocaleString('en-IN')}`,
        { fundHouse: mf.fundHouse, camsInvested: mf.invested, computed, diff, diffPercent },
      )

      return { fundHouse: mf.fundHouse, camsInvested: mf.invested, grossInvested, grossRedeemed, computed, diff, diffPercent }
    })
  }

  parse(filteredText: string, schemes: MfScheme[]): InvestmentsData {
    const lines = filteredText.split('\n')
    const startTime = Date.now()
    this.logger.info('session', 'Parse started', { lines: lines.length })

    const meta = this.parseMeta(lines)
    const holder = this.parseHolder(lines)
    const summary = this.parseSummary(lines)
    const transactions = this.parseTransactions(lines, schemes)
    const comparison = this.compareSummaryVsTransactions(summary, transactions)

    const duration = Date.now() - startTime
    this.logger.info('session', 'Parse complete', {
      transactions: transactions.length,
      funds: new Set(transactions.map(t => t.mfName)).size,
      folios: new Set(transactions.map(t => t.folio)).size,
      duration,
    })

    return { meta, holder, summary, transactions, comparison }
  }
}
