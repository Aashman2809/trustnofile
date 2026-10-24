import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Search } from 'lucide-react';
import { api } from '../services/api.js';
import { AnalysisStatusBadge, RiskBadge } from '../components/Badges.jsx';
import { formatBytes, formatDate } from '../lib/format.js';

const STATUSES = ['COMPLETED', 'PARTIAL', 'FAILED', 'REJECTED'];
const RISKS = [['low', 'Low'], ['moderate', 'Moderate'], ['high', 'High'], ['very_high', 'Very high'], ['insufficient_evidence', 'Insufficient evidence']];
const PAGE_SIZE = 20;

export default function History() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [risk, setRisk] = useState('');
  const [sort, setSort] = useState('desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    api.listAnalyses({ search: debounced, status, risk, sort, page, pageSize: PAGE_SIZE })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [debounced, status, risk, sort, page]);

  const onFilter = (setter) => (e) => { setter(e.target.value); setPage(1); };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filtered = debounced || status || risk;
  const sel = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Analysis History</h1>
        <p className="mt-1 text-xs text-slate-500">History comes from the local development store (JSON files). It is not durable, is not suited to concurrent or production use, and can be lost if the data folder is cleared.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[220px] flex-1 text-xs text-slate-500">Search by filename or ID
          <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5"><Search size={14} className="text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. invoice.pdf" className="w-full bg-transparent text-sm text-slate-900 outline-none" /></span></label>
        <label className="text-xs text-slate-500">Status<select value={status} onChange={onFilter(setStatus)} className={`mt-1 block ${sel}`}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}</select></label>
        <label className="text-xs text-slate-500">Risk<select value={risk} onChange={onFilter(setRisk)} className={`mt-1 block ${sel}`}><option value="">All</option>{RISKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="text-xs text-slate-500">Date<select value={sort} onChange={onFilter(setSort)} className={`mt-1 block ${sel}`}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label>
      </div>

      {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}</p>}
      {!data && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {data && data.items.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          {filtered ? <p>No analyses match these filters.</p> : <><p>No analyses yet.</p><Link to="/analyze" className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white">Analyze a file</Link></>}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500"><tr><th className="p-3">File</th><th className="pr-3">Size</th><th className="pr-3">Started</th><th className="pr-3">Status</th><th className="pr-3">Risk</th><th className="pr-3">Score</th><th /></tr></thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 align-top">
                  <td className="p-3"><div className="font-medium">{a.file.originalName}</div><div className="font-mono text-xs text-slate-500">{a.id}</div>
                    {a.error && <div className="mt-1 text-xs text-red-700">{a.error.message}</div>}</td>
                  <td className="pr-3">{formatBytes(a.file.size)}</td>
                  <td className="pr-3">{formatDate(a.startedAt)}</td>
                  <td className="pr-3"><AnalysisStatusBadge status={a.status} /></td>
                  <td className="pr-3">{a.assessment ? <RiskBadge level={a.assessment.riskLevel} /> : '—'}</td>
                  <td className="pr-3">{a.assessment?.riskScore ?? '—'}</td>
                  <td className="pr-3"><Link className="text-blue-700 hover:underline" to={a.reportAvailable ? `/reports/${a.id}` : `/analysis/${a.id}`}>{a.reportAvailable ? 'Open report' : 'View status'}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Page {page} of {pages} · {data.total} results</span>
          <span className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50">Previous</button>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50">Next</button>
          </span>
        </div>
      )}
    </div>
  );
}
