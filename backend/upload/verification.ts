import { TokenUploadRequest, VerificationResult } from '../types/upload';
import { verifyToken as runTokenVerification } from '../verification/tokenVerifier';

/**
 * Runs the same multichain verification pipeline used by token details.
 * The upload workflow must never trust the frontend's `verified` flag.
 */
export async function verifyToken(token: TokenUploadRequest): Promise<VerificationResult> {
  const result = await runTokenVerification({
    blockchain: token.blockchain,
    chainId: token.chainId,
    contractAddress: token.contractAddress,
    name: token.name,
    symbol: token.symbol,
    decimals: token.decimals,
  });

  if (!result.success || !result.data) {
    return {
      isVerified: false,
      message: result.error?.message || 'Token verification failed.',
      details: result.error?.details as Record<string, unknown> | undefined,
    };
  }

  const verification = result.data.verification;
  const tokenData = result.data.token;

  return {
    isVerified: verification.isVerified,
    message: verification.isPartial
      ? 'Token verification completed with partial provider coverage.'
      : 'Token verification completed.',
    details: {
      token: tokenData,
      verification,
    },
  };
}
