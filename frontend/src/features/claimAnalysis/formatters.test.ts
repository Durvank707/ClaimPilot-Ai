import { describe, expect, it } from 'vitest'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatWaitingAge,
  getNumber,
  getString,
  to0to100,
} from './formatters'

describe('formatters', () => {
  it('formatPercent treats 0-1 as fractions and others as points', () => {
    expect(formatPercent(0.375)).toBe('37.5%')
    expect(formatPercent(37.5)).toBe('37.5%')
    expect(formatPercent(null)).toBeNull()
    expect(formatPercent('x')).toBeNull()
    expect(formatPercent(NaN)).toBeNull()
    expect(formatPercent(Infinity)).toBeNull()
  })

  it('formatCurrency formats USD', () => {
    expect(formatCurrency(11076.093)).toMatch(/USD|11,076.09/)
    expect(formatCurrency(null)).toBeNull()
    expect(formatCurrency('x')).toBeNull()
  })

  it('formatNumber formats with decimals', () => {
    expect(formatNumber(11076.093, 2)).toBe('11076.09')
    expect(formatNumber(-0.0473, 3)).toBe('-0.047')
    expect(formatNumber(null)).toBeNull()
  })

  it('to0to100 returns 0-100 or null', () => {
    expect(to0to100(0.375)).toBe(37.5)
    expect(to0to100(37.5)).toBe(37.5)
    expect(to0to100(-1)).toBeNull()
    expect(to0to100(101)).toBeNull()
    expect(to0to100(NaN)).toBeNull()
  })

  it('getString returns string or null', () => {
    expect(getString({ a: 'x' }, 'a')).toBe('x')
    expect(getString({ a: '   ' }, 'a')).toBeNull()
    expect(getString({}, 'a')).toBeNull()
    expect(getString({ a: 5 }, 'a')).toBeNull()
  })

  it('getNumber returns number or null', () => {
    expect(getNumber({ a: 5 }, 'a')).toBe(5)
    expect(getNumber({ a: '5.5' }, 'a')).toBe(5.5)
    expect(getNumber({ a: 'x' }, 'a')).toBeNull()
    expect(getNumber({}, 'a')).toBeNull()
  })

  it('formatDate formats calendar dates and naive UTC datetimes', () => {
    expect(formatDate('2024-05-01')).toBe('May 1, 2024')
    expect(formatDate('2024-05-01T10:30:00')).toBe('May 1, 2024, 10:30 AM')
    expect(formatDate('2024-05-01T10:30:00Z')).toBe('May 1, 2024, 10:30 AM')
    expect(formatDate('2024-05-01T10:30:00+02:00')).toBe('May 1, 2024, 8:30 AM')
  })

  it('formatDate returns null for missing values and the raw string when unparseable', () => {
    expect(formatDate(null)).toBeNull()
    expect(formatDate(undefined)).toBeNull()
    expect(formatDate('')).toBeNull()
    expect(formatDate('   ')).toBeNull()
    expect(formatDate(123)).toBeNull()
    expect(formatDate('not a date')).toBe('not a date')
  })

  it('formatWaitingAge describes elapsed time in coarse units', () => {
    const now = new Date('2024-06-01T12:00:00Z')
    expect(formatWaitingAge('2024-06-01T11:59:00Z', now)).toBe('Less than an hour')
    expect(formatWaitingAge('2024-06-01T09:00:00Z', now)).toBe('3 hours')
    expect(formatWaitingAge('2024-06-01T11:00:00Z', now)).toBe('1 hour')
    expect(formatWaitingAge('2024-05-31T12:00:00Z', now)).toBe('1 day')
    expect(formatWaitingAge('2024-05-25T12:00:00Z', now)).toBe('7 days')
    expect(formatWaitingAge('2024-05-11T12:00:00Z', now)).toBe('3 weeks')
    expect(formatWaitingAge('2024-03-01T12:00:00Z', now)).toBe('3 months')
  })

  it('formatWaitingAge treats naive timestamps as UTC and handles missing values', () => {
    const now = new Date('2024-06-01T12:00:00Z')
    expect(formatWaitingAge('2024-06-01T09:00:00', now)).toBe('3 hours')
    expect(formatWaitingAge(null)).toBeNull()
    expect(formatWaitingAge(undefined)).toBeNull()
    expect(formatWaitingAge('')).toBeNull()
    expect(formatWaitingAge('   ')).toBeNull()
    expect(formatWaitingAge(123)).toBeNull()
    expect(formatWaitingAge('not a date', now)).toBeNull()
    // A future timestamp never produces a negative age.
    expect(formatWaitingAge('2024-07-01T12:00:00Z', now)).toBe('Less than an hour')
  })
})