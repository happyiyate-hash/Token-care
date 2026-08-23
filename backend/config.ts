export const config = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  userWorkerUrl: process.env.USER_TOKEN_WORKER_URL || 'https://small-pine-71f9.happyiyate.workers.dev/tokens',
  globalWorkerUrl: process.env.GLOBAL_TOKEN_WORKER_URL || 'https://rough-meadow-6435.happyiyate.workers.dev/',
  rewardAmount: 5,
  requestTimeoutMs: Number(process.env.TOKEN_BACKEND_TIMEOUT_MS || 10000),
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
