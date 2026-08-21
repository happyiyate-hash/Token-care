import { NormalizedTokenDetails, TokenVerificationReport, BackendTokenDetailsResponse } from './types/tokenDetails';
import { fetchDexScreenerToken } from './providers/dexscreener';
import { fetchGeckoTerminalToken } from './providers/geckoterminal';
import { fetchCoinGeckoToken } from './providers/coingecko';
import { generateVerificationReport } from './verification/verificationReport';

/**
 * Main backend orchestrator to fetch token metadata, market metrics, logos, and verification report
 */
export async function getBackendTokenDetails(
  chain: string,
  contractAddress: string
): Promise<BackendTokenDetailsResponse> {
  const cleanAddr = contractAddress ? contractAddress.trim() : '';
  if (!cleanAddr) {
    return {
      success: false,
      error: 'Contract address is required',
    };
  }

  try {
    // 1. Primary: DexScreener (accurate pairs, high-res logos, price, liquidity, volume, market cap)
    let tokenDetails: NormalizedTokenDetails | null = await fetchDexScreenerToken(chain, cleanAddr);

    // 2. Secondary Fallback: GeckoTerminal
    if (!tokenDetails) {
      tokenDetails = await fetchGeckoTerminalToken(chain, cleanAddr);
    }

    // 3. Tertiary Fallback: CoinGecko Contract Endpoint
    if (!tokenDetails) {
      tokenDetails = await fetchCoinGeckoToken(chain, cleanAddr);
    }

    // 4. Fallback Heuristic if no public indexer has pair yet
    if (!tokenDetails) {
      const isSolana = chain.toLowerCase() === 'solana' || cleanAddr.length > 42;
      tokenDetails = {
        name: 'Custom Contract Asset',
        symbol: 'TOKEN',
        decimals: isSolana ? 9 : 18,
        contractAddress: cleanAddr,
        chain: chain,
        chainId: chain,
        blockchain: isSolana ? 'Solana' : 'EVM',
        assetStandard: isSolana ? 'SPL' : 'ERC20',
        resolvedVia: 'fallback_heuristic',
      };
    }

    // 5. Generate Security, Safety & Audit Verification Report
    const verification: TokenVerificationReport = await generateVerificationReport(tokenDetails);

    return {
      success: true,
      data: {
        token: tokenDetails,
        verification,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to resolve token details',
    };
  }
}
