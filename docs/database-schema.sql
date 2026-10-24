-- Proposed relational schema (portable SQL). Dialect notes:
--   PostgreSQL: use UUID for ids, TIMESTAMPTZ for times, JSONB for json columns.
--   MySQL 8:    use CHAR(36) for ids, DATETIME(3) for times, JSON for json columns.
-- ids are application-generated UUIDs. Always access with parameterized queries.

CREATE TABLE files (
  id            CHAR(36)      PRIMARY KEY,
  stored_name   VARCHAR(80)   NOT NULL,           -- internal only, never exposed by the API
  original_name VARCHAR(255)  NOT NULL,
  size_bytes    BIGINT        NOT NULL,
  extension     VARCHAR(32),
  declared_mime VARCHAR(255),
  detected_format VARCHAR(32) NOT NULL,
  detected_mime VARCHAR(255)  NOT NULL,
  detected_category VARCHAR(64) NOT NULL,
  type_mismatch BOOLEAN       NOT NULL DEFAULT FALSE,
  sha256        CHAR(64)      NOT NULL,
  md5           CHAR(32)      NOT NULL,
  file_deleted  BOOLEAN       NOT NULL DEFAULT FALSE,
  deleted_at    TIMESTAMP     NULL,
  uploaded_at   TIMESTAMP     NOT NULL
);
CREATE INDEX idx_files_sha256   ON files (sha256);
CREATE INDEX idx_files_uploaded ON files (uploaded_at);

CREATE TABLE analyses (
  id            CHAR(36)      PRIMARY KEY,
  file_id       CHAR(36)      NOT NULL,
  status        VARCHAR(32)   NOT NULL,          -- UPLOADED..COMPLETED|PARTIAL|FAILED|REJECTED
  stages        JSON          NOT NULL,          -- JSONB on PostgreSQL
  risk_score    SMALLINT      NULL,              -- NULL = insufficient evidence
  risk_level    VARCHAR(32)   NULL,
  confidence    VARCHAR(16)   NULL,
  assessment    JSON          NULL,
  report        JSON          NULL,
  error_code    VARCHAR(64)   NULL,
  error_message VARCHAR(500)  NULL,
  started_at    TIMESTAMP     NOT NULL,
  finished_at   TIMESTAMP     NULL,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE   -- "purge" = delete the file row
);
CREATE INDEX idx_analyses_file    ON analyses (file_id, started_at);
CREATE INDEX idx_analyses_status  ON analyses (status);
CREATE INDEX idx_analyses_risk    ON analyses (risk_level);

CREATE TABLE analysis_modules (
  id          BIGINT PRIMARY KEY,                -- AUTO_INCREMENT / GENERATED ALWAYS AS IDENTITY
  analysis_id CHAR(36)    NOT NULL,
  module      VARCHAR(32) NOT NULL,
  status      VARCHAR(16) NOT NULL,              -- completed|skipped|unavailable|failed|timeout
  reason      VARCHAR(500),
  duration_ms INTEGER,
  data        JSON,
  errors      JSON,
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);
CREATE INDEX idx_modules_analysis ON analysis_modules (analysis_id);

CREATE TABLE static_findings (
  id          BIGINT PRIMARY KEY,
  analysis_id CHAR(36)    NOT NULL,
  module      VARCHAR(32) NOT NULL,
  code        VARCHAR(64) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  severity    VARCHAR(8)  NOT NULL,              -- info|low|medium|high
  kind        VARCHAR(12) NOT NULL,              -- observed|heuristic
  description TEXT,
  evidence    JSON,
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);
CREATE INDEX idx_findings_analysis ON static_findings (analysis_id);
CREATE INDEX idx_findings_code     ON static_findings (code);

-- Future phase (sandbox). Empty until a sandbox adapter exists.
CREATE TABLE behavioral_evidence (
  id          BIGINT PRIMARY KEY,
  analysis_id CHAR(36)    NOT NULL,
  kind        VARCHAR(32) NOT NULL,              -- process|network|filesystem|command|registry|log|screenshot
  data        JSON        NOT NULL,
  observed_at TIMESTAMP   NULL,
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);
CREATE INDEX idx_behavior_analysis ON behavioral_evidence (analysis_id);
