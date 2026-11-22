import { DateTime, Duration } from 'effect'

export const isDue = (
  scheduledAt: DateTime.DateTime,
  interval: Duration.Duration,
): boolean => {
  const stepMinutes = Math.floor(Duration.toMinutes(interval))
  const scheduledMinute = Math.floor(
    DateTime.toEpochMillis(scheduledAt) / 60_000,
  )
  return scheduledMinute % stepMinutes === 0
}
