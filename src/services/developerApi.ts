import { getSupabase, SUPABASE_URL } from '../lib/supabase';

export interface DeveloperApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface CreatedDeveloperApiKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  scopes: string[];
  created_at: string;
}

export async function listDeveloperApiKeys(): Promise<DeveloperApiKey[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('developer_api_keys')
    .select('id,name,key_prefix,scopes,revoked_at,last_used_at,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as DeveloperApiKey[];
}

export async function createDeveloperApiKey(name: string): Promise<CreatedDeveloperApiKey> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('create_developer_api_key', {
    p_name: name.trim() || 'Default API key',
  });
  if (error) throw error;
  return data as CreatedDeveloperApiKey;
}

export async function revokeDeveloperApiKey(id: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('revoke_developer_api_key', {
    p_key_id: id,
  });
  if (error) throw error;
  return data === true || data === 'true';
}

export function getDeveloperApiBaseUrl(): string {
  return `${SUPABASE_URL}/functions/v1/developer-api`;
}
