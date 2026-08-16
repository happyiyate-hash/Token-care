import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  KeyRound,
  Laptop,
  LockKeyhole,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Terminal,
  Trash2,
  TriangleAlert,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import {
  createDeveloperApiKey,
  DeveloperApiKey,
  getDeveloperApiBaseUrl,
  listDeveloperApiKeys,
  revokeDeveloperApiKey,
} from '../services/developerApi';

interface DeveloperViewProps {
  currentUser?: any;
  onBack: () => void;
}

const green = '#00E575';

export const DeveloperView: React.FC<DeveloperViewProps> = ({ currentUser, onBack }) => {
  const [keys, setKeys] = useState<DeveloperApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('My TokenCare App');
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const apiBaseUrl = useMemo(() => getDeveloperApiBaseUrl(), []);

  const loadKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await listDeveloperApiKeys());
    } catch (err: any) {
      setError(err?.message || 'Unable to load your developer API keys.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const copy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError('Clipboard access is unavailable. Please copy the value manually.');
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createDeveloperApiKey(name);
      setNewKey(created.key);
      setShowCreate(false);
      setName('My TokenCare App');
      await loadKeys();
    } catch (err: any) {
      setError(err?.message || 'Unable to generate the API key.');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (key: DeveloperApiKey) => {
    if (!window.confirm(`Revoke “${key.name}”? Apps using this key will stop working immediately.`)) return;
    setRevoking(key.id);
    setError(null);
    try {
      await revokeDeveloperApiKey(key.id);
      setNotice('API key revoked successfully.');
      await loadKeys();
    } catch (err: any) {
      setError(err?.message || 'Unable to revoke the API key.');
    } finally {
      setRevoking(null);
    }
  };

  const curlExample = `curl -X POST "${apiBaseUrl}/token/details" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"chain":"ethereum","contractAddress":"0x..."}'`;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#06080E] text-white">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <button onClick={onBack} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Settings
          </button>
          <button onClick={loadKeys} disabled={loading} className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors" title="Refresh keys">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-[#0D2119] via-[#0A1110] to-[#090C13] p-5 sm:p-8 shadow-2xl">
          <div className="absolute -right-20 -top-24 w-64 h-64 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 text-[10px] font-bold uppercase tracking-wider mb-3">
                <Code2 className="w-3.5 h-3.5" /> Developer Platform
              </div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight">Build with TokenCare</h1>
              <p className="mt-2 text-sm sm:text-base text-zinc-400 leading-relaxed max-w-2xl">
                Create secure API keys and let your own website, mobile app, dashboard, or automation fetch TokenCare token data through the Developer API.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400 bg-black/20 border border-white/5 rounded-2xl px-3 py-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Keys are stored as hashes
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
            <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}
        {notice && <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
          <div className="lg:col-span-2 rounded-2xl border border-zinc-800 bg-[#0B0E17] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <div className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-emerald-400" /><h2 className="font-bold">API keys</h2></div>
                <p className="text-xs text-zinc-500 mt-1">Generate a key for each app or integration you control.</p>
              </div>
              <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-black font-extrabold text-xs hover:bg-emerald-400 transition-colors">
                <Plus className="w-4 h-4" /> New key
              </button>
            </div>

            {loading ? (
              <div className="py-12 text-center text-zinc-500"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Loading keys...</div>
            ) : keys.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 py-12 px-5 text-center">
                <KeyRound className="w-8 h-8 mx-auto text-zinc-600 mb-3" />
                <div className="font-semibold text-zinc-300">No API keys yet</div>
                <p className="text-xs text-zinc-500 mt-1">Create your first key to connect an external app.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {keys.map((key) => {
                  const revoked = Boolean(key.revoked_at);
                  return (
                    <div key={key.id} className="rounded-2xl border border-zinc-800 bg-[#090C13] p-3.5 sm:p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm truncate">{key.name}</span>
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${revoked ? 'text-rose-300 bg-rose-500/10 border-rose-500/20' : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'}`}>{revoked ? 'Revoked' : 'Active'}</span>
                          </div>
                          <div className="font-mono text-xs text-zinc-400 mt-1.5">{key.key_prefix}</div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-600 mt-2">
                            <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                            <span>{key.last_used_at ? `Last used ${new Date(key.last_used_at).toLocaleString()}` : 'Never used'}</span>
                          </div>
                        </div>
                        {!revoked && <button onClick={() => handleRevoke(key)} disabled={revoking === key.id} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-rose-500/25 bg-rose-500/5 text-rose-300 text-xs font-bold hover:bg-rose-500/10 transition-colors">
                          {revoking === key.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Revoke
                        </button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-[#0B0E17] p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3"><Zap className="w-5 h-5 text-emerald-400" /><h2 className="font-bold">API access</h2></div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold">Base URL</div>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-zinc-800 bg-black/20 p-2.5">
              <code className="text-[10px] leading-relaxed text-emerald-300 break-all flex-1">{apiBaseUrl}</code>
              <button onClick={() => copy(apiBaseUrl, 'base')} className="shrink-0 p-1.5 text-zinc-400 hover:text-white"><Copy className="w-3.5 h-3.5" /></button>
            </div>
            <div className="mt-5 space-y-2.5 text-xs text-zinc-400">
              <div className="flex gap-2"><Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> Token details lookup</div>
              <div className="flex gap-2"><Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> Live token price</div>
              <div className="flex gap-2"><Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> Batch price requests</div>
              <div className="flex gap-2"><Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> API-key authentication</div>
            </div>
          </div>
        </div>

        <section className="mt-4 rounded-2xl border border-zinc-800 bg-[#0B0E17] overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center gap-2"><BookOpen className="w-5 h-5 text-emerald-400" /><div><h2 className="font-bold">Quick start</h2><p className="text-xs text-zinc-500">Make your first request in a few lines.</p></div></div>
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-zinc-800">
              <div className="text-xs font-bold text-zinc-300 mb-2">1. Generate a key</div>
              <p className="text-xs text-zinc-500 leading-relaxed">Create a key above, then store the secret in your app's server-side environment variables. The secret is shown only once.</p>
              <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-zinc-400"><span className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800">Server-side recommended</span><span className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800">Never commit keys</span></div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2"><div className="text-xs font-bold text-zinc-300">2. Call token details</div><button onClick={() => copy(curlExample, 'curl')} className="text-zinc-400 hover:text-white"><Copy className="w-3.5 h-3.5" /></button></div>
              <pre className="overflow-x-auto rounded-xl bg-[#05070B] border border-zinc-800 p-3 text-[10px] leading-relaxed text-zinc-300"><code>{curlExample}</code></pre>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pb-8">
          {[
            { icon: LockKeyhole, title: 'Private by default', text: 'Only a hash of your API key is stored. The secret is never displayed again.' },
            { icon: Laptop, title: 'Mobile + desktop', text: 'The developer workspace is responsive and optimized for both phone and desktop screens.' },
            { icon: Terminal, title: 'Simple REST API', text: 'Use standard HTTPS requests from your own backend, service, or automation.' },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-zinc-800 bg-[#0B0E17] p-4">
              <item.icon className="w-5 h-5 text-emerald-400" />
              <div className="mt-3 font-bold text-sm">{item.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{item.text}</p>
            </div>
          ))}
        </section>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/20 bg-[#0B0E17] shadow-2xl p-5">
            <div className="flex items-center justify-between"><div><h3 className="font-bold text-lg">Create API key</h3><p className="text-xs text-zinc-500 mt-1">Give this key a name so you can identify its app.</p></div><button onClick={() => setShowCreate(false)} className="p-2 text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button></div>
            <label className="block mt-5 text-xs font-bold text-zinc-300">Key name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus className="mt-2 w-full rounded-xl border border-zinc-700 bg-[#06080E] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60" placeholder="My TokenCare App" />
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/80">The full secret will be shown once after creation. Store it securely.</div>
            <button onClick={handleCreate} disabled={creating} className="mt-5 w-full rounded-xl bg-emerald-500 text-black py-2.5 text-sm font-extrabold hover:bg-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2">{creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Generate key</button>
          </div>
        </div>
      )}

      {newKey && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-emerald-500/30 bg-[#0B0E17] shadow-2xl p-5 sm:p-6">
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-emerald-400" /></div><div><h3 className="font-bold">API key created</h3><p className="text-xs text-zinc-500">Copy this secret now. It will not be shown again.</p></div></div>
            <div className="mt-5 rounded-xl border border-zinc-800 bg-[#05070B] p-3"><code className="block break-all text-xs sm:text-sm text-emerald-300 leading-relaxed">{newKey}</code></div>
            <button onClick={() => copy(newKey, 'new-key')} className="mt-3 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 py-2.5 text-xs font-bold flex items-center justify-center gap-2">{copied === 'new-key' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied === 'new-key' ? 'Copied' : 'Copy API key'}</button>
            <div className="mt-4 text-[11px] text-zinc-500 flex gap-2"><TriangleAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />Do not paste this secret into frontend source code, GitHub, screenshots, or public repositories.</div>
            <button onClick={() => { setNewKey(null); setNotice('API key is ready to use.'); }} className="mt-5 w-full rounded-xl bg-zinc-800 hover:bg-zinc-700 py-2.5 text-sm font-bold">Done</button>
          </div>
        </div>
      )}
    </div>
  );
};
