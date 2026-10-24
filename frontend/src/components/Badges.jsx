const pill = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium';
const RISK = {
  low: ['Low observed risk', 'border-green-200 bg-green-50 text-green-800'],
  moderate: ['Moderate observed risk', 'border-amber-200 bg-amber-50 text-amber-900'],
  high: ['High observed risk', 'border-orange-200 bg-orange-50 text-orange-900'],
  very_high: ['Very high observed risk', 'border-red-200 bg-red-50 text-red-800'],
  insufficient_evidence: ['Insufficient evidence', 'border-slate-300 bg-slate-100 text-slate-700'],
};
const SEVERITY = {
  info: 'border-slate-200 bg-slate-50 text-slate-700', low: 'border-blue-200 bg-blue-50 text-blue-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-900', high: 'border-red-200 bg-red-50 text-red-800',
};
const MODULE = {
  completed: 'border-green-200 bg-green-50 text-green-800', skipped: 'border-slate-200 bg-slate-50 text-slate-700',
  unavailable: 'border-amber-200 bg-amber-50 text-amber-900', failed: 'border-red-200 bg-red-50 text-red-800', timeout: 'border-red-200 bg-red-50 text-red-800',
};
export const RiskBadge = ({ level }) => { const [label, cls] = RISK[level] || RISK.insufficient_evidence; return <span className={`${pill} ${cls}`}>{label}</span>; };
export const SeverityBadge = ({ severity }) => <span className={`${pill} ${SEVERITY[severity] || SEVERITY.info}`}>{severity}</span>;
export const ModuleStatusBadge = ({ status }) => <span className={`${pill} ${MODULE[status] || MODULE.skipped}`}>{status}</span>;
