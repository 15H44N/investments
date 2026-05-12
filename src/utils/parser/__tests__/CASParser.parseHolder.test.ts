import { describe, it, expect, beforeEach } from 'vitest'
import { CASParser } from '../CASParser'
import { AuditLogger } from '../AuditLogger'

describe('CASParser.parseHolder', () => {
  let parser: CASParser

  beforeEach(() => {
    parser = new CASParser(new AuditLogger())
  })

  // lines[4] = name, Email Id at some index, Mobile at some index
  // email: line.split(' ')[2]  → "Email Id testuser@example.com"
  // mobile: line.split(' ')[1] → "Mobile 9876543210"
  // address: slice(emailIdx + 2, mobileIdx)

  const makeLines = () => [
    'CASMF-120526103838-01052000-12052026-CP000000000.pdf', // 0
    'CONSOLIDATED ACCOUNT STATEMENT',                        // 1
    '01-May-2000 To 12-May-2026',                           // 2
    'CONSOLIDATED ACCOUNT STATEMENT',                        // 3
    'Test Investor',                                         // 4 — name
    'Email Id testinvestor@example.com',                     // 5 — email
    'PAN: XXXXX1234X',                                       // 6 — emailIdx + 1
    '123 Test Street Mumbai',                                // 7 — address (emailIdx + 2 to mobileIdx)
    'Mobile 9876543210',                                     // 8 — mobile
  ]

  it('extracts name from line 4', () => {
    const holder = parser.parseHolder(makeLines())
    expect(holder.name).toBe('Test Investor')
  })

  it('extracts email from "Email Id <email>" line', () => {
    const holder = parser.parseHolder(makeLines())
    expect(holder.email).toBe('testinvestor@example.com')
  })

  it('extracts mobile from "Mobile <number>" line', () => {
    const holder = parser.parseHolder(makeLines())
    expect(holder.mobile).toBe('9876543210')
  })

  it('extracts address lines between email+2 and mobile', () => {
    const holder = parser.parseHolder(makeLines())
    expect(holder.address).toBe('123 Test Street Mumbai')
  })

  it('emits a holder phase info event', () => {
    const logger = new AuditLogger()
    new CASParser(logger).parseHolder(makeLines())
    expect(logger.getEvents().some(e => e.phase === 'holder' && e.level === 'info')).toBe(true)
  })
})
