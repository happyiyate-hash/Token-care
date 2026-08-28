import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Clock3, Loader2, Sparkles } from 'lucide-react';
import { getDeveloperPlans, getDeveloperProject, DeveloperPlan, DeveloperProject } from '../services/developerApi';

interface DeveloperPlansViewProps {
  onBack?: () => void;
}

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) < 1000) return Math.round(value).toString();
  const units = ['K', 'M', 'B', 'T'];
  let n = value;
  let unit = -1;
  while (Math.abs(n) >= 1000 && unit < units.length - 1) {
    n /= 1000;
    unit += 1;
  }
  const rounded = n >= 100 ? Math.round(n) : n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100;
  return `${rounded}${units[unit]}`;
}

export default function DeveloperPlansView({ onBack }: DeveloperPlansViewProps) {
  const [plans, setPlans] = useState<DeveloperPlan[]>([]);
  const [project, setProject] = useState<DeveloperProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [planRows, currentProject] = await Promise.all([
          getDeveloperPlans(),
          getDeveloperProject(),
        ]);
        if (!active) return;
        setPlans(planRows.filter((p) => p.is_active));
        setProject(currentProject);
      } catch (e: any) {
        if (active) setError(e?.message || 'Unable to load plans.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const currentCode = project?.plan_code?.toLowerCase();
  const orderedPlans = useMemo(() => [...plans].sort((a, b) => a.monthly_price_usd - b.monthly_price_usd), [plans]);

  return (
    <div className="min-h-full w-full bg-[#030710] text-white">
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[#060913]/95 backdrop-blur-xl px-3 sm:px-5 py-3">
        <div className="mx-auto max-w-6xl flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-xl border border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:text-white" aria-label="Back">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight">My Plans</h1>
            <p className="text-[11px] sm:text-xs text-zinc-400">Choose the API capacity that fits your project.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 sm:px-5 py-5 sm:py-7">
        {loading ? (
          <div className="min-h-[260px] flex items-center justify-center text-zinc-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading plans…</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
        ) : orderedPlans.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-6 text-center text-sm text-zinc-400">No active plans are available right now.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {orderedPlans.map((plan) => {
              const isCurrent = currentCode === plan.code.toLowerCase();
              return (
                <article key={plan.code} className={`relative rounded-2xl border p-4 sm:p-5 bg-zinc-950/60 ${isCurrent ? 'border-emerald-500/40 shadow-[0_0_0_1px_rgba(16,185,129,.08)]' : 'border-zinc-800/80'}`}>
                  {isCurrent && <div className="absolute top-3 right-3 text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">Current</div>}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><Sparkles className="w-4 h-4 text-emerald-400" /></div>
                    <div><h2 className="text-sm font-bold">{plan.name}</h2><p className="text-[10px] text-zinc-500 uppercase tracking-wider">{plan.code}</p></div>
                  </div>
                  <div className="flex items-end gap-1 mb-4"><span className="text-2xl font-bold">${plan.monthly_price_usd}</span><span className="text-xs text-zinc-500 mb-1">/ month</span></div>
                  <div className="space-y-2.5 text-xs text-zinc-300 mb-5">
                    <div className="flex justify-between"><span>Calls / day</span><strong className="text-white">{compactNumber(plan.daily_limit)}</strong></div>
                    <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /> API access</div>
                    <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /> Database-managed limits</div>
                    <div className="flex items-center gap-2"><Clock3 className="w-3.5 h-3.5 text-zinc-500" /> Subscription billing coming soon</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => !isCurrent && window.alert('Coming soon — plan subscriptions are not available yet.')}
                    disabled={isCurrent}
                    className={`w-full h-9 rounded-xl text-xs font-semibold border ${isCurrent ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 cursor-default' : 'border-zinc-700 bg-white text-black hover:bg-zinc-200'}`}
                  >
                    {isCurrent ? 'Current plan' : 'Subscribe'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
