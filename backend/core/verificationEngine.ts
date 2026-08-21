import {
  TokenDetailsRequest,
  NormalizedTokenDetails,
  VerifiedTokenResult,
  BackendTokenDetailsResponse,
  OnChainTokenInspection,
} from '../types/tokenDetails';
import { blockchainRegistry } from './blockchainRegistry';
import { fetchDexScreenerToken } from '../providers/dexscreener';
import { fetchGeckoTerminalToken } from '../providers/geckoterminal';
import { fetchCoinGeckoToken } from '../providers/coingecko';
import { evaluateTokenRisk } from '../security/riskEngine';

export class TokenVerificationEngine {
  /**
   * Main verification entry point.
   * The front-end only sends the JSON request:
   *   { blockchain: string, contractAddress: string, chainId?: number | string }
   * The engine uses the BlockchainRegistry to resolve the adapter and coordinate
   * on-chain inspection, market providers, and security risk analysis.
   */
  async verify(request: TokenDetailsRequest): Promise<BackendTokenDetailsResponse> {
    const rawAddress = (request.contractAddress || request.address || '').trim();
    const rawBlockchain = request.blockchain || request.chain || request.chainId;

    if (!rawAddress) {
      return {
        success: false,
        error: {
          code: 'MISSING_CONTRACT_ADDRESS',
          message: "Field 'contractAddress' is required.",
        },
      };
    }

    // 1. Resolve Blockchain Adapter from Registry
    const resolvedContext = blockchainRegistry.resolve(rawBlockchain, rawAddress);
    const { adapter, canonicalBlockchainName, chainIdentifier } = resolvedContext;

    // 2. Validate Address syntax via Adapter
    const validation = adapter.validateAddress(rawAddress);
    if (!validation.isValid) {
      return {
        success: false,
        error: {
          code: 'INVALID_CONTRACT_ADDRESS',
          message: validation.error || `Invalid contract address for ${canonicalBlockchainName}.`,
        },
      };
    }

    const cleanAddress = validation.normalizedAddress;

    try {
      // 3. Perform On-Chain Contract Inspection & Provider Queries in Parallel
      const [onChainInspection, dexData, geckoTerminalData, coinGeckoData] = await Promise.all([
        adapter.inspectOnChain(cleanAddress, chainIdentifier).catch(() => null),
        fetchDexScreenerToken(String(chainIdentifier), cleanAddress).catch(() => null),
        fetchGeckoTerminalToken(String(chainIdentifier), cleanAddress).catch(() => null),
        fetchCoinGeckoToken(String(chainIdentifier), cleanAddress).catch(() => null),
      ]);

      const primaryProvider = dexData || geckoTerminalData || coinGeckoData;

      // 4. Strict Resolution Check:
      // If contract has no on-chain validity AND no market provider resolved it, reject!
      const hasOnChainRecord = Boolean(onChainInspection && onChainInspection.hasBytecode !== false);
      if (!hasOnChainRecord && !primaryProvider) {
        return {
          success: false,
          error: {
            code: 'CONTRACT_NOT_RESOLVED',
            message: `Unable to inspect or verify token contract "${cleanAddress}" on ${canonicalBlockchainName}. Please confirm the address and network.`,
            details: {
              blockchain: canonicalBlockchainName,
              chainIdentifier,
              contractAddress: cleanAddress,
            },
          },
        };
      }

      // 5. Merge Ground Truth (On-chain data takes precedence for supply/decimals/name/symbol, providers for market/logo)
      const finalName =
        onChainInspection?.name ||
        primaryProvider?.name ||
        'Verified Token';

      const finalSymbol = (
        onChainInspection?.symbol ||
        primaryProvider?.symbol ||
        'TOKEN'
      ).toUpperCase();

      const finalDecimals =
        typeof onChainInspection?.decimals === 'number'
          ? onChainInspection.decimals
          : typeof primaryProvider?.decimals === 'number'
          ? primaryProvider.decimals
          : 18;

      const finalTotalSupply =
        onChainInspection?.totalSupply || primaryProvider?.totalSupply;

      const normalizedToken: NormalizedTokenDetails = {
        name: finalName,
        symbol: finalSymbol,
        decimals: finalDecimals,
        contractAddress: cleanAddress,
        chain: String(chainIdentifier),
        chainId: chainIdentifier,
        blockchain: canonicalBlockchainName,
        assetStandard: adapter.defaultStandard,
        logoUrl: primaryProvider?.logoUrl,
        bannerUrl: primaryProvider?.bannerUrl,
        websiteUrl: primaryProvider?.websiteUrl,
        telegramUrl: primaryProvider?.telegramUrl,
        twitterUrl: primaryProvider?.twitterUrl,
        discordUrl: primaryProvider?.discordUrl,
        priceUsd: primaryProvider?.priceUsd,
        priceNative: primaryProvider?.priceNative,
        liquidityUsd: primaryProvider?.liquidityUsd || 0,
        fdvUsd: primaryProvider?.fdvUsd,
        marketCapUsd: primaryProvider?.marketCapUsd,
        volume24hUsd: primaryProvider?.volume24hUsd || 0,
        priceChange24h: primaryProvider?.priceChange24h || 0,
        pairAddress: primaryProvider?.pairAddress,
        dexName: primaryProvider?.dexName,
        totalSupply: finalTotalSupply,
        ownerAddress: onChainInspection?.ownerAddress,
        isRenounced: onChainInspection?.isRenounced,
        canMint: onChainInspection?.canMint,
        isProxy: onChainInspection?.isProxy,
        resolvedVia: onChainInspection ? 'hybrid' : 'dexscreener',
      };

      // 6. Security, Safety & Risk Analysis
      const verificationReport = evaluateTokenRisk(normalizedToken, onChainInspection);

      const verifiedResult: VerifiedTokenResult = {
        token: normalizedToken,
        onChainInspection: onChainInspection || undefined,
        verification: verificationReport,
        market: {
          priceUsd: normalizedToken.priceUsd,
          volume24hUsd: normalizedToken.volume24hUsd,
          liquidityUsd: normalizedToken.liquidityUsd,
          fdvUsd: normalizedToken.fdvUsd,
          marketCapUsd: normalizedToken.marketCapUsd,
          priceChange24h: normalizedToken.priceChange24h,
          pairAddress: normalizedToken.pairAddress,
          dexName: normalizedToken.dexName,
        },
      };

      return {
        success: true,
        data: verifiedResult,
        token: normalizedToken,
        verification: verificationReport,
      };
    } catch (err: any) {
      console.error('[TokenVerificationEngine Error]:', err);
      return {
        success: false,
        error: {
          code: 'VERIFICATION_EXECUTION_ERROR',
          message: err?.message || 'Unexpected error during token verification pipeline execution.',
        },
      };
    }
  }
}

export const tokenVerificationEngine = new TokenVerificationEngine();
