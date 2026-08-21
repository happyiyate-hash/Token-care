import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendTokenDetails } from '../backend/tokenDetails';

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
    const chain = (req.query.chain as string) || (req.body?.chain as string) || '137';
    const address = (req.query.address as string) || (req.body?.address as string) || (req.body?.contractAddress as string) || '';

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query or body parameter: "address"',
      });
    }

    const result = await getBackendTokenDetails(chain, address);
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal Server Error while resolving token details',
    });
  }
}
