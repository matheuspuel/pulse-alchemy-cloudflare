CREATE TABLE monitors (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  interval_seconds INTEGER NOT NULL DEFAULT 60,
  created_at TEXT NOT NULL
);
