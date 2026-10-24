export default function Placeholder({ title, milestone, children }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Not implemented yet. Scheduled for {milestone}. {children}
      </div>
    </div>
  );
}
