import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '../backend/verification/tokenVerifier';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } });

  try {
    const body = req.body || {};
    const result = await verifyToken({
      blockchain: body.blockchain || body.chain,
      chain: body.chain || body.blockchain,
      chainId: body.chainId,
      contractAddress: body.contractAddress,
      name: body.name,
      symbol: body.symbol,
      decimals: body.decimals,
    });

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'VERIFICATION_EXCEPTION',
        message: error instanceof Error ? error.message : 'Unexpected verification error.',
      },
    });
  }
}
