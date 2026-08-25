/**
 * Standalone Vercel Serverless Function
 *
 * If you deploy this to Vercel separately:
 * 1. Place this file inside your Vercel repo at `/api/token.js` (or `/api/token.ts`).
 * 2. In Vercel Project Settings > Deployment Protection, disable Vercel Authentication.
 * 3. Set environment variable VERCEL_TOKEN_BACKEND_URL or CLOUDFLARE_WORKER_URL if forwarding.
 */

import { handleTokenRequest } from './tokenHandler';

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET request (Health check / Info)
  if (req.method === 'GET') {
    const health = await handleTokenRequest({ action: 'health' });
    return res.status(200).json(health);
  }

  // Handle POST request
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const result = await handleTokenRequest(body);
    const statusCode = result.success === false && result.error && !result.saved ? 400 : 200;
    return res.status(statusCode).json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: 'Vercel Function Error',
      message: error?.message || 'Failed to handle request.',
    });
  }
}
