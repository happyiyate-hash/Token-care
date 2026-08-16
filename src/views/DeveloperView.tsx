import React, { useMemo, useState } from 'react';

const plans = [
  { name: 'Free', calls: 100, price: '$0', note: '100 calls per day for testing' },
  { name: 'Starter', calls: 1000, price: '$5', note: '1,000 calls per day' },
  { name: 'Growth', calls: 10000, price: '$20', note: '10,000 calls per day' },
  { name: 'Scale', calls: 100000, price: 'Custom', note: '100,000 calls per day' },
  { name: 'Enterprise', calls: 1000000, price: 'Custom', note: '1,000,000 calls per day' },
];

export default function DeveloperView({ userId = 'current-user' }: { userId?: string }) {
  const [projectName, setProjectName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState('');
  const [calls, setCalls] = useState(0);

  const endpoint = useMemo(() => `${window.location.origin}/api/developer`, []);
  const remaining = Math.max(0, 100 - calls);

  const createProject = () => {
    if (!projectName.trim() || created) return;
    const key = `tc_live_${crypto.randomUUID().replaceAll('-', '')}`;
    setApiKey(key);
    setCreated(true);
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  };

  return (
    <main className="min-h-screen bg-[#030710] text-white px-4 py-6 md:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-400">DEVELOPER</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">Developer API</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400 md:text-base">Create one TokenCare developer project and use your API key to fetch token data from your applications.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">1 project per account</div>
        </div>

        {!created ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl md:p-8">
            <h2 className="text-xl font-semibold">Create your developer project</h2>
            <p className="mt-2 text-sm text-slate-400">Your project name identifies the application using your TokenCare API.</p>
            <div className="mt-6 max-w-xl">
              <label className="mb-2 block text-sm text-slate-300">Project name</label>
              <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="My Token App" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-emerald-400" />
              <button onClick={createProject} disabled={!projectName.trim()} className="mt-4 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">Create project</button>
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:col-span-2">
                <p className="text-xs uppercase tracking-wider text-slate-500">Project</p>
                <div className="mt-2 flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{projectName}</h2><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">Active</span></div>
                <div className="mt-6"><p className="mb-2 text-sm text-slate-400">API key</p><div className="flex gap-2"><input readOnly value={apiKey} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs text-emerald-300"/><button onClick={() => copy(apiKey, 'key')} className="rounded-xl border border-emerald-500/30 px-4 py-3 text-sm text-emerald-400">{copied === 'key' ? 'Copied' : 'Copy'}</button></div></div>
                <div className="mt-4"><p className="mb-2 text-sm text-slate-400">Worker / API endpoint</p><div className="flex gap-2"><input readOnly value={endpoint} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs"/><button onClick={() => copy(endpoint, 'endpoint')} className="rounded-xl border border-white/10 px-4 py-3 text-sm">{copied === 'endpoint' ? 'Copied' : 'Copy'}</button></div></div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><p className="text-sm text-slate-400">Today's calls</p><p className="mt-2 text-4xl font-bold">{calls}</p><p className="mt-1 text-sm text-slate-500">of 100 free calls</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, calls)}%` }}/></div><p className="mt-3 text-xs text-slate-500">{remaining} calls remaining</p></div>
            </section>

            <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-7">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><h2 className="text-xl font-semibold">API usage</h2><p className="text-sm text-slate-400">Daily request activity for your project.</p></div><button onClick={() => setCalls(c => Math.min(100, c + 1))} className="rounded-xl border border-white/10 px-4 py-2 text-sm">Test one call</button></div>
              <div className="mt-6 h-48 rounded-2xl border border-white/5 bg-black/20 p-4"><div className="flex h-full items-end gap-1">{Array.from({ length: 30 }, (_, i) => <div key={i} className="flex-1 rounded-t bg-emerald-500/60" style={{ height: `${Math.max(4, ((i * 17 + calls * 7) % 90))}%` }}/>)}</div></div>
            </section>

            <section className="mt-6"><h2 className="text-xl font-semibold">Endpoints</h2><div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">{['GET /tokens','GET /tokens/:address','GET /tokens/blockchain/:chain','GET /tokens/search'].map(path => <div key={path} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><code className="text-sm text-emerald-400">{path}</code><p className="mt-2 text-xs text-slate-500">Fetch token data through your developer API.</p></div>)}</div></section>

            <section className="mt-8"><h2 className="text-xl font-semibold">Plans</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{plans.map(plan => <div key={plan.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="font-semibold">{plan.name}</p><p className="mt-3 text-2xl font-bold">{plan.price}</p><p className="mt-2 text-sm text-emerald-400">{plan.calls.toLocaleString()} calls/day</p><p className="mt-2 text-xs text-slate-500">{plan.note}</p><button disabled={plan.name === 'Free'} className="mt-5 w-full rounded-xl border border-white/10 px-3 py-2 text-sm disabled:opacity-50">{plan.name === 'Free' ? 'Current plan' : 'Upgrade'}</button></div>)}</div></section>

            <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-7"><h2 className="text-xl font-semibold">Quick start</h2><p className="mt-2 text-sm text-slate-400">Copy your endpoint and API key into your server or application. Do not expose the key in public client-side code.</p><pre className="mt-5 overflow-x-auto rounded-2xl bg-black/40 p-4 text-xs text-slate-300">{`curl -H "x-api-key: ${apiKey}" "${endpoint}/tokens"`}</pre></section>
          </>
        )}
      </div>
    </main>
  );
}
