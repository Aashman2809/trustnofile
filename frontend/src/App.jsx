import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, FileSearch, History as HistoryIcon, BookOpen, Settings as Cog, ShieldCheck, Menu } from 'lucide-react';
import Placeholder from './components/Placeholder.jsx';
import Settings from './pages/Settings.jsx';
import Analyze from './pages/Analyze.jsx';
import AnalysisProgress from './pages/AnalysisProgress.jsx';
import Report from './pages/Report.jsx';
import Overview from './pages/Overview.jsx';
import History from './pages/History.jsx';
import Methodology from './pages/Methodology.jsx';

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/analyze', label: 'Analyze File', icon: FileSearch },
  { to: '/history', label: 'Analysis History', icon: HistoryIcon },
  { to: '/methodology', label: 'Security Methodology', icon: BookOpen },
  { to: '/settings', label: 'Settings', icon: Cog },
];

export default function App() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside className={`${open ? 'block' : 'hidden'} fixed inset-y-0 z-20 w-64 border-r border-slate-200 bg-white p-4 md:static md:block`}>
        <div className="mb-6 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <ShieldCheck className="text-blue-600" /> TrustNoFile
        </div>
        <nav className="space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button aria-label="Toggle navigation" onClick={() => setOpen(!open)}><Menu /></button>
          <span className="font-semibold">TrustNoFile</span>
        </header>
        <main className="flex-1 p-6">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/analyze" element={<Analyze />} />
            <Route path="/analysis/:id" element={<AnalysisProgress />} />
            <Route path="/reports/:id" element={<Report />} />
            <Route path="/history" element={<History />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Placeholder title="Page not found" milestone="n/a" />} />
          </Routes>
        </main>
        <footer className="border-t border-slate-200 px-6 py-3 text-xs text-slate-500">v0.6.0 · Development build · Local use only</footer>
      </div>
    </div>
  );
}
