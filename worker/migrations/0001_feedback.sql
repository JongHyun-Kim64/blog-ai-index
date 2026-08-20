CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  question TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('helpful', 'not_helpful')),
  post_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at
  ON feedback(created_at);

CREATE INDEX IF NOT EXISTS idx_feedback_rating_created_at
  ON feedback(rating, created_at);

CREATE INDEX IF NOT EXISTS idx_feedback_post_created_at
  ON feedback(post_id, created_at);
