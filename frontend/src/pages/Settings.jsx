import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0">
    <dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd>
  </div>
);

export default function Settings() {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    Promise.all([api.health(), api.capabilities()])
      .then(([health, caps]) => setState({ health, caps }))
      .catch((error) => setState({ error: error.message }));
  }, []);

  if (state.loading) return <p className="text-sm text-slate-500">Connecting to backend…</p>;
  if (state.error) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Backend unreachable: {state.error}. Start it with <code>npm run dev</code> in /backend.</p>;
  const { health, caps } = state;
  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <dl className="mt-4 max-w-xl rounded-xl border border-slate-200 bg-white px-5 py-2 shadow-sm">
        <Row k="Backend connection" v={`${health.status} (v${health.version})`} />
        <Row k="Upload limit" v={`${caps.upload.maxMb} MB`} />
        <Row k="Uploads enabled" v={caps.upload.enabled ? 'Yes' : 'Not yet (Milestone 2)'} />
        <Row k="Static analysis" v={caps.modules.staticAnalysis} />
        <Row k="YARA" v={caps.modules.yara} />
        <Row k="Database" v={caps.integrations.database.status} />
        <Row k="LLM" v={caps.integrations.llm.status} />
        <Row k="Sandbox" v={caps.integrations.sandbox.status} />
      </dl>
    </div>
  );
}
