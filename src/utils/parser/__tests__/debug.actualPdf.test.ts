import { readFile } from 'node:fs/promises'
import { describe, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { AuditLogger } from '../AuditLogger'
import { CASParser } from '../CASParser'
import { normalizeExtractedText, textUtils } from '../text-utils'
import type { MfScheme, Transaction } from '@/types/investments'

const PDF_PATH = '/Users/ishaan/Workspace/mf-portfolio-insights/unlocked-CUXXXXXX0Q_01052000-12052026_CP211457130_12052026033838619.pdf'

async function extractTextFromPdf(path: string): Promise<string> {
  const data = new Uint8Array(await readFile(path))
  const pdf = await getDocument({ data }).promise
  let text = ''

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const pageText = await page.getTextContent()

    for (const item of pageText.items as Array<{ str: string; hasEOL?: boolean }>) {
      if (item.hasEOL) {
        text += textUtils.isText(item.str) ? `${item.str}\n` : '\n'
      } else if (textUtils.isText(item.str)) {
        text += `${item.str} `
      }
    }

    text += '\n'
  }

  return normalizeExtractedText(text)
}

function extractSchemesFromFilteredText(filteredText: string): MfScheme[] {
  const lines = filteredText.split('\n')
  const totalRowIndex = lines.findIndex(line => line.startsWith('Total'))
  let filteredLines = lines.filter((_line, index) => index > totalRowIndex + 1)

  filteredLines.forEach((line, index) => {
    if (line.startsWith('Folio No:') && filteredLines[index - 1]) {
      filteredLines[index - 1] = `${filteredLines[index - 1]} ${line}`
    }
  })

  filteredLines = filteredLines.filter(line => !line.startsWith('Folio No:'))

  const isins = [...new Set(
    filteredLines
      .filter(line => line.includes('Folio No:') && line.includes(' - ISIN : '))
      .map(line => (
        line
          .split(' - ISIN : ')[1]
          ?.split('(')[0]
          ?.split('Registrar')[0]
          ?.split(' ')
          .join('')
          .trim()
          .slice(0, 12) ?? ''
      ))
      .filter(Boolean),
  )]

  return isins.map((isin, index) => ({
    schemeCode: index + 1,
    schemeName: `Debug Scheme ${index + 1}`,
    isinGrowth: isin,
    isinDivReinvestment: null,
  }))
}

function mapFundHouse(summaryFundHouses: string[], tx: Transaction): string {
  return (
    summaryFundHouses.find(fundHouse => fundHouse === tx.mfHouse) ??
    summaryFundHouses.find(fundHouse => fundHouse.toLowerCase().startsWith(tx.mfHouse.split(' ')[0].toLowerCase())) ??
    tx.mfHouse
  )
}

describe('debug actual CAMS pdf', () => {
  it('prints parser grouping diagnostics', async () => {
    const logger = new AuditLogger()
    const parser = new CASParser(logger)
    const rawText = await extractTextFromPdf(PDF_PATH)
    const filteredText = parser.filterText(rawText)
    const schemes = extractSchemesFromFilteredText(filteredText)
    console.log('\n=== EXTRACTED SCHEMES ===')
    console.table(schemes.map(scheme => ({
      schemeCode: scheme.schemeCode,
      isinGrowth: scheme.isinGrowth,
    })))

    let data
    try {
      data = parser.parse(filteredText, schemes)
    } catch (error) {
      const lines = filteredText.split('\n')
      const targetIsin = 'INF209K01AJ8'

      console.log('\n=== FILTERED LINES WITH FOLIO / ISIN ===')
      console.table(
        lines
          .filter(line => line.includes('Folio No:') || line.includes(targetIsin))
          .map(line => ({ line })),
      )

      throw error
    }

    const summaryFundHouses = data.summary.mutualFunds.map(fund => fund.fundHouse)
    const grouped = new Map<string, { count: number; total: number; mapped: string; samples: string[] }>()

    for (const tx of data.transactions) {
      const mapped = mapFundHouse(summaryFundHouses, tx)
      const existing = grouped.get(tx.mfHouse) ?? { count: 0, total: 0, mapped, samples: [] }
      existing.count += 1
      existing.total += tx.type === 'Investment' ? tx.amount : -tx.amount
      if (existing.samples.length < 3) {
        existing.samples.push(`${tx.folio} :: ${tx.mfNameFull}`)
      }
      grouped.set(tx.mfHouse, existing)
    }

    console.log('\n=== SUMMARY FUND HOUSES ===')
    console.table(data.summary.mutualFunds.map(fund => ({
      fundHouse: fund.fundHouse,
      invested: fund.invested,
      currentValue: fund.currentValue,
    })))

    console.log('\n=== COMPARISON ===')
    console.table(data.comparison.map(row => ({
      fundHouse: row.fundHouse,
      camsInvested: row.camsInvested,
      computed: row.computed,
      diff: row.diff,
      diffPercent: row.diffPercent,
    })))

    console.log('\n=== TRANSACTION GROUPS BY tx.mfHouse ===')
    console.table([...grouped.entries()].map(([mfHouse, value]) => ({
      mfHouse,
      mappedTo: value.mapped,
      count: value.count,
      total: Math.round(value.total * 100) / 100,
      sample1: value.samples[0] ?? '',
      sample2: value.samples[1] ?? '',
      sample3: value.samples[2] ?? '',
    })))
  }, 120000)
})
