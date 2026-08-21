import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '../backend';

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
    const blockchain = (req.query.blockchain as string) || (req.body?.blockchain as string) || (req.query.chain as string) || (req.body?.chain as string) || 'polygon';
    const chainId = (req.query.chainId as string) || (req.body?.chainId as string);
    const contractAddress = (req.query.address as string) || (req.query.contractAddress as string) || (req.body?.contractAddress as string) || (req.body?.address as string) || '';

    if (!contractAddress) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CONTRACT_ADDRESS',
          message: 'Missing required parameter: "contractAddress" or "address"',
        },
      });
    }

    const result = await verifyToken({
      blockchain,
      chain: blockchain,
      chainId,
      contractAddress,
    });

    return res.status(result.success ? 200 : 400).json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: err?.message || 'Internal Server Error while verifying token',
      },
    });
  }
}
