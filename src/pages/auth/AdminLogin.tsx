import { Film, KeyRound, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthCard, Field, FormError, PasswordField, SubmitButton } from '../../components/ui/Form';
import { useDocumentTitle } from '../../hooks/misc';
import { useAuth } from '../../hooks/useAuth';
import { api, ApiError } from '../../lib/api';
import { safeNext } from '../../lib/format';
import type { Session } from '../../lib/types';

export default function AdminLogin() {
  useDocumentTitle('Administrator sign in');
  const { user, isAdmin, login, logout } = useAuth();
  const [params] = useSearchParams();
  const candidate = safeNext(params.get('next'));
  const next = candidate.startsWith('/admin') && !candidate.startsWith('/admin/login') ? candidate : '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  if (isAdmin && !loading) return <Navigate to={next} replace />;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      await login(email, password);
      const session = await api.get<Session>('/auth/me');
      if (session.user?.role !== 'admin') {
        setError('This account does not have administrator access. Sign in with your administrator account.');
        setLoading(false); return;
      }
      navigate(next, { replace: true });
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Couldn’t sign in. Please try again.'); setLoading(false); }
  };
  return <AuthCard title="BingeBox Studio" subtitle="Your catalog. Your audience. Your control room." footer={<Link to="/" className="font-medium text-ink-200 hover:text-white">Back to BingeBox</Link>}>
    <div className="mb-6 flex items-center gap-2 rounded-xl border border-brand-500/20 bg-brand-500/5 px-4 py-3 text-xs font-semibold text-brand-300"><ShieldCheck size={16} /> Administrator access only</div>
    {user && !isAdmin && <div className="mb-5 rounded-xl border border-white/10 p-4 text-sm"><p className="break-all text-ink-200">You’re signed in as {user.email}.</p><button onClick={async () => { try { await logout(); setError(null); } catch { setError('Couldn’t sign out. Please try again.'); } }} className="mt-2 text-xs font-semibold text-brand-300">Use another account</button></div>}
    <form onSubmit={submit} className="space-y-5"><FormError message={error} /><Field label="Administrator email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus placeholder="admin@your-domain.com" /><PasswordField label="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /><div className="text-right"><Link to="/forgot-password" className="text-xs text-ink-300 hover:text-white">Forgot password?</Link></div><SubmitButton loading={loading}>Sign in to dashboard</SubmitButton></form>
    <div className="mt-7 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-5 text-center text-[10px] text-ink-300">{[{ icon: Film, label: 'Manage content' }, { icon: Users, label: 'Manage members' }, { icon: KeyRound, label: 'Connect AnimeDoc' }].map(({ icon: Icon, label }) => <span key={label} className="flex flex-col items-center gap-2"><Icon size={16} />{label}</span>)}</div>
  </AuthCard>;
}
