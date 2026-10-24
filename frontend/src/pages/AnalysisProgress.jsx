import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Circle, Loader2, MinusCircle, XCircle, AlertTriangle } from 'lucide-react';
import { api } from '../services/api.js';

const TERMINAL = ['COMPLETED', 'PARTIAL', 'FAILED', 'REJECTED'];
const LABELS = {
  upload: 'Upload complete', validation: 'File validation', static_analysis: 'Static analysis',
  evidence_aggregation: 'Evidence aggregation', risk_assessment: 'Risk assessment', report_generation: 'Report generation',
};
const ICON = {
  completed: <CheckCircle2 size={20} className="text-green-600" aria-label="completed" />,
  active: <Loader2 size={20} className="animate-spin text-blue-600" aria-label="in progress" />,
  failed: <XCircle size={20} className="text-red-600" aria-label="failed" />,
  skipped: <MinusCircle size={20} className="text-slate-400" aria-label="skipped" />,
  pending: <Circle size={20} className="text-slate-300" aria-label="pending" />,
};
const POLL_MS = 1000, TIMEOUT_MS = 120000;

export default function AnalysisProgress() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [timedOut, setTimedOut] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const [retrying, setRetrying] = useState(false);

  // Polls the real backend status. Stops on terminal state, unmount, repeated errors, or timeout.
  useEffect(() => {
    let cancelled = false, timer, failures = 0;
    const started = Date.now();
    const tick = async () => {
      try {
        const { analysis: a } = await api.getAnalysis(id);
        if (cancelled) return;
        setAnalysis(a); setError(''); failures = 0;
        if (TERMINAL.includes(a.status)) return;
      } catch (e) {
        if (cancelled) return;
        failures += 1; setError(e.message);
        if (failures >= 5 || /No analysis/.test(e.message)) return;
      }
      if (Date.now() - started > TIMEOUT_MS) { setTimedOut(true); return; }
      timer = setTimeout(tick, POLL_MS);
    };
    setTimedOut(false);
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id, pollKey]);

  const retry = async () => {
    setRetrying(true);
    try { const { analysis: next } = await api.startAnalysis(analysis.fileId, true); setRetrying(false); setAnalysis(null); navigate(`/analysis/${next.id}`); }
    catch (e) { setError(e.message); setRetrying(false); }
  };

  const done = analysis && TERMINAL.includes(analysis.status);
  const bad = analysis && ['FAILED', 'REJECTED'].includes(analysis.status);

  return (
    <div className="max-w-2xl">
      <nav className="text-xs text-slate-500" aria-label="Breadcrumb"><Link to="/analyze" className="hover:underline">Analyze File</Link> / Analysis</nav>
      <h1 className="mt-1 text-2xl font-semibold">Analysis progress</h1>
      {analysis && <p className="mt-1 text-sm text-slate-600">{analysis.file.originalName} · <span className="font-mono text-xs">{analysis.id}</span></p>}

      {!analysis && !error && <p className="mt-6 text-sm text-slate-500">Loading status…</p>}
      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {analysis && (
        <ol className="mt-5 space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {analysis.stages.map((s) => (
            <li key={s.name} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5">{ICON[s.status] || ICON.pending}</span>
              <span>
                <span className={s.status === 'pending' ? 'text-slate-400' : 'font-medium'}>{LABELS[s.name] || s.name}</span>
                <span className="ml-2 text-xs text-slate-500">{s.status}</span>
                {s.note && <span className="block text-xs text-slate-500">{s.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      {timedOut && (
        <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Still running after 2 minutes. The analysis may be slow or the backend may have stopped.
          <button onClick={() => setPollKey((k) => k + 1)} className="ml-2 font-medium underline">Keep waiting</button>
        </div>
      )}

      {done && !bad && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-medium text-green-800">{analysis.status === 'PARTIAL' ? 'Analysis finished with partial results' : 'Analysis complete'}</p>
          {analysis.status === 'PARTIAL' && <p className="mt-1 text-amber-900">One or more modules failed. The report shows which, and results should be read with that in mind.</p>}
          <Link to={`/reports/${analysis.id}`} className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">View report</Link>
        </div>
      )}

      {bad && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">{analysis.status === 'REJECTED' ? 'The file was rejected during validation' : 'The analysis failed'}</p>
          <p className="mt-1">{analysis.error?.message || 'No further details are available.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {analysis.status === 'FAILED' && (
              <button onClick={retry} disabled={retrying} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {retrying ? 'Retrying…' : 'Retry analysis'}
              </button>
            )}
            <Link to="/analyze" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">Upload a file again</Link>
          </div>
        </div>
      )}
    </div>
  );
}
