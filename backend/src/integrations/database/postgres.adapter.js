

// Converts a database row to a file record.
const toFile = (r) => r && ({ id: r.id, storedName: r.stored_name, originalName: r.original_name, size: Number(r.size_bytes), extension: r.extension,
  declaredMime: r.declared_mime, detected: { format: r.detected_format, mime: r.detected_mime, category: r.detected_category, signature: r.detected_signature },
  typeMismatch: r.type_mismatch, sha256: r.sha256, md5: r.md5, fileDeleted: r.file_deleted, deletedAt: r.deleted_at?.toISOString?.() ?? r.deleted_at ?? null, status: r.status, uploadedAt: r.uploaded_at?.toISOString?.() ?? r.uploaded_at });

const FILE_INSERT = `INSERT INTO files (id,stored_name,original_name,size_bytes,extension,declared_mime,detected_format,detected_mime,detected_category,detected_signature,type_mismatch,sha256,md5,file_deleted,deleted_at,status,uploaded_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`;

// Gets params.
const fileParams = (f) => [f.id,f.storedName,f.originalName,f.size,f.extension,f.declaredMime,f.detected?.format,f.detected?.mime,f.detected?.category,f.detected?.signature ?? null,!!f.typeMismatch,f.sha256,f.md5,!!f.fileDeleted,f.deletedAt ?? null,f.status,f.uploadedAt];

// Creates the PostgreSQL database adapter.
export function createPostgresAdapter({ url = process.env.DATABASE_URL, PoolClass = null } = {}) {
  let pool = null;
  let state = { status: 'not_configured', active: 'local_json_development_store' };

  // Connects connect operation.
  async function connect() {
    if (!url) return false;
    if (!pool) {
      try {
        let Pool = PoolClass;
        if (!Pool) ({ Pool } = await import('pg'));
        pool = new Pool({ connectionString: url, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000, max: 10, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
        pool.on('error',/* Handles the registered event. */ () => { state = { status: 'unavailable', active: 'postgresql' }; });
      } catch { state = { status: 'unavailable', active: 'local_json_development_store' }; return false; }
    }
    try { await pool.query('SELECT 1'); state = { status: 'connected', active: 'postgresql' }; return true; }
    catch { state = { status: 'unavailable', active: 'local_json_development_store' }; return false; }
  }

  // Handles repositories operation.
  function repositories() {
    const fileRepo = {

      // Creates a repository record.
      async create(f) { const { rows } = await pool.query(FILE_INSERT, fileParams(f)); return toFile(rows[0]); },

      // Finds a record by its ID.
      async getById(id) { const { rows } = await pool.query('SELECT * FROM files WHERE id=$1', [id]); return toFile(rows[0]); },

      // Updates a repository record.
      async update(id, patch) { const current = await this.getById(id); if (!current) throw new Error('File not found'); const f = { ...current, ...patch }; const { rows } = await pool.query(`UPDATE files SET stored_name=$2,original_name=$3,size_bytes=$4,extension=$5,declared_mime=$6,detected_format=$7,detected_mime=$8,detected_category=$9,detected_signature=$10,type_mismatch=$11,sha256=$12,md5=$13,file_deleted=$14,deleted_at=$15,status=$16,uploaded_at=$17 WHERE id=$1 RETURNING *`, fileParams(f)); return toFile(rows[0]); },

      // Removes a record or its stored file.
      async remove(id) { await pool.query('DELETE FROM files WHERE id=$1', [id]); },

      // Finds records with the matching SHA-256 digest.
      async findBySha256(hash) { const { rows } = await pool.query('SELECT * FROM files WHERE sha256=$1 ORDER BY uploaded_at DESC', [hash]); return rows.map(toFile); },

      // Lists matching stored records.
      async list({ page=1, pageSize=20, search='' }={}) { const q=`%${search}%`; const { rows } = await pool.query('SELECT * FROM files WHERE ($1=\'%%\' OR original_name ILIKE $1 OR id::text ILIKE $1) ORDER BY uploaded_at DESC LIMIT $2 OFFSET $3', [q,pageSize,(page-1)*pageSize]); const count=await pool.query('SELECT count(*)::int AS total FROM files WHERE ($1=\'%%\' OR original_name ILIKE $1 OR id::text ILIKE $1)',[q]); return { items: rows.map(toFile), total: count.rows[0].total }; },
    };
    const selectAnalysis = `SELECT a.*, f.original_name, f.size_bytes, f.extension, f.declared_mime, f.detected_format, f.detected_mime, f.detected_category, f.detected_signature, f.type_mismatch, f.sha256, f.md5, f.file_deleted, f.uploaded_at FROM analyses a JOIN files f ON f.id=a.file_id`;

    // Maps analysis.
    const mapAnalysis = (r) => r && ({ id:r.id,fileId:r.file_id,status:r.status,stages:r.stages,riskScore:r.risk_score,riskLevel:r.risk_level,confidence:r.confidence,assessment:r.assessment,
      startedAt:r.started_at?.toISOString?.() ?? r.started_at,finishedAt:r.finished_at?.toISOString?.() ?? r.finished_at,error:r.error_code?{code:r.error_code,message:r.error_message}:null,
      evidence:r.evidence,report:r.report,file:{id:r.file_id,originalName:r.original_name,size:Number(r.size_bytes),extension:r.extension,declaredMime:r.declared_mime,detected:{format:r.detected_format,mime:r.detected_mime,category:r.detected_category,signature:r.detected_signature},typeMismatch:r.type_mismatch,sha256:r.sha256,md5:r.md5,uploadedAt:r.uploaded_at?.toISOString?.() ?? r.uploaded_at,fileDeleted:r.file_deleted} });
    const analysisRepo = {

      // Creates a repository record.
      async create(a) { const { rows }=await pool.query('INSERT INTO analyses(id,file_id,status,stages,risk_score,risk_level,confidence,assessment,evidence,report,error_code,error_message,started_at,finished_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id',[a.id,a.fileId,a.status,a.stages,a.assessment?.riskScore??null,a.assessment?.riskLevel??null,a.assessment?.confidence??null,a.assessment??null,a.evidence??null,a.report??null,a.error?.code??null,a.error?.message??null,a.startedAt,a.finishedAt]); return (await this.getById(rows[0].id)); },

      // Finds a record by its ID.
      async getById(id) { const { rows }=await pool.query(`${selectAnalysis} WHERE a.id=$1`,[id]); return mapAnalysis(rows[0]); },

      // Updates a repository record.
      async update(id,p) { const old=await pool.query('SELECT * FROM analyses WHERE id=$1',[id]); if(!old.rows[0]) throw new Error('Analysis not found'); const r={...old.rows[0],...p}; await pool.query('UPDATE analyses SET status=$2,stages=$3,risk_score=$4,risk_level=$5,confidence=$6,assessment=$7,evidence=$8,report=$9,error_code=$10,error_message=$11,finished_at=$12 WHERE id=$1',[id,r.status,r.stages,r.assessment?.riskScore??null,r.assessment?.riskLevel??null,r.assessment?.confidence??null,r.assessment??null,r.evidence??null,r.report??null,r.error?.code??null,r.error?.message??null,r.finishedAt??null]); return this.getById(id); },

      // Lists matching stored records.
      async list({page=1,pageSize=20,status,risk,search='',fileId,sort='desc'}={}) { const order=sort==='asc'?'ASC':'DESC', q=`%${search}%`; const vals=[status??null,risk??null,q,fileId??null,pageSize,(page-1)*pageSize]; const where=`($1::text IS NULL OR a.status=$1) AND ($2::text IS NULL OR a.risk_level=$2) AND ($4::uuid IS NULL OR a.file_id=$4) AND ($3='%%' OR f.original_name ILIKE $3 OR a.id::text ILIKE $3 OR a.file_id::text ILIKE $3)`; const {rows}=await pool.query(`${selectAnalysis} WHERE ${where} ORDER BY a.started_at ${order} LIMIT $5 OFFSET $6`,vals); const count=await pool.query(`SELECT count(*)::int AS total FROM analyses a JOIN files f ON f.id=a.file_id WHERE ${where}`,vals.slice(0,4)); return {items:rows.map(mapAnalysis),total:count.rows[0].total}; },

      // Finds the active analysis for a file.
      async findActiveByFileId(id) { const {rows}=await pool.query(`${selectAnalysis} WHERE a.file_id=$1 AND a.status NOT IN ('COMPLETED','PARTIAL','FAILED','REJECTED') ORDER BY a.started_at DESC LIMIT 1`,[id]); return mapAnalysis(rows[0]); },

      // Finds the latest analysis for a file.
      async findLatestByFileId(id) { const {rows}=await pool.query(`${selectAnalysis} WHERE a.file_id=$1 ORDER BY a.started_at DESC LIMIT 1`,[id]); return mapAnalysis(rows[0]); },

      // Lists analyses that have not finished.
      async listNonTerminal() { const {rows}=await pool.query(`${selectAnalysis} WHERE a.status NOT IN ('COMPLETED','PARTIAL','FAILED','REJECTED')`); return rows.map(mapAnalysis); },

      // Removes analyses associated with a file.
      async removeByFileId(id) { await pool.query('DELETE FROM analyses WHERE file_id=$1',[id]); },

      // Marks the file as deleted in its analysis records.
      async markFileDeleted(id) {   void id; },
    };
    return { fileRepo, analysisRepo };
  }
  // Closes close operation.
  // Creates the configured repositories.
  // Returns the current service status.
  return {async getStatus() { if (await connect()) return state; return state; },async createRepositories() { if (!await connect()) throw new Error('PostgreSQL is unavailable'); return repositories(); },async close() { await pool?.end(); pool=null; } };
}
