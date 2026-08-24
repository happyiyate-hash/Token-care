export const config = {
  get supabaseUrl(): string {
    return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://pqqomaveycjeorgurpev.supabase.co';
  },
  get supabaseServiceRoleKey(): string {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  },
  get userWorkerUrl(): string {
    return process.env.USER_TOKEN_WORKER_URL || 'https://small-pine-71f9.happyiyate.workers.dev/tokens';
  },
  get globalWorkerUrl(): string {
    return process.env.GLOBAL_TOKEN_WORKER_URL || 'https://rough-meadow-6435.happyiyate.workers.dev/';
  },
  rewardAmount: 5,
  get requestTimeoutMs(): number {
    return Number(process.env.TOKEN_BACKEND_TIMEOUT_MS || 10000);
  },
};

