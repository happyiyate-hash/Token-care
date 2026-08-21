import { tokenVerificationEngine } from './core/verificationEngine';
import { blockchainRegistry } from './core/blockchainRegistry';
import {
  TokenDetailsRequest,
  BackendTokenDetailsResponse,
  NormalizedTokenDetails,
  TokenVerificationReport,
  VerifiedTokenResult,
  AssetStandard,
  OnChainTokenInspection,
} from './types/tokenDetails';

/**
 * Public Verification Engine API
 *
 * The frontend app simply sends the JSON:
 *   {
 *     blockchain: "polygon", // or "ethereum", "solana", "xrpl", "ton", "base", etc.
 *     contractAddress: "0x...",
 *     chainId?: 137
 *   }
 *
 * The backend engine resolves the proper adapter via BlockchainRegistry,
 * inspects the token on-chain, gathers provider evidence, evaluates security risk,
 * and returns the normalized verification response.
 */
export async function verifyToken(
  request: TokenDetailsRequest
): Promise<BackendTokenDetailsResponse> {
  return tokenVerificationEngine.verify(request);
}

/**
 * Helper to maintain backward compatibility with previous call signature
 */
export async function getBackendTokenDetails(
  chainOrBlockchain: string,
  contractAddress: string,
  chainId?: string | number
): Promise<BackendTokenDetailsResponse> {
  return verifyToken({
    blockchain: chainOrBlockchain,
    chain: chainOrBlockchain,
    contractAddress,
    chainId,
  });
}

export {
  tokenVerificationEngine,
  blockchainRegistry,
};

export type {
  TokenDetailsRequest,
  BackendTokenDetailsResponse,
  NormalizedTokenDetails,
  TokenVerificationReport,
  VerifiedTokenResult,
  AssetStandard,
  OnChainTokenInspection,
};
