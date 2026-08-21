import type { VercelRequest, VercelResponse } from '@vercel/node';
import { uploadToken } from '../backend';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-API-Key, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const authHeader = req.headers.authorization;
    const payload = req.body || req.query;

    const result = await uploadToken(payload, authHeader);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      status: 'failed',
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: err?.message || 'Internal Server Error during token upload workflow',
      },
      timestamp: new Date().toISOString(),
    });
  }
}
