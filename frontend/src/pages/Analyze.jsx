import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UploadCloud, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '../services/api.js';
import { formatBytes, formatDate } from '../lib/format.js';
import { RiskBadge } from '../components/Badges.jsx';

export default function Analyze() {
  const navigate = useNavigate();
  const [caps, setCaps] = useState(null);
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const input = useRef(null);

  useEffect(() => { api.capabilities().then(setCaps).catch((e) => setError(e.message)); }, []);

  const pick = (f) => {
    setError(''); setResult(null); setProgress(0);
    if (f && caps && f.size > caps.upload.maxMb * 1048576) return setError(`File exceeds the ${caps.upload.maxMb} MB limit.`);
    setFile(f || null);
  };
  const upload = async () => {
    setBusy(true); setError('');
    try { setResult(await api.uploadFile(file, setProgress)); setFile(null); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  // Analysis is never started automatically: the user presses the button below.
  const start = async () => {
    setStarting(true); setError('');
    try { const { analysis } = await api.startAnalysis(result.id); navigate(`/analysis/${analysis.id}`); }
    catch (e) { setError(e.message); setStarting(false); }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Analyze File</h1>
      <p className="mt-1 text-sm text-slate-600">Files are validated and stored privately. Uploaded files are never executed. Analysis starts only when you press “Start analysis”.</p>

      <div
        role="button" tabIndex={0} aria-label="Select a file to upload"
        onClick={() => input.current.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        className={`mt-5 cursor-pointer rounded-xl border-2 border-dashed bg-white p-10 text-center ${drag ? 'border-blue-500 bg-blue-50' : 'border-slate-300'}`}>
        <UploadCloud className="mx-auto text-blue-600" size={32} />
        <p className="mt-2 text-sm font-medium">Drag a file here or click to browse</p>
        {caps && <p className="mt-1 text-xs text-slate-500">Maximum size: {caps.upload.maxMb} MB</p>}
        <input ref={input} type="file" className="hidden" onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
      </div>

      {caps && <p className="mt-3 text-xs text-slate-500">Supported: {caps.upload.categories.join(', ')}.</p>}

      {file && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <span className="truncate"><strong>{file.name}</strong> · {formatBytes(file.size)}</span>
          <button aria-label="Remove file" disabled={busy} onClick={() => setFile(null)}><X size={16} /></button>
        </div>
      )}
      {file && (
        <button onClick={upload} disabled={busy} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? `Uploading… ${progress}%` : 'Upload'}
        </button>
      )}
      {busy && <div className="mt-3 h-2 rounded bg-slate-200"><div className="h-2 rounded bg-blue-600" style={{ width: `${progress}%` }} /></div>}

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
      {result && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-green-800"><CheckCircle2 size={16} /> Upload validated</p>
          <dl className="mt-2 space-y-1 text-slate-700">
            <div><dt className="inline text-slate-500">File ID: </dt><dd className="inline font-mono text-xs">{result.id}</dd></div>
            <div><dt className="inline text-slate-500">Detected type: </dt><dd className="inline">{result.detected.category} ({result.detected.mime})</dd></div>
            <div><dt className="inline text-slate-500">SHA-256: </dt><dd className="inline break-all font-mono text-xs">{result.sha256}</dd></div>
          </dl>
          {result.typeMismatch && <p className="mt-2 text-amber-800">The file extension does not match its detected content. This is recorded as a finding.</p>}
          {result.priorAnalysis && (
            <p className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-blue-900">
              An identical file (same SHA-256) was already analyzed on {formatDate(result.priorAnalysis.analyzedAt)}: <RiskBadge level={result.priorAnalysis.riskLevel} />{' '}
              <Link className="underline" to={`/reports/${result.priorAnalysis.analysisId}`}>View that report</Link>. You can still run a fresh analysis below.
            </p>
          )}
          <button onClick={start} disabled={starting} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {starting ? 'Starting…' : 'Start analysis'}
          </button>
        </div>
      )}
    </div>
  );
}
