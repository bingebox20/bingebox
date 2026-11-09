import { ExternalLink, Film, KeyRound, LayoutDashboard, Menu, Plus, ShieldCheck, Tags, Users, X } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Avatar } from '../../components/ui/Avatar';
import { Logo } from '../../components/ui/Logo';
import { FullPageLoader } from '../../components/ui/States';
import { useAuth } from '../../hooks/useAuth';
import { cn } from '../../lib/format';

const NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/titles', label: 'Titles', icon: Film },
  { to: '/admin/genres', label: 'Categories', icon: Tags },
  { to: '/admin/users', label: 'Users', icon: Users },
];

export default function AdminLayout() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 px-5">
        <Link to="/admin" className="text-[17px]">
          <Logo />
        </Link>
        <span className="rounded-md bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-300">Studio</span>
        <button onClick={() => setOpen(false)} aria-label="Close admin navigation" className="ml-auto grid h-8 w-8 place-items-center rounded-lg hover:bg-white/5 lg:hidden"><X size={17} /></button>
      </div>
      <div className="px-4 pb-2 pt-5"><Link to="/admin/titles/new" className="btn btn-primary btn-md w-full"><Plus size={16} /> Add content</Link></div>
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Admin">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn('flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition', isActive ? 'bg-brand-500/10 text-brand-300' : 'text-ink-300 hover:bg-white/[0.04] hover:text-white')
            }
          >
            <Icon size={18} /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-2 border-t border-white/[0.06] p-3">
        <button onClick={() => { setOpen(false); window.dispatchEvent(new Event('bingebox:configure-animedoc')); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink-300 hover:bg-white/[0.04] hover:text-white"><KeyRound size={17} /> AnimeDoc API key</button>
        <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-300 hover:bg-white/[0.04] hover:text-white">
          <ExternalLink size={17} /> View site
        </Link>
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <Avatar avatar={profile?.avatar ?? 'crimson'} name={user?.name ?? ''} className="h-8 w-8" />
          <div className="min-w-0 text-xs">
            <p className="truncate font-semibold text-white">{user?.name}</p>
            <p className="truncate text-ink-400">{user?.email}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-950 lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-white/[0.06] bg-ink-900 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-white/10 bg-ink-900 shadow-pop">{sidebar}</aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/[0.06] bg-ink-950/90 px-4 backdrop-blur sm:px-8">
          <button onClick={() => setOpen((o) => !o)} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/5 lg:hidden" aria-label="Menu">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="text-xs text-ink-300">Studio <span className="mx-2 text-ink-500">/</span> {location.pathname.includes('/titles/new') ? 'Add content' : NAV.find((item) => item.to !== '/admin' && location.pathname.startsWith(item.to))?.label ?? 'Overview'}</span>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-ink-300"><ShieldCheck size={13} /> Administrator</span>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
          <Suspense fallback={<FullPageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
