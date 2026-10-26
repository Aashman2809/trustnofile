import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSearch, ShieldAlert, ShieldCheck, Shield, Files, AlertTriangle } from 'lucide-react';
import { api } from '../services/api.js';
import { AnalysisStatusBadge, RiskBadge } from '../components/Badges.jsx';
import { formatBytes, formatDate } from '../lib/format.js';

const Stat = ({ icon: Icon, label, value, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 text-xs text-slate-500"><Icon size={16} className={tone} />{label}</div>
    <div className="mt-1 text-2xl font-semibold">{value}</div>
  </div>
);

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.getStats().then(setStats).catch((e) => setError(e.message)); }, []);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="overview-hero flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Welcome to TrustNoFile</h1>
          <p className="mt-1 text-sm text-slate-600">Static analysis of untrusted files, with optional isolated Linux ELF behavior analysis. Files are never executed on the host.</p>
        </div>
        <Link to="/analyze" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"><FileSearch size={16} /> Analyze a File</Link>
      </div>

      {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> Could not load statistics: {error}</p>}
      {!stats && !error && <p className="text-sm text-slate-500">Loading statistics…</p>}

      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Files} label="Files analyzed" value={stats.filesAnalyzed} tone="text-blue-600" />
            <Stat icon={ShieldAlert} label="High-risk assessments" value={stats.byRisk.high + stats.byRisk.very_high} tone="text-red-600" />
            <Stat icon={Shield} label="Medium-risk assessments" value={stats.byRisk.moderate} tone="text-amber-600" />
            <Stat icon={ShieldCheck} label="Low-risk assessments" value={stats.byRisk.low} tone="text-green-600" />
          </div>
          <p className="text-xs text-slate-500">Counts include finished analyses stored in {stats.persistence === 'postgresql' ? 'PostgreSQL' : 'the local development store, which is not durable'}. “Low” means no strong indicators were found, not that a file is safe.
            {stats.byRisk.insufficient_evidence > 0 && ` ${stats.byRisk.insufficient_evidence} assessment(s) had insufficient evidence.`}</p>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Recent analyses</h2>
              {stats.totalAnalyses > 0 && <Link to="/history" className="text-sm text-blue-700 hover:underline">View all</Link>}
            </div>
            {stats.recent.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-600">
                <p>No analyses yet. Upload a file to see results here.</p>
                <Link to="/analyze" className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white">Upload a file</Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500"><tr><th className="py-2 pr-3">File</th><th className="pr-3">Type</th><th className="pr-3">Size</th><th className="pr-3">Uploaded</th><th className="pr-3">Status</th><th className="pr-3">Risk</th><th /></tr></thead>
                  <tbody>
                    {stats.recent.map((a) => (
                      <tr key={a.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-medium">{a.file.originalName}</td>
                        <td className="pr-3">{a.file.detected?.category || '—'}</td>
                        <td className="pr-3">{formatBytes(a.file.size)}</td>
                        <td className="pr-3">{formatDate(a.file.uploadedAt)}</td>
                        <td className="pr-3"><AnalysisStatusBadge status={a.status} /></td>
                        <td className="pr-3">{a.assessment ? <RiskBadge level={a.assessment.riskLevel} /> : '—'}</td>
                        <td><Link className="text-blue-700 hover:underline" to={a.reportAvailable ? `/reports/${a.id}` : `/analysis/${a.id}`}>{a.reportAvailable ? 'Report' : 'Status'}</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">How the analysis workflow works</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>The file is uploaded, size-checked and identified by its signature, not its extension.</li>
          <li>Independent modules inspect it without running it: hashes, metadata, strings, entropy, archive structure, and optional YARA rules.</li>
          <li>A deterministic, explainable rule set turns the evidence into a heuristic risk score.</li>
          <li>The optional AI layer reviews minimized evidence; application policy may request an isolated sandbox run for eligible Linux executables.</li>
          <li>A report lists static and behavioral findings separately, along with unavailable stages and assessment limits.</li>
        </ol>
      </section>
    </div>
  );
}
