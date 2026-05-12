import { describe, it, expect } from 'vitest'
import { strToCur, strToPrice, strToUnits } from '../string-converters'

describe('strToCur', () => {
  it('parses a simple number', () => {
    expect(strToCur('1000.00')).toBe(1000)
  })

  it('parses a number with a single comma (thousands)', () => {
    expect(strToCur('9,52,250.00')).toBe(952250)
  })

  it('parses a number with two commas (lakhs - Indian format)', () => {
    expect(strToCur('1,175,321.32')).toBe(1175321.32)
  })

  it('parses negative numbers', () => {
    expect(strToCur('-1,175,321.32')).toBe(-1175321.32)
  })

  it('rounds to 2 decimal places', () => {
    expect(strToCur('1000.999')).toBe(1001)
    expect(strToCur('1000.004')).toBe(1000)
  })

  it('handles number without decimals', () => {
    expect(strToCur('50000')).toBe(50000)
  })

  it('handles small amounts', () => {
    expect(strToCur('58.76')).toBe(58.76)
  })
})

describe('strToPrice', () => {
  it('parses a NAV with 4 decimal precision', () => {
    expect(strToPrice('123.4567')).toBe(123.4567)
  })

  it('parses a NAV with commas', () => {
    expect(strToPrice('1,234.5678')).toBe(1234.5678)
  })

  it('rounds to 4 decimal places', () => {
    expect(strToPrice('123.45678')).toBe(123.4568)
    expect(strToPrice('123.45671')).toBe(123.4567)
  })

  it('parses number without decimals', () => {
    expect(strToPrice('100')).toBe(100)
  })
})

describe('strToUnits', () => {
  it('parses units with 3 decimal precision', () => {
    expect(strToUnits('57386.508')).toBe(57386.508)
  })

  it('parses units with commas', () => {
    expect(strToUnits('1,234.567')).toBe(1234.567)
  })

  it('rounds to 3 decimal places', () => {
    expect(strToUnits('100.5678')).toBe(100.568)
    expect(strToUnits('100.5671')).toBe(100.567)
  })

  it('handles whole unit numbers', () => {
    expect(strToUnits('500')).toBe(500)
  })
})
