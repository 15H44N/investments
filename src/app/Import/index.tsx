import { useState, useEffect } from 'react'
import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist'
import { TextItem } from 'pdfjs-dist/types/src/display/api'
import { CheckCircle2Icon, XCircleIcon, ChevronRightIcon, Loader2Icon, EyeIcon, EyeOffIcon, Trash2Icon } from 'lucide-react'
import { format } from 'date-fns'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'
import { useNavigate } from 'react-router-dom'

import { CASParser } from '@/utils/parser/CASParser'
import { AuditLogger } from '@/utils/parser/AuditLogger'
import { textUtils } from '@/utils/parser/text-utils'
import { AuditEvent, AuditLevel, ParseSession } from '@/utils/parser/types'
import { InvestmentsRepository } from '@/repositories/InvestmentsRepository'
import { ParseSessionRepository } from '@/repositories/ParseSessionRepository'
import { SchemeListRepository } from '@/repositories/SchemeListRepository'
import { NavHistoryRepository } from '@/repositories/NavHistoryRepository'
import { MfApiClient } from '@/api/MfApiClient'
import { MfApiService } from '@/api/MfApiService'

GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`

const investmentsRepo = new InvestmentsRepository()
const sessionRepo = new ParseSessionRepository()
const mfService = new MfApiService(new MfApiClient(), new SchemeListRepository(), new NavHistoryRepository())

const LINE_COLORS: Record<string, string> = {
  info: 'text-foreground',
  warn: 'text-yellow-500 dark:text-yellow-400',
  error: 'text-red-500 dark:text-red-400',
}

const PHASE_LABELS: Record<string, string> = {
  'text-filter': 'filter',
  'isin-lookup': 'isin',
  'transaction-parse': 'txn',
  'meta': 'meta',
  'holder': 'holder',
  'summary': 'summary',
  'comparison': 'compare',
  'session': 'session',
}


function formatTs(iso: string): string {
  return format(new Date(iso), 'HH:mm:ss.SSS')
}

function formatAmount(n: number): string {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function DiffCell({ diff, diffPercent }: { diff: number; diffPercent: number }) {
  const abs = Math.abs(diffPercent)
  const color = abs <= 1 ? 'text-green-600 dark:text-green-400'
    : abs <= 5 ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-red-600 dark:text-red-400'
  const sign = diff >= 0 ? '+' : '-'
  return (
    <span className={color}>
      {sign}{formatAmount(diff)} ({sign}{abs.toFixed(1)}%)
    </span>
  )
}

export default function Import({ readData }: { readData: () => void }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isPasswordProtected, setIsPasswordProtected] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')
  const [error, setError] = useState('')
  const [sessions, setSessions] = useState<ParseSession[]>([])
  const [selectedSession, setSelectedSession] = useState<ParseSession | null>(null)
  const [levelFilter, setLevelFilter] = useState<'all' | AuditLevel>('all')
  const [hasData, setHasData] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    setSessions(sessionRepo.getAll())
    setHasData(investmentsRepo.get() !== null)
  }, [])

  const checkIfPasswordProtected = async (file: File) => {
    const blobUrl = URL.createObjectURL(file)
    try {
      await getDocument({ url: blobUrl }).promise
      setIsPasswordProtected(false)
      setPassword('')
    } catch (err) {
      if (err instanceof Error && err.name === 'PasswordException') {
        setIsPasswordProtected(true)
        setPassword('')
      }
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file')
      e.target.value = ''
      return
    }
    setSelectedFile(file)
    setError('')
    checkIfPasswordProtected(file)
  }

  const handleImport = async () => {
    if (!selectedFile) return
    setIsProcessing(true)
    setError('')
    const logger = new AuditLogger()

    try {
      // Step 1: Extract text from PDF
      setProcessingStatus('Extracting text from PDF...')
      const blobUrl = URL.createObjectURL(selectedFile)
      const pdf = await getDocument({ url: blobUrl, password }).promise
      const numPages = pdf.numPages
      let text = ''

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const pageText = await page.getTextContent()

        pageText.items.forEach(item => {
          const textItem = item as TextItem
          if (textItem.hasEOL) {
            text += textUtils.isText(textItem.str) ? textItem.str + '\n' : '\n'
          } else {
            if (textUtils.isText(textItem.str)) text += textItem.str + ' '
          }
        })
        text += '\n'
      }
      URL.revokeObjectURL(blobUrl)

      text = text.split('\n').map(l => l.trim()).join('\n')

      // Step 2: Filter text
      setProcessingStatus('Filtering PDF text...')
      const parser = new CASParser(logger)
      const filteredText = parser.filterText(text)

      // Step 3: Fetch scheme list (cache-first)
      setProcessingStatus('Fetching scheme list...')
      const schemes = await mfService.getSchemes()

      // Step 4: Parse
      setProcessingStatus('Parsing transactions...')
      const data = parser.parse(filteredText, schemes)

      // Step 5: Save investments data
      investmentsRepo.save(data)

      // Step 6: Finalize and save session
      const comparison = (data as unknown as { comparison: ParseSession['comparison'] }).comparison
      const session = logger.finalize('success', {
        holderName: data.holder.name,
        stats: {
          totalTransactions: data.transactions.length,
          totalFunds: new Set(data.transactions.map(t => t.mfName)).size,
          totalFolios: new Set(data.transactions.map(t => t.folio)).size,
          totalPages: numPages,
          dateRange: { from: data.meta.from, to: data.meta.to },
        },
        comparison,
      })
      sessionRepo.save(session)
      const updated = sessionRepo.getAll()
      setSessions(updated)
      setSelectedSession(updated[0])

      // Step 7: Trigger app data refresh
      readData()

      // Step 8: Pre-fetch NAV history in background
      const schemeCodes = [...new Set(data.transactions.map(t => t.matchingScheme.schemeCode))]
      mfService.prefetchNavHistory(schemeCodes).catch(console.error)

      setProcessingStatus('')
      setHasData(true)
      setSelectedFile(null)
      setPassword('')
      setIsPasswordProtected(false)
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      if (fileInput) fileInput.value = ''

      toast({
        title: 'Import successful',
        description: `${data.transactions.length} transactions imported.`,
        action: (
          <ToastAction altText="View transactions" onClick={() => navigate('/transactions')}>
            View
          </ToastAction>
        ),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred while processing the file.'
      const isPasswordError = err instanceof Error && err.name === 'PasswordException'
      setError(isPasswordError ? 'Invalid password. Please try again.' : message)

      const session = logger.finalize('error', { errorMessage: message })
      sessionRepo.save(session)
      const updated = sessionRepo.getAll()
      setSessions(updated)
      setSelectedSession(updated[0])
    } finally {
      setIsProcessing(false)
      setProcessingStatus('')
    }
  }

  const handleClearSessions = () => {
    sessionRepo.clearAll()
    setSessions([])
    setSelectedSession(null)
  }

  const handleDeleteData = () => {
    investmentsRepo.clear()
    setHasData(false)
    readData()
    toast({ title: 'Data cleared', description: 'All imported data has been removed.' })
  }

  const filteredEvents: AuditEvent[] = selectedSession
    ? selectedSession.events.filter(e => levelFilter === 'all' || e.level === levelFilter)
    : []

  return (
    <div className="flex flex-col gap-4 p-4 max-w-6xl mx-auto w-full">
      {/* Upload card */}
      <Card>
        <CardHeader>
          <CardTitle>Import CAS Statement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              disabled={isProcessing}
              className="max-w-sm"
            />
            {selectedFile && (
              <>
                {isPasswordProtected && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="pdf-password">PDF Password</Label>
                    <div className="relative max-w-sm">
                      <Input
                        id="pdf-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter PDF password"
                        className="pr-10"
                        disabled={isProcessing}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button
                  onClick={handleImport}
                  disabled={isProcessing || (isPasswordProtected && !password)}
                  className="max-w-sm"
                >
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                      {processingStatus || 'Processing...'}
                    </span>
                  ) : 'Import'}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete imported data */}
      {hasData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Imported Data</CardTitle>
              <Button variant="destructive" size="sm" onClick={handleDeleteData}>
                <Trash2Icon className="h-4 w-4 mr-1" />
                Delete data
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Sessions list */}
      {sessions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Past Sessions</CardTitle>
              <Button variant="ghost" size="sm" onClick={handleClearSessions}>
                <Trash2Icon className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {sessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50 transition-colors ${selectedSession?.id === session.id ? 'bg-muted' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {session.status === 'success'
                      ? <CheckCircle2Icon className="h-4 w-4 text-green-500 shrink-0" />
                      : <XCircleIcon className="h-4 w-4 text-red-500 shrink-0" />
                    }
                    <div className="text-left">
                      <div className="font-medium">
                        {session.holderName ?? (session.status === 'error' ? 'Error' : 'Unknown')}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {format(new Date(session.startedAt), 'dd MMM HH:mm')}
                        {session.stats && ` · ${session.stats.totalTransactions} txn`}
                      </div>
                    </div>
                  </div>
                  <ChevronRightIcon className={`h-4 w-4 text-muted-foreground transition-transform ${selectedSession?.id === session.id ? 'rotate-90' : ''}`} />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session detail */}
      {selectedSession && (
        <>
          {/* Comparison table */}
          {selectedSession.comparison && selectedSession.comparison.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary Comparison</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-2 font-medium">Fund House</th>
                        <th className="text-right px-4 py-2 font-medium">CAMS Cost</th>
                        <th className="text-right px-4 py-2 font-medium">Computed</th>
                        <th className="text-right px-4 py-2 font-medium">Diff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedSession.comparison.map(row => (
                        <tr key={row.fundHouse}>
                          <td className="px-4 py-2 text-muted-foreground">{row.fundHouse}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatAmount(row.camsInvested)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatAmount(row.computed)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            <DiffCell diff={row.diff} diffPercent={row.diffPercent} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Event log */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Event Log
                  <span className="ml-2 text-muted-foreground font-normal text-sm">
                    ({filteredEvents.length} events)
                  </span>
                </CardTitle>
                <Select value={levelFilter} onValueChange={v => setLevelFilter(v as typeof levelFilter)}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All levels</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warn">Warn</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[32rem] overflow-y-auto bg-muted/30 rounded-b-lg">
                {filteredEvents.length === 0 ? (
                  <p className="px-4 py-6 text-center text-muted-foreground text-sm">No events match this filter.</p>
                ) : (
                  <pre className="p-4 text-xs font-mono leading-5 whitespace-pre-wrap break-all">
                    {filteredEvents.map(event => {
                      const level = event.level.padEnd(5)
                      const phase = (PHASE_LABELS[event.phase] ?? event.phase).padEnd(8)
                      const ts = formatTs(event.timestamp)
                      return (
                        <span key={event.id} className={LINE_COLORS[event.level]}>
                          {`${ts}  ${level}  ${phase}  ${event.message}\n`}
                        </span>
                      )
                    })}
                  </pre>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
