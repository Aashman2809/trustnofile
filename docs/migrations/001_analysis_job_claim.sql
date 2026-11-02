-- Apply once to existing Supabase PostgreSQL before deploying SQS workers.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS job_claimed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_analyses_unclaimed ON analyses (started_at) WHERE status = 'UPLOADED' AND job_claimed_at IS NULL;
