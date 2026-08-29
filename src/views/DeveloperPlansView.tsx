import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Clock3, Loader2, Sparkles, Zap, ShieldCheck, X } from 'lucide-react';
import { getDeveloperPlans, getDeveloperProject, DeveloperPlan, DeveloperProject } from '../services/developerApi';
import { formatCompactNumber } from '../utils/numberFormatting';

interface DeveloperPlansViewProps {
  onBack?: () => void;
  currentProject?: DeveloperProject | null;
  availablePlans?: DeveloperPlan[];
}

export default function DeveloperPlansView({
  onBack,
  currentProject: propProject,
  availablePlans: propPlans,
}: DeveloperPlansViewProps) {
  const [plans, setPlans] = useState<DeveloperPlan[]>(() => propPlans || []);
  const [project, setProject] = useState<DeveloperProject | null>(() => propProject || null);
  const [loading, setLoading] = useState<boolean>(() => !propPlans?.length || !propProject);
  const [error, setError] = useState<string | null>(null);
  const [comingSoonModalPlan, setComingSoonModalPlan] = useState<DeveloperPlan | null>(null);

  useEffect(() => {
    let active = true;

    // If props are already provided and populated, no need to fetch again
    if (propPlans && propPlans.length && propProject) {
      setPlans(propPlans);
      setProject(propProject);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const [planRows, currentProj] = await Promise.all([
          getDeveloperPlans().catch(() => []),
          getDeveloperProject().catch(() => null),
        ]);
        if (!active) return;
        setPlans(planRows.filter((p) => p.is_active));
        setProject(currentProj);
      } catch (e: any) {
        if (active) setError(e?.message || 'Unable to load plans.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [propPlans, propProject]);

  const currentCode = (project?.plan_code || 'free').toLowerCase();
  
  // Sort plans ascending by monthly_price_usd (database order)
  const orderedPlans = useMemo(() => {
    return [...plans].sort((a, b) => (a.monthly_price_usd || 0) - (b.monthly_price_usd || 0));
  }, [plans]);

  // Extract benefits dynamically from database features/benefits or attributes
  const getPlanBenefits = (plan: DeveloperPlan): string[] => {
    const raw = plan.benefits || plan.features;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item) => String(item).trim()).filter(Boolean);
        }
      } catch {
        const split = raw.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
        if (split.length > 0) return split;
      }
    }

    const perks: string[] = [];
    if (plan.daily_limit) {
      perks.push(`${formatCompactNumber(plan.daily_limit)} API calls per day`);
    }
    if (plan.included_credits != null) {
      perks.push(`${formatCompactNumber(plan.included_credits)} included credits`);
    }
    if (plan.duration_days) {
      perks.push(`${plan.duration_days}-day billing cycle`);
    }
    perks.push('API & JSON-RPC gateway access');
    perks.push('Multi-chain token directory');
    return perks;
  };

  return (
    <div className="min-h-full w-full bg-[#030710] text-white flex flex-col relative overflow-y-auto">
      {/* Coming Soon Modal */}
      {comingSoonModalPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => setComingSoonModalPlan(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                UPGRADE TO {comingSoonModalPlan.name.toUpperCase()}
              </span>
              <h3 className="text-base sm:text-lg font-bold text-white">Coming soon</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Plan subscriptions will be available soon. Automated billing and credit upgrades are currently undergoing final testing.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80 text-xs text-zinc-400 space-y-1.5">
              <div className="flex justify-between">
                <span>Selected tier:</span>
                <strong className="text-white">{comingSoonModalPlan.name}</strong>
              </div>
              <div className="flex justify-between">
                <span>Included credits:</span>
                <strong className="text-emerald-400 font-mono font-bold">
                  {formatCompactNumber(comingSoonModalPlan.included_credits ?? 0)} Credits
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Daily capacity:</span>
                <strong className="text-white font-mono font-bold">
                  {formatCompactNumber(comingSoonModalPlan.daily_limit)} API Calls / Day
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setComingSoonModalPlan(null)}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-[#060913]/95 backdrop-blur-xl px-3 sm:px-6 py-3.5">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer shrink-0"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">My Plans</h1>
                <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  CURRENT: {currentCode.toUpperCase()}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-zinc-400">Choose the API capacity and quota that fits your project.</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 mx-auto max-w-6xl w-full px-3 sm:px-6 py-5 sm:py-8">
        {loading ? (
          <div className="min-h-[280px] flex flex-col items-center justify-center text-zinc-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            <span className="text-xs">Loading available plans...</span>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
            <p className="font-semibold">{error}</p>
            <p className="text-xs text-red-300/80 mt-1">Please check your connection or try again later.</p>
          </div>
        ) : orderedPlans.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-8 text-center text-sm text-zinc-400">
            No active plans are available right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {orderedPlans.map((plan) => {
              const isCurrent = currentCode === (plan.code || '').toLowerCase();
              const isFree = plan.monthly_price_usd === 0;
              const includedCredits = Number(plan.included_credits ?? 0);
              const perks = getPlanBenefits(plan);

              return (
                <article
                  key={plan.code}
                  className={`relative rounded-2xl border flex flex-col justify-between p-4 sm:p-5 transition-all ${
                    isCurrent
                      ? 'border-emerald-500/50 bg-gradient-to-b from-emerald-950/20 via-zinc-950/80 to-zinc-950 shadow-[0_0_0_1px_rgba(16,185,129,.15)]'
                      : 'border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-700/90'
                  }`}
                >
                  {isCurrent && (
                    <div className="absolute top-3.5 right-3.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      Active Plan
                    </div>
                  )}

                  <div>
                    {/* Header: Icon & Plan Name */}
                    <div className="flex items-center gap-2.5 mb-3.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                          isCurrent
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                        }`}
                      >
                        {isFree ? (
                          <Sparkles className="w-4 h-4" />
                        ) : (
                          <Zap className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <h2 className="text-sm sm:text-base font-bold text-white">{plan.name}</h2>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                          {plan.code}
                        </p>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="flex items-baseline gap-1 mb-4 pb-3 border-b border-zinc-800/60">
                      <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
                        ${plan.monthly_price_usd}
                      </span>
                      <span className="text-xs text-zinc-400 font-medium">/ month</span>
                    </div>

                    {/* Plan Description if present in DB */}
                    {plan.description && (
                      <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                        {plan.description}
                      </p>
                    )}

                    {/* Key Metrics: Daily Limit & Credits */}
                    <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/60 mb-4 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">Daily limit</span>
                        <strong className="text-white font-mono font-bold">
                          {formatCompactNumber(plan.daily_limit)} API Calls / Day
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">Included credits</span>
                        <strong className="text-emerald-400 font-mono font-bold">
                          {formatCompactNumber(includedCredits)} Credits
                        </strong>
                      </div>
                    </div>

                    {/* Features List */}
                    <div className="space-y-2 text-xs text-zinc-300 mb-6">
                      {perks.map((perk, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span className="text-zinc-300 leading-snug">{perk}</span>
                        </div>
                      ))}
                      <div className="flex items-start gap-2 text-zinc-500 pt-1 border-t border-zinc-800/40">
                        <Clock3 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-500" />
                        <span className="text-[11px]">Subscription billing coming soon</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-2">
                    {isCurrent ? (
                      <button
                        type="button"
                        disabled
                        className="w-full h-9 rounded-xl text-xs font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 flex items-center justify-center gap-1.5 cursor-default"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Current Plan
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setComingSoonModalPlan(plan)}
                        className="w-full h-9 rounded-xl text-xs font-bold border border-zinc-700 bg-white hover:bg-zinc-200 text-black transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
                      >
                        Subscribe
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
