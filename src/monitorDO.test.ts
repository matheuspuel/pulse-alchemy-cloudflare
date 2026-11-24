import { describe, expect, it } from '@effect/vitest'
import { DateTime, Duration } from 'effect'
import { step } from './monitorDO'

describe('monitorDO step', () => {
  it('count first failure', () => {
    const scheduledTime = DateTime.nowUnsafe()
    const outcome = step({
      state: {
        status: 'up',
        failures: 0,
        lastSchedule: null,
        stale: false,
      },
      check: {
        ok: false,
        scheduledTime,
        checkedAt: DateTime.nowUnsafe(),
        interval: Duration.minutes(1),
      },
      options: { failuresToDown: 3 },
    })
    expect(outcome).toEqual<typeof outcome>({
      applied: true,
      transition: null,
      state: {
        status: 'up',
        failures: 1,
        lastSchedule: scheduledTime,
        stale: false,
      },
    })
  })

  it('first failure with unknown status should stay unknown', () => {
    const scheduledTime = DateTime.nowUnsafe()
    const outcome = step({
      state: {
        status: 'unknown',
        failures: 0,
        lastSchedule: null,
        stale: false,
      },
      check: {
        ok: false,
        scheduledTime,
        checkedAt: DateTime.nowUnsafe(),
        interval: Duration.minutes(1),
      },
      options: { failuresToDown: 3 },
    })
    expect(outcome).toEqual({
      applied: true,
      transition: null,
      state: {
        status: 'unknown',
        failures: 1,
        lastSchedule: scheduledTime,
        stale: false,
      },
    })
  })

  it('three failures flip to down once', () => {
    const scheduledTime = DateTime.nowUnsafe()
    const outcome = step({
      state: {
        status: 'up',
        failures: 2,
        lastSchedule: null,
        stale: false,
      },
      check: {
        ok: false,
        scheduledTime,
        checkedAt: DateTime.nowUnsafe(),
        interval: Duration.minutes(1),
      },
      options: { failuresToDown: 3 },
    })
    expect(outcome).toEqual({
      applied: true,
      transition: 'down',
      state: {
        status: 'down',
        failures: 3,
        lastSchedule: scheduledTime,
        stale: false,
      },
    })
  })

  it('the fourth failure does not emit another transition', () => {
    const scheduledTime = DateTime.nowUnsafe()
    const outcome = step({
      state: {
        status: 'down',
        failures: 3,
        lastSchedule: null,
        stale: false,
      },
      check: {
        ok: false,
        scheduledTime,
        checkedAt: DateTime.nowUnsafe(),
        interval: Duration.minutes(1),
      },
      options: { failuresToDown: 3 },
    })
    expect(outcome).toEqual({
      applied: true,
      transition: null,
      state: {
        status: 'down',
        failures: 4,
        lastSchedule: scheduledTime,
        stale: false,
      },
    })
  })

  it('recovery after failures', () => {
    const scheduledTime = DateTime.nowUnsafe()
    const outcome = step({
      state: {
        status: 'down',
        failures: 4,
        lastSchedule: null,
        stale: false,
      },
      check: {
        ok: true,
        scheduledTime,
        checkedAt: DateTime.nowUnsafe(),
        interval: Duration.minutes(1),
      },
      options: { failuresToDown: 3 },
    })
    expect(outcome).toEqual({
      applied: true,
      transition: 'up',
      state: {
        status: 'up',
        failures: 0,
        lastSchedule: scheduledTime,
        stale: false,
      },
    })
  })

  it('a duplicate or older scheduledMinute is not applied', () => {
    const scheduledTime = DateTime.makeUnsafe('2025-01-01T00:00:00Z')
    const olderScheduledTime = DateTime.subtract(scheduledTime, { minutes: 1 })
    const initialState = {
      status: 'up',
      failures: 1,
      lastSchedule: scheduledTime,
      stale: false,
    } as const
    const duplicateOutcome = step({
      state: initialState,
      check: {
        ok: true,
        scheduledTime,
        checkedAt: DateTime.nowUnsafe(),
        interval: Duration.minutes(1),
      },
      options: { failuresToDown: 3 },
    })
    expect(duplicateOutcome).toEqual({
      applied: false,
      transition: null,
      state: initialState,
    })
    const olderOutcome = step({
      state: initialState,
      check: {
        ok: true,
        scheduledTime: olderScheduledTime,
        checkedAt: DateTime.nowUnsafe(),
        interval: Duration.minutes(1),
      },
      options: { failuresToDown: 3 },
    })
    expect(olderOutcome).toEqual({
      applied: false,
      transition: null,
      state: initialState,
    })
  })

  it('a stale monitor recovers on the next result', () => {
    const scheduledTime = DateTime.nowUnsafe()
    const outcome = step({
      state: {
        status: 'up',
        failures: 0,
        lastSchedule: null,
        stale: true,
      },
      check: {
        ok: true,
        scheduledTime,
        checkedAt: DateTime.nowUnsafe(),
        interval: Duration.minutes(1),
      },
      options: { failuresToDown: 3 },
    })
    expect(outcome).toEqual({
      applied: true,
      transition: null,
      state: {
        status: 'up',
        failures: 0,
        lastSchedule: scheduledTime,
        stale: false,
      },
    })
  })
})
