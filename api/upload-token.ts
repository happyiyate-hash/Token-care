import { uploadToken } from '../backend/index';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const authHeader = req.headers.authorization;
    const payload = req.body || req.query;
    const result = await uploadToken(payload, authHeader);
    return res.status(result.success ? 200 : (result.error === 'TOKEN_ALREADY_EXISTS' ? 409 : 400)).json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, status: 'failed', error: { code: 'INTERNAL_SERVER_ERROR', message: err?.message || 'Internal Server Error during token upload workflow' } });
  }
}
