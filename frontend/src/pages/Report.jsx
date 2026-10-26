import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileText, ShieldAlert, ListChecks, Bot, Box, Lightbulb, AlertTriangle } from 'lucide-react';
import { api } from '../services/api.js';
import { RiskBadge, SeverityBadge, ModuleStatusBadge } from '../components/Badges.jsx';
import { formatBytes, formatDate } from '../lib/format.js';

const Section = ({ id, icon: Icon, title, children }) => (
  <section aria-labelledby={id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 id={id} className="mb-3 flex items-center gap-2 text-base font-semibold"><Icon size={18} className="text-blue-600" />{title}</h2>
    {children}
  </section>
);
const Field = ({ label, children, mono }) => (
  <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-0.5 break-all ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{children}</dd></div>
);

export default function Report() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.getReport(id).then(({ report: r }) => setReport(r)).catch((e) => setError(e.message)); }, [id]);

  if (error) return (
    <div className="max-w-2xl">
      <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}</p>
      <p className="mt-3 text-sm"><Link className="text-blue-700 underline" to={`/analysis/${id}`}>Check analysis status</Link> · <Link className="text-blue-700 underline" to="/analyze">Analyze another file</Link></p>
    </div>
  );
  if (!report) return <p className="text-sm text-slate-500">Loading report…</p>;

  const { file, assessment: a, staticAnalysis: sa } = report;
  const t = a.thresholds;
  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <nav className="text-xs text-slate-500" aria-label="Breadcrumb"><Link to="/analyze" className="hover:underline">Analyze File</Link> / <Link to={`/analysis/${id}`} className="hover:underline">Analysis</Link> / Report</nav>
        <h1 className="mt-1 text-2xl font-semibold">Analysis report</h1>
        {report.analysis.status === 'PARTIAL' && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Partial results: one or more modules failed. See the module table below.</p>}
      </div>

      <Section id="sec-file" icon={FileText} title="File information">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Original filename">{file.originalName}</Field>
          <Field label="File ID (storage identifier)" mono>{file.id}</Field>
          <Field label="Size">{formatBytes(file.size)}</Field>
          <Field label="Detected MIME type">{file.detected.mime}</Field>
          <Field label="Extension">{file.extension || '(none)'}{file.typeMismatch && <span className="ml-2 text-xs text-amber-800">does not match content</span>}</Field>
          <Field label="Analysis ID" mono>{report.analysis.id}</Field>
          <Field label="SHA-256" mono>{file.sha256}</Field>
          <Field label="Uploaded">{formatDate(file.uploadedAt)}</Field>
          <Field label="Analyzed">{formatDate(report.analysis.finishedAt)}</Field>
        </dl>
      </Section>

      <Section id="sec-assessment" icon={ShieldAlert} title="Overall assessment">
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-3xl font-semibold">{a.riskScore === null ? <span className="text-xl">Insufficient evidence</span> : <>{a.riskScore}<span className="text-base font-normal text-slate-500">/100</span></>}</div>
          <RiskBadge level={a.riskLevel} />
          <span className="text-sm text-slate-600">Confidence: <strong>{a.confidence}</strong> · Evidence: <strong>{a.evidenceSufficiency}</strong></span>
        </div>
        <p className="mt-3 text-xs text-slate-500">Application-defined bands (configurable, not validated malware probabilities): 0–{t.moderate - 1} low · {t.moderate}–{t.high - 1} moderate · {t.high}–{t.veryHigh - 1} high · {t.veryHigh}–100 very high.</p>
        <h3 className="mt-4 text-sm font-medium">What contributed to the score</h3>
        {a.reasons.length === 0
          ? <p className="mt-1 text-sm text-slate-600">No scoring indicators were found. This is not a statement that the file is safe.</p>
          : <ul className="mt-1 space-y-1 text-sm">{a.reasons.map((r) => <li key={r.code}><span className="font-mono text-xs">{r.code}</span> — {r.title} <span className="text-slate-500">(+{r.points})</span></li>)}</ul>}
        <h3 className="mt-4 text-sm font-medium">Limitations</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{a.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </Section>

      <Section id="sec-findings" icon={ListChecks} title="Static-analysis findings">
        <p className="mb-3 text-xs text-slate-500">“Observed” findings are facts read from the file. “Heuristic” findings are interpretations that may be benign. Strings and metadata shown here come from the uploaded file and are untrusted.</p>
        {sa.findings.length === 0 ? <p className="text-sm text-slate-600">No findings were recorded by the modules that completed. This is not a safety verdict.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500"><tr><th className="py-2 pr-3">Finding</th><th className="pr-3">Module</th><th className="pr-3">Severity</th><th className="pr-3">Type</th><th>Explanation and evidence</th></tr></thead>
              <tbody>
                {sa.findings.map((f, i) => (
                  <tr key={`${f.code}-${i}`} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 font-medium">{f.title}<div className="font-mono text-xs font-normal text-slate-500">{f.code}</div></td>
                    <td className="pr-3">{f.module}</td>
                    <td className="pr-3"><SeverityBadge severity={f.severity} /></td>
                    <td className="pr-3">{f.kind === 'observed' ? 'Observed' : 'Heuristic'}</td>
                    <td className="py-2">{f.description}
                      <details className="mt-1"><summary className="cursor-pointer text-xs text-blue-700">Evidence</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-xs">{JSON.stringify(f.evidence, null, 2)}</pre></details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3 className="mt-5 text-sm font-medium">Module status</h3>
        <p className="text-xs text-slate-500">A module that was skipped, unavailable or failed did not produce a clean result.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <tbody>{sa.modules.map((m) => (
              <tr key={m.module} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 font-medium">{m.module}</td><td className="pr-3"><ModuleStatusBadge status={m.status} /></td>
                <td className="pr-3 text-xs text-slate-600">{m.reason || m.errors[0] || ''}</td><td className="text-xs text-slate-500">{m.durationMs} ms</td>
              </tr>))}</tbody>
          </table>
        </div>
      </Section>

      <Section id="sec-ai" icon={Bot} title="AI analysis">
        <p className="text-sm font-medium">{report.ai.message || `Status: ${report.ai.status}`}</p>
        {report.ai.status === 'completed' && <p className="mt-1 text-xs text-slate-500">This is an additional opinion; the deterministic assessment above remains authoritative.</p>}
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Risk assessment">{report.ai.riskAssessment || '—'}</Field>
          <Field label="Sandbox recommendation">{report.ai.sandboxRecommended === null ? '—' : report.ai.sandboxRecommended ? 'Recommended' : 'Not recommended'}</Field>
          <Field label="Reasoning">{report.ai.reasoning || '—'}</Field>
          <Field label="Key concerns">{report.ai.keyConcerns?.length ? report.ai.keyConcerns.join('; ') : '—'}</Field>
          <Field label="Uncertainties">{report.ai.uncertainties?.length ? report.ai.uncertainties.join('; ') : '—'}</Field>
        </dl>
      </Section>

      <Section id="sec-behavior" icon={Box} title="Behavioral analysis">
        <p className="text-sm font-medium">{report.behavioral.message || `Status: ${report.behavioral.status}`}</p>
        {report.behavioral.status === 'completed' && <>
          <p className="mt-2 text-xs text-slate-500">The following telemetry came from the disposable sandbox. Names, logs, and output are untrusted evidence.</p>
          {report.behavioral.findings?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{report.behavioral.findings.map((f, i) => <li key={`${f.code}-${i}`}><span className="font-mono text-xs">{f.code}</span> — {f.title}{f.evidence?.detail ? `: ${f.evidence.detail}` : ''}</li>)}</ul>}
          {report.behavioral.logs?.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-xs text-blue-700">Sandbox logs</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-xs">{report.behavioral.logs.join('\n')}</pre></details>}
          {report.behavioral.artifacts?.length > 0 && <p className="mt-2 text-sm">Artifacts: {report.behavioral.artifacts.map((x) => x.name).join(', ')}</p>}
        </>}
        {report.behavioral.status === 'not_required' && <p className="mt-1 text-xs text-slate-500">Policy did not require sandbox analysis. The uploaded file was not executed.</p>}
        {['unavailable', 'failed', 'timeout'].includes(report.behavioral.status) && <p className="mt-1 text-xs text-slate-500">No host execution was attempted. Static analysis and deterministic results remain available.</p>}
      </Section>

      <Section id="sec-recs" icon={Lightbulb} title="Recommendations">
        <ul className="list-disc space-y-1 pl-5 text-sm">{report.recommendations.map((r) => <li key={r.text}>{r.text}</li>)}</ul>
      </Section>

      <Section id="sec-export" icon={Download} title="Export">
        <a href={api.reportDownloadUrl(report.analysis.id)} download className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"><Download size={16} /> Download JSON report</a>
        <p className="mt-2 text-xs text-slate-500">Schema version {report.schemaVersion}. Generated {formatDate(report.generatedAt)}.</p>
        <p className="mt-2 text-xs text-slate-500">{report.disclaimer}</p>
      </Section>
    </div>
  );
}
