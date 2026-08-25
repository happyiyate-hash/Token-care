/**
 * Backend Configuration
 * Reads environment variables for Vercel and Cloudflare endpoints with resilient fallbacks.
 */

export const BACKEND_CONFIG = {
  // Remote Vercel Token API URL (e.g., https://token-save-backend.vercel.app/api)
  vercelBackendUrl:
    process.env.VERCEL_TOKEN_BACKEND_URL ||
    process.env.VERCEL_TOKEN_GATEWAY_URL ||
    'https://token-save-backend.vercel.app/api',

  // Remote Cloudflare Worker URL
  cloudflareWorkerUrl:
    process.env.CLOUDFLARE_WORKER_URL ||
    process.env.GLOBAL_TOKEN_WORKER_URL ||
    'https://rough-meadow-6435.happyiyate.workers.dev/',

  // Toggle whether to proxy to remote Vercel/Cloudflare or respond locally
  forwardToRemote: process.env.FORWARD_TO_REMOTE === 'true',

  // Request timeout in milliseconds
  requestTimeoutMs: Number(process.env.BACKEND_REQUEST_TIMEOUT_MS || 8000),
};
