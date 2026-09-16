import { describe, it, expect } from 'vitest'
import {
  durationMinutes, formatDuration, validatePermission,
  MAX_PERMISSIONS_PER_MONTH, MAX_PERMISSION_MINUTES,
} from './permission'

describe('durationMinutes', () => {
  it('computes a straightforward duration', () => {
    expect(durationMinutes('10:00', '11:00')).toBe(60)
  })
  it('returns 0 for a reversed range (to before from)', () => {
    expect(durationMinutes('11:00', '10:00')).toBe(0)
  })
  it('returns 0 for an equal from/to time', () => {
    expect(durationMinutes('10:00', '10:00')).toBe(0)
  })
  it('returns 0 when either time is missing', () => {
    expect(durationMinutes('', '11:00')).toBe(0)
    expect(durationMinutes('10:00', '')).toBe(0)
  })
})

describe('formatDuration', () => {
  it('formats minutes under an hour', () => { expect(formatDuration(45)).toBe('45m') })
  it('formats an exact hour', () => { expect(formatDuration(60)).toBe('1h') })
  it('formats hours and minutes', () => { expect(formatDuration(90)).toBe('1h 30m') })
  it('formats zero/negative as a dash', () => {
    expect(formatDuration(0)).toBe('—')
    expect(formatDuration(-5)).toBe('—')
  })
})

describe('validatePermission', () => {
  const base = { date: '2026-09-15', fromTime: '10:00', toTime: '11:00', reason: 'Bank work' }

  it('passes a valid request with remaining balance', () => {
    expect(validatePermission(base, 2)).toEqual({})
  })

  it('requires date, from time, to time and reason', () => {
    const errs = validatePermission({ date: '', fromTime: '', toTime: '', reason: '' }, 2)
    expect(errs.date).toBeTruthy()
    expect(errs.fromTime).toBeTruthy()
    expect(errs.toTime).toBeTruthy()
    expect(errs.reason).toBeTruthy()
  })

  it('rejects a reversed time range (case: to earlier than from)', () => {
    const errs = validatePermission({ ...base, fromTime: '11:00', toTime: '10:00' }, 2)
    expect(errs.toTime).toMatch(/after/i)
  })

  it('rejects an equal from/to time (zero duration)', () => {
    const errs = validatePermission({ ...base, fromTime: '10:00', toTime: '10:00' }, 2)
    expect(errs.toTime).toMatch(/after/i)
  })

  it(`rejects a duration greater than ${MAX_PERMISSION_MINUTES} minutes`, () => {
    const errs = validatePermission({ ...base, fromTime: '09:00', toTime: '11:01' }, 2)
    expect(errs.toTime).toBe('Maximum permission duration is 2 hours')
  })

  it('accepts a duration exactly at the 2-hour cap', () => {
    const errs = validatePermission({ ...base, fromTime: '09:00', toTime: '11:00' }, 2)
    expect(errs.toTime).toBeUndefined()
  })

  it('blocks submission with 0 remaining, case: 0 permissions left', () => {
    const errs = validatePermission(base, 0)
    expect(errs.limit).toMatch(/already used your 2 permissions/i)
  })

  it('allows submission with 1 remaining, case: 1 permission left', () => {
    const errs = validatePermission(base, 1)
    expect(errs.limit).toBeUndefined()
  })

  it(`allows submission with the full ${MAX_PERMISSIONS_PER_MONTH} remaining, case: 2 permissions left`, () => {
    const errs = validatePermission(base, MAX_PERMISSIONS_PER_MONTH)
    expect(errs.limit).toBeUndefined()
  })
})
