import { getSupabase } from '../lib/supabase';

export interface DeveloperProject {
  id: string;
  user_id: string;
  project_name: string;
  api_key: string;
  plan_code: string;
  daily_limit: number;
  created_at: string;
  updated_at: string;
  is_active?: boolean;
  suspended_at?: string | null;
  allowed_origins?: string[];
  webhook_url?: string;
}

export interface DeveloperUsage {
  usage_date: string;
  calls: number;
  successful_calls: number;
  blocked_calls: number;
}

export interface DeveloperApiKey {
  id: string;
  name: string;
  key?: string;
  masked_key?: string;
  created_at?: string;
  last_used_at?: string;
  is_active?: boolean;
  status?: string;
  rate_limit?: number;
  usage_count?: number;
}

export interface DeveloperApiLog {
  id: string;
  timestamp: string;
  method: string;
  endpoint: string;
  status: number;
  latency_ms: number;
  action?: string;
  error_code?: string | null;
  user_agent?: string;
}

const LOCAL_STORAGE_PROJECT_KEY = 'tokencare_developer_project';

function unwrapRpc<T>(data: any): T | null {
  if (!data) return null;
  if (Array.isArray(data)) return (data[0] ?? null) as T;
  return data as T;
}

export function getLocalDeveloperProject(): DeveloperProject | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PROJECT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveLocalDeveloperProject(project: DeveloperProject | null): void {
  try {
    if (project) localStorage.setItem(LOCAL_STORAGE_PROJECT_KEY, JSON.stringify(project));
    else localStorage.removeItem(LOCAL_STORAGE_PROJECT_KEY);
  } catch (e) { console.warn('[DeveloperAPI] local cache error:', e); }
}

export async function getDeveloperProject(): Promise<DeveloperProject | null> {
  const { data, error } = await getSupabase().rpc('get_my_developer_project');
  if (error) throw new Error(error.message || 'Unable to load developer project.');
  const project = unwrapRpc<DeveloperProject>(data);
  saveLocalDeveloperProject(project);
  return project;
}

export async function createDeveloperProject(projectName: string): Promise<DeveloperProject> {
  const name = projectName.trim() || 'My TokenCare App';
  const { data, error } = await getSupabase().rpc('create_my_developer_project', { p_project_name: name });
  if (error) throw new Error(error.message || 'Unable to create developer project.');
  const project = unwrapRpc<DeveloperProject>(data);
  if (!project) throw new Error('Developer project was not returned by Supabase.');
  saveLocalDeveloperProject(project);
  return project;
}

export async function regenerateDeveloperApiKey(): Promise<string> {
  const { data, error } = await getSupabase().rpc('rotate_my_developer_api_key');
  if (error) throw new Error(error.message || 'Unable to rotate API key.');
  const project = unwrapRpc<DeveloperProject>(data);
  if (!project?.api_key) throw new Error('API key rotation did not return a key.');
  saveLocalDeveloperProject(project);
  return project.api_key;
}

export async function updateDeveloperProject(updates: Partial<Pick<DeveloperProject, 'project_name' | 'plan_code'>>): Promise<DeveloperProject> {
  const current = await getDeveloperProject();
  if (!current) throw new Error('No active developer project found.');
  const { data, error } = await getSupabase().rpc('update_my_developer_project', {
    p_project_name: updates.project_name ?? current.project_name,
    p_plan_code: updates.plan_code ?? current.plan_code,
  });
  if (error) throw new Error(error.message || 'Unable to update developer project.');
  const project = unwrapRpc<DeveloperProject>(data);
  if (!project) throw new Error('Developer project update returned no project.');
  saveLocalDeveloperProject(project);
  return project;
}

export async function deleteDeveloperProject(): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('delete_my_developer_project');
  if (error) throw new Error(error.message || 'Unable to delete developer project.');
  saveLocalDeveloperProject(null);
  return data === true || data === 'true';
}

export async function setDeveloperProjectActive(active: boolean): Promise<DeveloperProject> {
  const { data, error } = await getSupabase().rpc('set_my_developer_project_active', { p_active: active });
  if (error) throw new Error(error.message || 'Unable to change project status.');
  const project = unwrapRpc<DeveloperProject>(data);
  if (!project) throw new Error('Project status update returned no project.');
  saveLocalDeveloperProject(project);
  return project;
}

export async function getDeveloperUsage(days = 30): Promise<DeveloperUsage[]> {
  const { data, error } = await getSupabase().rpc('get_my_developer_usage', { p_days: days });
  if (error) throw new Error(error.message || 'Unable to load developer usage.');
  return Array.isArray(data) ? (data as DeveloperUsage[]) : [];
}

export async function getDeveloperApiLogs(limit = 100): Promise<DeveloperApiLog[]> {
  const { data, error } = await getSupabase().rpc('get_my_developer_logs', { p_limit: limit });
  if (error) throw new Error(error.message || 'Unable to load developer request logs.');
  return Array.isArray(data) ? data.map((row: any) => ({
    id: String(row.id), timestamp: row.timestamp, method: row.method || 'POST', endpoint: row.endpoint,
    action: row.action || undefined, status: Number(row.status ?? 0), latency_ms: Number(row.latency_ms ?? 0), error_code: row.error_code ?? null,
  })) : [];
}

/** Optimistic UI entry; the authoritative request log is written by Vercel/Supabase. */
export function recordDeveloperApiCall(options: {
  endpoint: string; method?: string; action?: string; status: number; latency_ms: number; error_code?: string | null; user_agent?: string;
}): DeveloperApiLog {
  return {
    id: `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(), method: options.method || 'POST', endpoint: options.endpoint,
    action: options.action || 'api_call', status: options.status, latency_ms: options.latency_ms, error_code: options.error_code ?? null,
    user_agent: options.user_agent,
  };
}

export function clearDeveloperApiLogs(): void {
  // Supabase owns request telemetry; the client cannot delete server history.
}

export async function listDeveloperApiKeys(): Promise<DeveloperApiKey[]> {
  const project = await getDeveloperProject(); if (!project) return [];
  const rawKey = String(project.api_key || '');
  return [{ id: project.id, name: `${project.project_name} Primary Key`, key: project.api_key,
    masked_key: rawKey ? `${rawKey.slice(0, 10)}••••••••${rawKey.slice(-4)}` : undefined,
    created_at: project.created_at, is_active: project.is_active !== false,
    status: project.is_active === false ? 'suspended' : 'active', rate_limit: project.daily_limit }];
}

export async function createDeveloperApiKey(name: string): Promise<{ key: string; apiKey: DeveloperApiKey }> {
  const project = await createDeveloperProject(name); const rawKey = String(project.api_key || '');
  return { key: project.api_key, apiKey: { id: project.id, name: project.project_name, key: project.api_key,
    masked_key: `${rawKey.slice(0, 10)}••••••••${rawKey.slice(-4)}`, created_at: project.created_at,
    is_active: project.is_active !== false, rate_limit: project.daily_limit } };
}

export async function revokeDeveloperApiKey(_id: string): Promise<boolean> { await regenerateDeveloperApiKey(); return true; }

export function getDeveloperApiBaseUrl(): string { return 'https://token-care-mwv9.vercel.app'; }
export const WORKER_BASE_URL = 'https://token-care-mwv9.vercel.app';