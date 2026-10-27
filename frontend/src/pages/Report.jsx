import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileText, ShieldAlert, ListChecks, Bot, Box, Lightbulb, AlertTriangle, Send, MessageSquareCode } from 'lucide-react';
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
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [copiedHash, setCopiedHash] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(file.sha256);
      setCopiedHash(true);
      setCopyError('');
      window.setTimeout(() => setCopiedHash(false), 1800);
    } catch {
      setCopyError('Could not copy the hash. Select and copy it manually.');
    }
  };

  const handleSendChat = async (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q || chatLoading) return;
    const userMsg = { role: 'user', content: q };
    setMessages((prev) => [...prev, userMsg]);
    setQuery('');
    setChatLoading(true);
    setChatError('');
    try {
      const res = await api.chatWithReport(id, q, messages);
      setMessages((prev) => [...prev, { role: 'model', content: res.reply }]);
    } catch (err) {
      setChatError(err.message || 'Failed to get answer from AI Copilot');
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    api.getReport(id).then(({ report: r }) => setReport(r)).catch((e) => setError(e.message));
  }, [id]);

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
          <Field label="Detected format">{file.detected.format}</Field>
          <Field label="Detected category">{file.detected.category}</Field>
          <Field label="Detected MIME type">{file.detected.mime}</Field>
          <Field label="Identification basis">{file.detected.signature || file.detected.identification || 'UTF-8 text heuristic'}</Field>
          <Field label="Extension">{file.extension || '(none)'}{file.typeMismatch && <span className="ml-2 text-xs text-amber-800">does not match content</span>}</Field>
          <Field label="Browser-declared MIME type">{file.declaredMime || '(not provided)'}</Field>
          <Field label="Analysis ID" mono>{report.analysis.id}</Field>
          <div className="min-w-0"><dt className="text-xs text-slate-500">SHA-256</dt><dd className="mt-0.5 flex flex-wrap items-center gap-2"><span className="break-all font-mono text-xs">{file.sha256}</span><button type="button" onClick={copyHash} className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100">{copiedHash ? 'Copied' : 'Copy hash'}</button></dd>{copyError && <p role="status" className="mt-1 text-xs text-red-700">{copyError}</p>}</div>
          <Field label="MD5 (reference only)" mono>{file.md5 || '—'}</Field>
          <Field label="Uploaded">{formatDate(file.uploadedAt)}</Field>
          <Field label="Analyzed">{formatDate(report.analysis.finishedAt)}</Field>
        </dl>
        {file.details && Object.keys(file.details).length > 0 && (
          <details className="mt-4 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer text-sm font-medium text-blue-700">Additional detected file details</summary>
            <p className="mt-2 text-xs text-slate-500">These are bounded facts read from file headers or a limited content sample. They are not a safety verdict.</p>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(file.details).filter(([key]) => key !== 'note').map(([key, value]) => (
                <Field key={key} label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}>
                  {value && typeof value === 'object'
                    ? <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>
                    : String(value ?? '—')}
                </Field>
              ))}
            </dl>
          </details>
        )}
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
                <td className="pr-3 text-xs text-slate-600">{m.reason || m.errors[0] || ''}{m.module === 'yara' && <div className="mt-1 text-slate-500">{m.data?.sourceSet ? `${m.data.sourceSet.source} ${m.data.sourceSet.release} · ${m.data.sourceSet.package}` : 'No versioned rule source reported'} · {m.data?.scanComplete ? 'complete scan' : 'scan incomplete or not performed'}</div>}</td><td className="text-xs text-slate-500">{m.durationMs} ms</td>
              </tr>))}</tbody>
          </table>
        </div>
      </Section>

      <Section id="sec-ai" icon={Bot} title="AI analysis">
        <p className="text-sm font-medium">{report.ai.message || `Status: ${report.ai.status}`}</p>
        {report.ai.status === 'completed' && <p className="mt-1 text-xs text-slate-500">This is an additional opinion; the deterministic assessment above remains authoritative.</p>}
        {report.ai.narrative && (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3.5 text-sm text-indigo-950">
            <span className="font-semibold uppercase tracking-wider text-xs text-indigo-700 block mb-1">Executive Threat Narrative</span>
            {report.ai.narrative}
          </div>
        )}
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Risk assessment">{report.ai.riskAssessment || '—'}</Field>
          <Field label="Sandbox recommendation">{report.ai.sandboxRecommended === null ? '—' : report.ai.sandboxRecommended ? 'Recommended' : 'Not recommended'}</Field>
          <Field label="Reasoning">{report.ai.reasoning || '—'}</Field>
          <Field label="Key concerns">{report.ai.keyConcerns?.length ? report.ai.keyConcerns.join('; ') : '—'}</Field>
          <Field label="Uncertainties">{report.ai.uncertainties?.length ? report.ai.uncertainties.join('; ') : '—'}</Field>
        </dl>

        {report.ai.mitreAttAndCk?.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Mapped MITRE ATT&CK Techniques</h3>
            <div className="flex flex-wrap gap-2">
              {report.ai.mitreAttAndCk.map((m, idx) => (
                <div key={idx} className="flex items-center gap-1.5 rounded border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs text-slate-800 shadow-sm">
                  <span className="font-mono font-bold text-blue-700">{m.techniqueId}</span>
                  <span className="text-slate-400">|</span>
                  <span className="font-medium">{m.techniqueName}</span>
                  <span className="rounded bg-slate-200 px-1.5 py-0.2 text-[10px] uppercase font-semibold text-slate-600">{m.tactic}</span>
                  {m.confidence && (
                    <span className={`text-[10px] px-1 rounded ${m.confidence === 'confirmed' ? 'bg-red-100 text-red-700 font-medium' : 'bg-amber-100 text-amber-700'}`}>
                      {m.confidence}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
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

      <Section id="sec-chat" icon={MessageSquareCode} title="AI Threat Copilot (Interactive Investigation)">
        <p className="text-xs text-slate-500 mb-3">
          Ask specific technical questions about this file&apos;s findings, suspicious strings, entropy, or MITRE techniques. Answers are grounded exclusively in this report.
        </p>

        {messages.length > 0 && (
          <div className="mb-4 max-h-72 overflow-y-auto space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] font-semibold uppercase text-slate-600 mb-0.5">
                  {m.role === 'user' ? 'You' : 'Copilot'}
                </span>
                <div className={`rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 italic">
                <Bot size={14} className="animate-spin text-blue-600" /> Copilot is analyzing findings...
              </div>
            )}
          </div>
        )}

        {chatError && (
          <p className="mb-3 text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle size={14} /> {chatError}
          </p>
        )}

        <form onSubmit={handleSendChat} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., Why was this classified as low/moderate? Explain the PowerShell indicators..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            disabled={chatLoading}
          />
          <button
            type="submit"
            disabled={chatLoading || !query.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Send size={15} /> Send
          </button>
        </form>

        <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
          <span>Suggestions:</span>
          <button
            type="button"
            onClick={() => setQuery('Why was this risk level assigned?')}
            className="underline hover:text-blue-700"
          >
            Why this risk level?
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => setQuery('Are there any signs of obfuscation or persistence?')}
            className="underline hover:text-blue-700"
          >
            Signs of obfuscation?
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => setQuery('What should be the next triage step for this file?')}
            className="underline hover:text-blue-700"
          >
            Next triage step?
          </button>
        </div>
      </Section>

      <Section id="sec-recs" icon={Lightbulb} title="Recommendations">
        <ul className="list-disc space-y-1 pl-5 text-sm">{report.recommendations.map((r) => <li key={r.text}>{r.text}</li>)}</ul>
      </Section>

      <Section id="sec-export" icon={Download} title="Export">
        <button onClick={() => api.downloadReport(report.analysis.id).catch((failure) => setDownloadError(failure.message))} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"><Download size={16} /> Download JSON report</button>
        {downloadError && <p role="alert" className="mt-2 text-sm text-red-700">{downloadError}</p>}
        <p className="mt-2 text-xs text-slate-500">Schema version {report.schemaVersion}. Generated {formatDate(report.generatedAt)}.</p>
        <p className="mt-2 text-xs text-slate-500">{report.disclaimer}</p>
      </Section>
    </div>
  );
}
