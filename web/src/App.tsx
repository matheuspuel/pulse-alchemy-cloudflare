import { DateTime, Duration } from 'effect'
import React from 'react'
import './App.css'
import { useLiveMonitors } from './hooks/liveMonitors'

export default function App() {
  const monitors = useLiveMonitors()
  const [now, setNow] = React.useState(() => DateTime.nowUnsafe())
  const list = monitors.state.list
  const operationalCount = list.filter(
    ({ state }) => state.status === 'up' && !state.stale,
  ).length
  const attentionCount = list.filter(
    ({ state }) => state.status === 'down' || state.stale,
  ).length

  React.useEffect(() => {
    const interval = setInterval(() => setNow(DateTime.nowUnsafe()), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <main className="dashboard">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Pulse home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path
                d="M4 17h6l3.2-8 5.2 15 3.1-7H28"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>Pulse</span>
        </a>
        <div
          className={`connection ${monitors.connected ? 'is-connected' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span className="connection-dot" />
          {monitors.connected ? 'Live connection' : 'Reconnecting'}
        </div>
      </header>

      <section className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">OVERVIEW</p>
            <h1>Monitor dashboard</h1>
            <p className="page-description">
              A live look at the health and performance of your services.
            </p>
          </div>
          <div className="updated-note">
            <span className="updated-indicator" />
            Updating in real time
          </div>
        </div>

        <section className="summary-grid" aria-label="Monitor summary">
          <article className="summary-card">
            <div className="summary-topline">
              <span className="summary-label">Total monitors</span>
              <span
                className="summary-icon summary-icon-violet"
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M4.5 12h15M12 4c2.2 2.2 3.2 4.9 3.2 8S14.2 17.8 12 20c-2.2-2.2-3.2-4.9-3.2-8S9.8 6.2 12 4Z" />
                </svg>
              </span>
            </div>
            <p className="summary-value">{list.length}</p>
            <p className="summary-footnote">Services being watched</p>
          </article>

          <article className="summary-card">
            <div className="summary-topline">
              <span className="summary-label">Operational</span>
              <span
                className="summary-icon summary-icon-green"
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="m6 12 4 4 8-8" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              </span>
            </div>
            <p className="summary-value">{operationalCount}</p>
            <p className="summary-footnote">Responding normally</p>
          </article>

          <article className="summary-card">
            <div className="summary-topline">
              <span className="summary-label">Needs attention</span>
              <span
                className="summary-icon summary-icon-amber"
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 8v5m0 3h.01" />
                  <path d="M10.3 4.9 2.8 18a1.5 1.5 0 0 0 1.3 2.2h15.8a1.5 1.5 0 0 0 1.3-2.2L13.7 4.9a2 2 0 0 0-3.4 0Z" />
                </svg>
              </span>
            </div>
            <p className="summary-value">{attentionCount}</p>
            <p className="summary-footnote">Down or reporting stale data</p>
          </article>
        </section>

        <section className="monitors-section" aria-labelledby="monitors-title">
          <div className="section-heading">
            <div>
              <h2 id="monitors-title">Your monitors</h2>
              <p>Health checks and recent response times</p>
            </div>
            <span className="monitor-count">
              {list.length} {list.length === 1 ? 'service' : 'services'}
            </span>
          </div>

          {list.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="17" />
                  <path d="M8 24h9l4-8 6 16 4-8h9" />
                </svg>
              </span>
              <h3>No monitors yet</h3>
              <p>
                When a service is added, its live health and response time will
                appear here.
              </p>
            </div>
          ) : (
            <div className="monitor-grid">
              {list.map(({ monitor, state }) => {
                const status = state.stale ? 'stale' : state.status
                const statusLabel = state.stale
                  ? 'Stale'
                  : state.status === 'up'
                    ? 'Operational'
                    : state.status === 'down'
                      ? 'Down'
                      : 'Waiting'

                return (
                  <article className="monitor-card" key={monitor.id}>
                    <div className="monitor-card-heading">
                      <span className="service-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="8.5" />
                          <path d="M3.8 12h16.4M12 3.5c2.3 2.3 3.4 5.1 3.4 8.5s-1.1 6.2-3.4 8.5c-2.3-2.3-3.4-5.1-3.4-8.5S9.7 5.8 12 3.5Z" />
                        </svg>
                      </span>
                      <span className={`status-pill status-${status}`}>
                        <span className="status-dot" />
                        {statusLabel}
                      </span>
                    </div>

                    <h3 className="monitor-url" title={monitor.url}>
                      {monitor.url}
                    </h3>
                    <div className="monitor-metrics">
                      <div className="metric">
                        <span className="metric-label">Response time</span>
                        <span className="metric-value">
                          {state.lastLatency
                            ? Duration.format(state.lastLatency)
                            : '—'}
                        </span>
                      </div>
                      <div className="metric">
                        <span className="metric-label">Last checked</span>
                        <span className="metric-value">
                          {state.lastCheckedAt
                            ? `${Duration.format(
                                Duration.max(
                                  roundDuration(
                                    DateTime.distance(state.lastCheckedAt, now),
                                  ),
                                  Duration.zero,
                                ),
                              )} ago`
                            : 'Not checked yet'}
                        </span>
                      </div>
                    </div>
                    <div className="monitor-card-footer">
                      <span>
                        Checks every {Duration.format(monitor.interval)}
                      </span>
                      <span
                        className={
                          state.failures > 0
                            ? 'failure-count has-failures'
                            : 'failure-count'
                        }
                      >
                        {state.failures} consecutive{' '}
                        {state.failures === 1 ? 'failure' : 'failures'}
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
        <footer className="page-footer">
          <span>Pulse monitor</span>
          <span>Live service health at a glance</span>
        </footer>
      </section>
    </main>
  )
}

const roundDuration = (duration: Duration.Duration) =>
  Duration.match(duration, {
    onInfinity: () => duration,
    onNegativeInfinity: () => duration,
    onMillis: ms => Duration.millis(Math.round(ms / 1000) * 1000),
    onNanos: nanos => Duration.millis(Math.round(Number(nanos) / 1_000_000)),
  })
