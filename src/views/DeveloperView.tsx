import React, { useEffect, useMemo, useState } from 'react';
import { Play, RefreshCw, ScrollText, Server, Settings, Zap } from 'lucide-react';
import { createDeveloperProject, deleteDeveloperProject, DeveloperApiLog, DeveloperProject, getDeveloperApiBaseUrl, getDeveloperApiLogs, getDeveloperProject, getDeveloperUsage, regenerateDeveloperApiKey, recordDeveloperApiCall, updateDeveloperProject } from '../services/developerApi';

interface DeveloperViewProps { onBack?: () => void; currentUser?: any; }
type Tab = 'rpc' | 'overview' | 'logs' | 'settings';
type Endpoint = { id: string; name: string; action: string; body: Record<string, any> };

const API_URL = `${getDeveloperApiBaseUrl()}/api/developer`;
const POLYGON_TOKEN = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619';
const POLYGON_USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// The Developer RPC page deliberately exposes the complete JSON contract as editable test presets.
const ENDPOINTS: Endpoint[] = [
  { id: 'all', name: 'Get All Tokens', action: 'getAllTokens', body: { action: 'getAllTokens' } },
  { id: 'chain', name: 'Get Tokens by Blockchain', action: 'getTokensByBlockchain', body: { action: 'getTokensByBlockchain', blockchain: 'polygon' } },
  { id: 'address', name: 'Get Token by Address', action: 'getTokenByAddress', body: { action: 'getTokenByAddress', blockchain: 'polygon', contractAddress: POLYGON_TOKEN } },
  { id: 'details', name: 'Get Token Details', action: 'getTokenDetails', body: { action: 'getTokenDetails', chain: 'polygon', contractAddress: POLYGON_TOKEN } },
  { id: 'price', name: 'Get Token Price', action: 'getTokenPrice', body: { action: 'getTokenPrice', chain: 'polygon', contractAddress: POLYGON_TOKEN } },
  { id: 'prices', name: 'Get Token Prices', action: 'getTokenPrices', body: { action: 'getTokenPrices', tokens: [{ chain: 'polygon', contractAddress: POLYGON_TOKEN }, { chain: 'polygon', contractAddress: POLYGON_USDC }] } },
  { id: 'inspect', name: 'Inspect Token', action: 'inspectToken', body: { action: 'inspectToken', chain: 'polygon', contractAddress: POLYGON_TOKEN } },
  { id: 'contract', name: 'Inspect Contract', action: 'inspectContract', body: { action: 'inspectContract', blockchain: 'polygon', contractAddress: POLYGON_TOKEN } },
  { id: 'chart', name: 'Get Token Chart', action: 'getTokenChart', body: { action: 'getTokenChart', chain: 'polygon', contractAddress: POLYGON_TOKEN, interval: '1h', limit: 100 } },
];

const json = (v: any) => JSON.stringify(v, null, 2);

export default function DeveloperView({ onBack }: DeveloperViewProps) {
  const [tab, setTab] = useState<Tab>('rpc');
  const [project, setProject] = useState<DeveloperProject | null>(null);
  const [usage, setUsage] = useState<any[]>([]);
  const [logs, setLogs] = useState<DeveloperApiLog[]>([]);
  const [selectedId, setSelectedId] = useState('all');
  const [body, setBody] = useState(json(ENDPOINTS[0].body));
  const [result, setResult] = useState('');
  const [status, setStatus] = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [showKey, setShowKey] = useState(false);

  const selected = useMemo(() => ENDPOINTS.find(x => x.id === selectedId) || ENDPOINTS[0], [selectedId]);
  const today = new Date().toISOString().slice(0, 10);
  const todayCalls = usage.find(x => x.usage_date === today)?.calls ?? logs.filter(x => x.timestamp.startsWith(today)).length;
  const limit = project?.daily_limit ?? 5000;

  const load = async () => {
    try {
      const [p, u] = await Promise.all([getDeveloperProject(), getDeveloperUsage(30)]);
      setProject(p); setName(p?.project_name || ''); setUsage(u || []); setLogs(getDeveloperApiLogs());
    } catch (e: any) { setMessage(e?.message || 'Unable to load developer data.'); }
  };
  useEffect(() => { load(); }, []);

  const select = (id: string) => { const e = ENDPOINTS.find(x => x.id === id) || ENDPOINTS[0]; setSelectedId(e.id); setBody(json(e.body)); setResult(''); setStatus(null); setLatency(null); };

  const run = async () => {
    setTesting(true); setResult(''); setStatus(null); setLatency(null); setMessage('');
    let payload: any;
    try { payload = JSON.parse(body); if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('JSON body must be an object.'); }
    catch (e: any) { setStatus(400); setResult(json({ success: false, error: 'INVALID_JSON', message: e?.message })); setTesting(false); return; }
    const started = performance.now();
    try {
      const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': project?.api_key || '' }, body: JSON.stringify(payload) });
      const elapsed = Math.round(performance.now() - started); setLatency(elapsed); setStatus(res.status);
      const raw = await res.text(); let data: any; try { data = JSON.parse(raw); } catch { data = { raw }; }
      setResult(json(data));
      const log = recordDeveloperApiCall({ endpoint: '/api/developer', method: 'POST', action: String(payload.action || selected.action), status: res.status, latency_ms: elapsed });
      setLogs(prev => [log, ...prev].slice(0, 50));
    } catch (e: any) {
      const elapsed = Math.round(performance.now() - started); setLatency(elapsed); setStatus(0);
      setResult(json({ success: false, error: 'NETWORK_ERROR', message: e?.message || 'Request failed.' }));
    } finally { setTesting(false); }
  };

  const create = async () => { try { const p = await createDeveloperProject(name.trim() || 'My TokenCare App'); setProject(p); setMessage('Developer project created.'); await load(); } catch (e: any) { setMessage(e?.message || 'Create failed.'); } };
  const rotate = async () => { try { const key = await regenerateDeveloperApiKey(); if (project) setProject({ ...project, api_key: key }); setMessage('API key rotated.'); await load(); } catch (e: any) { setMessage(e?.message || 'Rotate failed.'); } };
  const save = async () => { if (!project) return; try { const p = await updateDeveloperProject({ project_name: name.trim() || project.project_name }); setProject(p); setMessage('Project saved.'); } catch (e: any) { setMessage(e?.message || 'Save failed.'); } };
  const remove = async () => { if (!confirm('Delete this Developer project and revoke its key?')) return; try { await deleteDeveloperProject(); setProject(null); setMessage('Project deleted.'); } catch (e: any) { setMessage(e?.message || 'Delete failed.'); } };

  return <div className="flex-1 w-full h-full min-h-0 overflow-auto bg-[#030710] text-white p-3 sm:p-5"><div className="max-w-7xl mx-auto space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3"><div className="flex items-center gap-3">{onBack && <button onClick={onBack} className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900 text-xs">Back</button>}<div><div className="flex items-center gap-2"><Zap className="w-5 h-5 text-[#00E575]"/><h1 className="text-lg font-bold">Developer RPC Console</h1></div><p className="text-xs text-zinc-500">9 JSON actions • Vercel gateway</p></div></div><div className="flex gap-1 rounded-lg bg-zinc-900 p-1 border border-zinc-800">{([['rpc','RPC Tester'],['overview','Quota'],['logs','Logs'],['settings','Settings']] as [Tab,string][]).map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={`px-3 py-1.5 rounded text-xs font-bold ${tab===id?'bg-[#00E575] text-black':'text-zinc-400'}`}>{label}</button>)}</div></header>
    {message && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{message}</div>}
    <div className="rounded-xl border border-zinc-800 bg-[#070A14] p-3 flex flex-wrap items-center gap-2"><span className="text-xs text-zinc-500 font-bold">POST</span><code className="flex-1 min-w-[280px] bg-black/30 border border-zinc-800 rounded px-3 py-2 text-xs text-[#00E575]">{API_URL}</code><span className="inline-flex items-center gap-1 text-xs text-emerald-400"><Server className="w-3.5 h-3.5"/>Vercel</span></div>

    {tab === 'rpc' && <div className="grid lg:grid-cols-[300px_1fr] gap-4"><aside className="rounded-xl border border-zinc-800 bg-[#070A14] p-3"><div className="flex justify-between mb-2"><b className="text-sm">JSON Actions</b><span className="text-[10px] text-zinc-500">9</span></div>{ENDPOINTS.map((e,i) => <button key={e.id} onClick={() => select(e.id)} className={`w-full text-left p-2.5 rounded-lg border mb-1 ${selected.id===e.id?'border-[#00E575]/50 bg-[#00E575]/10':'border-zinc-800 bg-black/10'}`}><span className="text-[10px] text-[#00E575] mr-2">{i+1}.</span><span className="text-xs font-bold">{e.name}</span><div className="ml-5 text-[10px] font-mono text-zinc-500">{e.action}</div></button>)}</aside><main className="space-y-4"><section className="rounded-xl border border-zinc-800 bg-[#070A14] p-4"><div className="flex justify-between gap-2 mb-2"><div><h2 className="font-bold">{selected.name}</h2><p className="text-[10px] text-zinc-500">POST /api/developer • x-api-key header</p></div><button onClick={() => setBody(json(selected.body))} className="px-2 py-1 rounded border border-zinc-700 text-[10px]">Reset</button></div><textarea value={body} onChange={e=>setBody(e.target.value)} spellCheck={false} className="w-full min-h-[250px] rounded-lg bg-black/50 border border-zinc-700 p-3 font-mono text-xs text-zinc-200"/><div className="flex justify-end mt-3"><button disabled={testing} onClick={run} className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#00E575] text-black text-xs font-bold disabled:opacity-50"><Play className="w-3.5 h-3.5"/>{testing?'Calling Vercel…':'Run JSON Request'}</button></div></section><section className="rounded-xl border border-zinc-800 bg-[#070A14] p-4"><div className="flex justify-between mb-2"><b className="text-sm">Response Output</b><span className="text-[10px] font-mono text-zinc-500">{status===null?'—':status} • {latency===null?'—':`${latency} ms`}</span></div><pre className="min-h-[280px] max-h-[600px] overflow-auto rounded-lg bg-black/60 border border-zinc-800 p-3 text-[11px] text-zinc-300">{result || 'Run the selected JSON action. The exact Vercel response will appear here.'}</pre></section></main></div>}

    {tab === 'overview' && <div className="grid md:grid-cols-3 gap-4"><div className="rounded-xl border border-zinc-800 bg-[#070A14] p-4"><div className="text-xs text-zinc-500">Calls today</div><div className="text-2xl font-bold">{todayCalls}</div><div className="text-[10px] text-zinc-500">of {limit}</div></div><div className="rounded-xl border border-zinc-800 bg-[#070A14] p-4"><div className="text-xs text-zinc-500">Remaining</div><div className="text-2xl font-bold text-[#00E575]">{Math.max(0,limit-todayCalls)}</div><div className="text-[10px] text-zinc-500">Backend authoritative</div></div><div className="rounded-xl border border-zinc-800 bg-[#070A14] p-4"><div className="text-xs text-zinc-500">Project</div><div className="text-sm font-bold">{project?.project_name || 'No project'}</div></div></div>}
    {tab === 'logs' && <section className="rounded-xl border border-zinc-800 bg-[#070A14] p-4"><div className="flex items-center gap-2 mb-3"><ScrollText className="w-4 h-4 text-[#00E575]"/><b>Request Logs</b></div>{logs.length ? logs.map(l=><div key={l.id} className="flex flex-wrap gap-3 border-b border-zinc-800 py-2 text-[10px]"><span className="text-zinc-500">{new Date(l.timestamp).toLocaleString()}</span><b className="text-[#00E575]">{l.action}</b><span>{l.status}</span><span>{l.latency_ms}ms</span><span className="text-zinc-500">{l.endpoint}</span></div>) : <p className="text-xs text-zinc-500">No requests yet.</p>}</section>}
    {tab === 'settings' && <section className="max-w-2xl rounded-xl border border-zinc-800 bg-[#070A14] p-4 space-y-4"><div className="flex items-center gap-2"><Settings className="w-4 h-4 text-[#00E575]"/><b>Developer Project</b></div>{!project ? <button onClick={create} className="px-4 py-2 rounded-lg bg-[#00E575] text-black text-xs font-bold">Create Developer Project</button> : <><input value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-lg bg-black/40 border border-zinc-800 px-3 py-2 text-sm"/><div className="rounded-lg border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500">API key</div><code className="text-xs break-all">{showKey?project.api_key:'••••••••••••••••••••••••'}</code><button onClick={()=>setShowKey(!showKey)} className="ml-3 text-[10px] text-[#00E575]">{showKey?'Hide':'Show'}</button></div><div className="flex flex-wrap gap-2"><button onClick={save} className="px-3 py-2 rounded bg-[#00E575] text-black text-xs font-bold">Save</button><button onClick={rotate} className="inline-flex items-center gap-1 px-3 py-2 rounded border border-zinc-700 text-xs"><RefreshCw className="w-3 h-3"/>Rotate key</button><button onClick={remove} className="px-3 py-2 rounded border border-red-500/30 text-red-300 text-xs">Delete</button></div></>}</section>}
    <p className="text-[10px] text-zinc-600">The JSON presets are client-side test definitions. The request is sent only to Vercel. Quota deduction is intentionally not simulated by the page; the backend remains the source of truth.</p>
  </div></div>;
}
