import { ExternalLink, Eye, EyeOff, KeyRound, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { api, ApiError } from '../../lib/api';
import { FormError } from '../ui/Form';

/** Owner-only setup. Keys are sent to the authenticated server and never stored
 * in browser storage; dismissal is remembered only after a successful save. */
const DISMISS_KEY = 'bingebox:animedoc-key-notice-dismissed:v2';
const SNOOZE_KEY = 'bingebox:animedoc-key-notice-snoozed:v2';
const KEY_PATTERN = /^ad_live_[A-Za-z0-9_-]+$/;

function read(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key) === '1';
  } catch {
    return false;
  }
}

function write(storage: () => Storage, key: string) {
  try {
    storage().setItem(key, '1');
  } catch {
    // Storage can be blocked (private mode); the popup just shows again next time.
  }
}

export function ApiKeyNotice() {
  const [open, setOpen] = useState(() => !read(() => localStorage, DISMISS_KEY) && !read(() => sessionStorage, SNOOZE_KEY));
  const { isAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const saving = useRef(false);
  const snooze = () => {
    if (saving.current) return;
    setApiKey('');
    setShowKey(false);
    write(() => sessionStorage, SNOOZE_KEY);
    setOpen(false);
  };
  const dismiss = () => {
    write(() => localStorage, DISMISS_KEY);
    setOpen(false);
  };
  const save = useMutation({
    mutationFn: (key: string) => api.put<{ ok: boolean }>('/admin/settings/animedoc', { apiKey: key }),
    onMutate: () => { saving.current = true; setError(null); },
    onSuccess: () => {
      setApiKey(''); setShowKey(false); dismiss();
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
      toast.success('AnimeDoc API key saved. The server is using your new key.');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Couldn’t save your API key. Please try again.'),
    onSettled: () => { saving.current = false; },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const key = apiKey.trim();
    if (!KEY_PATTERN.test(key) || key.length > 256) { setError('Enter an AnimeDoc API key starting with ad_live_.'); return; }
    if (!save.isPending) save.mutate(key);
  };

  useEffect(() => {
    if (!isAdmin) { setApiKey(''); setShowKey(false); }
  }, [isAdmin]);

  useEffect(() => {
    const configure = () => { setError(null); setOpen(true); };
    window.addEventListener('bingebox:configure-animedoc', configure);
    return () => window.removeEventListener('bingebox:configure-animedoc', configure);
  }, []);

  useEffect(() => {
    if (!open || !isAdmin) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') snooze();
      if (e.key === 'Tab') {
        const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])') ?? []);
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previousFocus?.focus();
    };
  }, [open, isAdmin]);

  if (!open || !isAdmin) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/75 backdrop-blur-sm" onClick={snooze} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="apikey-title"
        tabIndex={-1}
        className="relative max-h-[92vh] w-full max-w-xl animate-scale-in overflow-y-auto rounded-2xl border border-white/10 bg-ink-850 shadow-pop focus:outline-none"
      >
        <button type="button" onClick={snooze} disabled={save.isPending} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-ink-300 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close">
          <X size={18} />
        </button>

        <form onSubmit={submit} className="p-6 sm:p-8" noValidate>
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand-gradient shadow-glow">
            <KeyRound size={22} className="text-white" />
          </div>
          <p className="eyebrow">Setup required</p>
          <h2 id="apikey-title" className="mt-1.5 font-display text-2xl font-bold text-white">Connect your own AnimeDoc API key</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-200">
            Connect AnimeDoc to add its movies and series alongside your own uploads. Add your API key to link this website to your AnimeDoc account.
          </p>

          <ol className="mt-6 space-y-4">
            <Step n={1} title="Create an AnimeDoc account">
              Go to{' '}
              <a href="https://www.animedoc.cloud/" target="_blank" rel="noreferrer" className="font-medium text-brand-400 hover:underline">
                animedoc.cloud
              </a>{' '}
              and click <b className="text-white">Sign up free</b> (or <b className="text-white">Sign in</b> in the top bar). No credit card needed.
            </Step>
            <Step n={2} title="Generate your key on the Pricing page">
              Open{' '}
              <a href="https://www.animedoc.cloud/pricing" target="_blank" rel="noreferrer" className="font-medium text-brand-400 hover:underline">
                animedoc.cloud/pricing
              </a>{' '}
              and click <b className="text-white">Get free key</b>. Your key starts with <code className="rounded bg-white/10 px-1 py-0.5 text-[13px] text-white">ad_live_</code>.
            </Step>
            <Step n={3} title="Pick a plan that includes streaming">
              Choose a plan with <b className="text-white">stream proxy access</b> for video playback. Check AnimeDoc’s Pricing page for the current plans and limits.
            </Step>
            <Step n={4} title="Add the key to the website">
              Paste your API key below. We’ll save it privately in the server’s configuration and apply it immediately.
              <label htmlFor="animedoc-api-key" className="label mt-3">AnimeDoc API key</label>
              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-ink-950 px-3 focus-within:border-brand-500/70 focus-within:ring-4 focus-within:ring-brand-500/10">
                <input id="animedoc-api-key" type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => { setApiKey(e.target.value); setError(null); }} disabled={save.isPending} maxLength={256} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="ad_live_your_key" aria-invalid={!!error} aria-describedby="animedoc-key-hint" className="h-12 min-w-0 flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-ink-400" />
                <button type="button" onClick={() => setShowKey((shown) => !shown)} disabled={save.isPending} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-300 transition hover:bg-white/10 hover:text-white" aria-label={showKey ? 'Hide API key' : 'Show API key'}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
              <span id="animedoc-key-hint" className="mt-2 block text-xs text-ink-300">Your key must start with ad_live_. Only administrators can change the website’s key.</span>
              <div className="mt-3"><FormError message={error} /></div>
            </Step>
          </ol>

          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            <a href="https://www.animedoc.cloud/pricing" target="_blank" rel="noreferrer" className="btn btn-md btn-primary">
              Get my API key <ExternalLink size={16} />
            </a>
            <button type="submit" disabled={save.isPending || !apiKey.trim()} className="btn btn-md btn-glass" aria-busy={save.isPending}>
              {save.isPending ? 'Saving API key…' : 'I’ve added my key'}
            </button>
            <button type="button" onClick={snooze} disabled={save.isPending} className="btn btn-md btn-ghost">
              Remind me later
            </button>
          </div>
          <p className="mt-4 text-xs text-ink-400">
            Help:{' '}
            <a href="https://www.animedoc.cloud/docs/getting-started" target="_blank" rel="noreferrer" className="hover:text-ink-200 hover:underline">
              AnimeDoc getting-started guide
            </a>{' '}
            ·{' '}
            <a href="mailto:support@animedoc.cloud" className="hover:text-ink-200 hover:underline">
              support@animedoc.cloud
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-brand-500/40 bg-brand-500/10 text-[13px] font-bold text-brand-300">{n}</span>
      <div className="min-w-0 text-sm leading-relaxed text-ink-200">
        <p className="mb-0.5 font-semibold text-white">{title}</p>
        {children}
      </div>
    </li>
  );
}
