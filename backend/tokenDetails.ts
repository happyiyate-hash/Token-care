import { verifyToken } from './index';
import { BackendTokenDetailsResponse } from './types/tokenDetails';

/**
 * Main backend orchestrator to fetch token metadata, market metrics, logos, and verification report
 */
export async function getBackendTokenDetails(
  chain: string,
  contractAddress: string
): Promise<BackendTokenDetailsResponse> {
  return verifyToken({
    blockchain: chain,
    chain,
    contractAddress,
  });
}
