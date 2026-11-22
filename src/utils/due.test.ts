import { describe, expect, it } from '@effect/vitest'
import { DateTime, Duration } from 'effect'
import { isDue } from './due'

describe('isDue', () => {
  it('should always be true for 1 minute step', () => {
    expect(
      isDue(
        DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
        Duration.fromInputUnsafe('1 minute'),
      ),
    ).toBe(true)
    expect(
      isDue(
        DateTime.makeUnsafe('2026-01-01T11:11:11Z'),
        Duration.fromInputUnsafe('1 minute'),
      ),
    ).toBe(true)
  })

  it('should be true when match 5 minute step', () => {
    expect(
      isDue(
        DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
        Duration.fromInputUnsafe('5 minute'),
      ),
    ).toBe(true)
    expect(
      isDue(
        DateTime.makeUnsafe('2026-01-01T00:05:00Z'),
        Duration.fromInputUnsafe('5 minute'),
      ),
    ).toBe(true)
  })

  it('should be false when not match 5 minute step', () => {
    expect(
      isDue(
        DateTime.makeUnsafe('2026-01-01T00:01:00Z'),
        Duration.fromInputUnsafe('5 minute'),
      ),
    ).toBe(false)
    expect(
      isDue(
        DateTime.makeUnsafe('2026-01-01T00:04:00Z'),
        Duration.fromInputUnsafe('5 minute'),
      ),
    ).toBe(false)
  })
})
