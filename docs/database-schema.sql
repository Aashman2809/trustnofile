CREATE TABLE files (
  id UUID PRIMARY KEY,
  stored_name VARCHAR(80) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  size_bytes BIGINT NOT NULL,
  extension VARCHAR(32),
  declared_mime VARCHAR(255),
  detected_format VARCHAR(32) NOT NULL,
  detected_mime VARCHAR(255) NOT NULL,
  detected_category VARCHAR(64) NOT NULL,
  detected_signature VARCHAR(100),
  type_mismatch BOOLEAN NOT NULL DEFAULT FALSE,
  sha256 CHAR(64) NOT NULL,
  md5 CHAR(32) NOT NULL,
  file_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
  uploaded_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_files_sha256 ON files (sha256);
CREATE INDEX idx_files_uploaded ON files (uploaded_at);

CREATE TABLE analyses (
  id UUID PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL,
  stages JSONB NOT NULL,
  risk_score SMALLINT,
  risk_level VARCHAR(32),
  confidence VARCHAR(16),
  assessment JSONB,
  evidence JSONB,
  report JSONB,
  error_code VARCHAR(64),
  error_message VARCHAR(500),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_analyses_file ON analyses (file_id, started_at);
CREATE INDEX idx_analyses_status ON analyses (status);
CREATE INDEX idx_analyses_risk ON analyses (risk_level);

CREATE TABLE analysis_modules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  module VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  reason VARCHAR(500),
  duration_ms INTEGER,
  data JSONB,
  errors JSONB
);
CREATE INDEX idx_modules_analysis ON analysis_modules (analysis_id);

CREATE TABLE static_findings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  module VARCHAR(32) NOT NULL,
  code VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  severity VARCHAR(8) NOT NULL,
  kind VARCHAR(12) NOT NULL,
  description TEXT,
  evidence JSONB
);
CREATE INDEX idx_findings_analysis ON static_findings (analysis_id);
CREATE INDEX idx_findings_code ON static_findings (code);

CREATE TABLE behavioral_evidence (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL,
  data JSONB NOT NULL,
  observed_at TIMESTAMPTZ
);
CREATE INDEX idx_behavior_analysis ON behavioral_evidence (analysis_id);
