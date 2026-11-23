import { describe, it, expect } from 'vitest'
import {
  durationMinutes, formatDuration, validatePermission,
  MAX_PERMISSIONS_PER_MONTH, MAX_PERMISSION_MINUTES, weekBounds, computeCompensation,
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


describe('weekBounds', () => {
  it('returns Monday–Sunday for a midweek date', () => {
    expect(weekBounds('2026-11-25')).toEqual({ start: '2026-11-23', end: '2026-11-29' })  // Wed
  })
  it('treats Sunday as the end of the week, not the start', () => {
    expect(weekBounds('2026-11-29')).toEqual({ start: '2026-11-23', end: '2026-11-29' })
  })
  it('handles a week spanning a month boundary', () => {
    expect(weekBounds('2026-12-01')).toEqual({ start: '2026-11-30', end: '2026-12-06' })
  })
})

describe('computeCompensation', () => {
  const week = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']
  const att = (hours) => week.map((date, i) => ({ date, total_hours: hours[i] }))
  const base = { requestDate: '2026-11-25', location: 'India', today: '2026-11-30' }

  it('is compensated when a 2h-short day is made up on other days', () => {
    const c = computeCompensation({ ...base, attendance: att([9, 9, 6, 8, 8]) })
    expect(c).toMatchObject({ status: 'compensated', target: 40, worked: 40, shortfall: 0 })
  })
  it('is not compensated once the week has ended short', () => {
    const c = computeCompensation({ ...base, attendance: att([8, 8, 6, 8, 8]) })
    expect(c).toMatchObject({ status: 'short', shortfall: 2 })
  })
  it('is in progress while the week is still running', () => {
    const c = computeCompensation({ ...base, today: '2026-11-26', attendance: att([8, 8, 6, 0, 0]) })
    expect(c).toMatchObject({ status: 'in_progress', shortfall: 18 })
  })
  it('counts weekend hours toward the week', () => {
    const c = computeCompensation({ ...base, attendance: [...att([8, 8, 6, 8, 8]), { date: '2026-11-28', total_hours: 2 }] })
    expect(c.status).toBe('compensated')
  })
  it('drops holidays for the employee region (and All) from the target', () => {
    const holidays = [
      { holiday_date: '2026-11-23', region: 'All' },
      { holiday_date: '2026-11-24', region: 'United States' },   // not India — still a workday
    ]
    const c = computeCompensation({ ...base, holidays, attendance: att([0, 8, 6, 8, 10]) })
    expect(c).toMatchObject({ target: 32, worked: 32, status: 'compensated' })
  })
  it('drops full and half-day approved leave from the target', () => {
    const leaves = [
      { from_date: '2026-11-26', to_date: '2026-11-27', days: 2 },
      { from_date: '2026-11-23', to_date: '2026-11-23', days: 0.5 },
    ]
    const c = computeCompensation({ ...base, leaves, attendance: att([4, 8, 6, 0, 0]) })
    expect(c).toMatchObject({ target: 20, worked: 18, shortfall: 2, status: 'short' })
  })
  it('ignores attendance outside the week', () => {
    const c = computeCompensation({ ...base, attendance: [...att([8, 8, 6, 8, 8]), { date: '2026-11-30', total_hours: 5 }] })
    expect(c.status).toBe('short')
  })
})
