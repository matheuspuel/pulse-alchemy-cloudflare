CREATE TABLE checks (
  monitor_id TEXT NOT NULL REFERENCES monitors(id),
  scheduled_minute TEXT NOT NULL,
  ok INTEGER NOT NULL,
  status_code INTEGER,
  latency_ms INTEGER,
  error TEXT,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (monitor_id, scheduled_minute)
);
