/**
 * TokenCare Token Details Backend
 *
 * Unified token lookup pipeline for the donation flow.
 * The application supplies the already-detected blockchain/network and
 * contract address. The verifier handles chain-specific RPC and provider
 * routing internally and returns normalized data.
 */

import { verifyToken, VerificationRequest as BackendRequest } from '../../backend/verification/tokenVerifier';

export interface TokenDetailsRequest {
  blockchain?: string;
  chain?: string;
  contractAddress: string;
  chainId?: number | string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

export interface TokenMetadataResult {
  address?: string;
  chainId?: string | number;
  blockchain?: string;
  tokenStandard?: string;
  assetId?: string;
  chainName?: string;
  chainSymbol?: string;
  chainLogoUrl?: string;
  name?: string;
  symbol?: string;
  decimals?: number | null;
  formattedTotalSupply?: string | null;
  rawTotalSupply?: string | null;
  ownerAddress?: string | null;
  renounced?: boolean | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  telegramUrl?: string | null;
  [key: string]: unknown;
}

export interface TokenMarketDataResult {
  priceUsd?: number | null;
  priceNative?: number | null;
  change24h?: number | null;
  tradingVolume24h?: number | null;
  liquidityUsd?: number | null;
  marketCap?: number | null;
  fdv?: number | null;
  pairAddress?: string | null;
  dexName?: string | null;
  pairUrl?: string | null;
  circulatingSupply?: number | string | null;
  totalSupply?: number | string | null;
  maxSupply?: number | string | null;
  [key: string]: unknown;
}

export interface TokenSafetyResult {
  score?: number;
  rating?: string;
  recommendation?: string;
  buyTax?: number | null;
  sellTax?: number | null;
  honeypot?: boolean | null;
  mintable?: boolean | null;
  proxy?: boolean | null;
  openSource?: boolean | null;
  ownershipRenounced?: boolean | null;
  liquidityLocked?: boolean | null;
  liquidityLockedPercent?: number | null;
  top10HolderPercent?: number | null;
  holderCount?: number | null;
  pairAge?: number | null;
  warnings?: unknown[];
  checks?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TokenVerificationReport {
  trustScore?: number;
  securityScore?: number;
  marketMaturityScore?: number;
  verdict?: string;
  status?: string;
  riskRating?: string;
  recommendation?: string;
  actionableRecommendation?: string;
  warnings?: unknown[];
  passedSecurityChecks?: unknown[];
  passedMarketChecks?: unknown[];
  maturityWarnings?: unknown[];
  securityWarnings?: unknown[];
  rejectionReasons?: unknown[];
  isNewToken?: boolean;
  categoryScores?: Record<string, number>;
  providerEvidence?: Record<string, unknown>;
  securityChecks?: unknown[];
  summary?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface TokenDetailsBackendResult {
  success: boolean;
  token?: {
    metadata?: TokenMetadataResult;
    marketData?: TokenMarketDataResult;
    safety?: TokenSafetyResult;
    verificationReport?: TokenVerificationReport;
    logoReport?: unknown;
    [key: string]: unknown;
  };
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
}

export function normalizeTokenDetailsRequest(request: TokenDetailsRequest): BackendRequest {
  return {
    blockchain: (request.blockchain || request.chain || '').trim().toLowerCase(),
    chain: (request.chain || request.blockchain || '').trim().toLowerCase(),
    contractAddress: (request.contractAddress || '').trim(),
    chainId: request.chainId,
    name: request.name,
    symbol: request.symbol,
    decimals: request.decimals,
  };
}

export async function getTokenDetailsBackend(request: TokenDetailsRequest): Promise<TokenDetailsBackendResult> {
  const normalized = normalizeTokenDetailsRequest(request);

  if (!normalized.contractAddress) {
    return { success: false, error: { code: 'MISSING_CONTRACT_ADDRESS', message: "Field 'contractAddress' is required." } };
  }
  if (!normalized.blockchain) {
    return { success: false, error: { code: 'MISSING_BLOCKCHAIN', message: "Field 'blockchain' is required." } };
  }

  try {
    const result = await verifyToken(normalized);
    if (!result.success || !result.data) {
      return { success: false, error: result.error || { code: 'VERIFICATION_FAILED', message: 'Failed to verify token.' } };
    }

    const verified = result.data;
    const token = verified.token;
    const rep = verified.verification;

    return {
      success: true,
      data: verified,
      token: {
        metadata: {
          address: token.contractAddress,
          chainId: token.chainId,
          blockchain: token.blockchain,
          tokenStandard: token.assetStandard,
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          formattedTotalSupply: token.totalSupply,
          rawTotalSupply: token.totalSupply,
          ownerAddress: token.ownerAddress,
          renounced: token.isRenounced,
          logoUrl: token.logoUrl,
          websiteUrl: token.websiteUrl,
          twitterUrl: token.twitterUrl,
          telegramUrl: token.telegramUrl,
        },
        marketData: {
          priceUsd: token.priceUsd,
          priceNative: token.priceNative,
          change24h: token.priceChange24h,
          tradingVolume24h: token.volume24hUsd,
          liquidityUsd: token.liquidityUsd,
          marketCap: token.marketCapUsd,
          fdv: token.fdvUsd,
          pairAddress: token.pairAddress,
          dexName: token.dexName,
          totalSupply: token.totalSupply,
        },
        safety: {
          score: rep.trustScore,
          rating: rep.riskLevel,
          recommendation: rep.verdict,
          buyTax: rep.honeypot.buyTax,
          sellTax: rep.honeypot.sellTax,
          honeypot: rep.honeypot.isHoneypot,
          mintable: rep.ownership.canMint,
          proxy: rep.ownership.isProxy,
          ownershipRenounced: rep.ownership.isRenounced,
          liquidityLocked: rep.liquidity.isLocked,
          liquidityLockedPercent: rep.liquidity.lockedPercentage,
          top10HolderPercent: rep.holders.top10HoldersPercent,
          holderCount: rep.holders.totalHoldersEstimate,
          warnings: rep.securityIssues,
          checks: rep.providerStatus,
        },
        verificationReport: {
          trustScore: rep.trustScore,
          securityScore: rep.securityScore,
          marketMaturityScore: rep.marketMaturityScore,
          verdict: rep.verdict,
          status: rep.isPartial ? 'PARTIAL' : rep.isVerified ? 'VERIFIED' : 'UNVERIFIED',
          riskRating: rep.riskLevel,
          warnings: rep.securityIssues,
          passedSecurityChecks: rep.passedChecks,
          categoryScores: rep.categoryScores,
          providerEvidence: rep.providerStatus,
          securityChecks: [
            { name: 'honeypot', value: rep.honeypot.isHoneypot },
            { name: 'mintable', value: rep.ownership.canMint },
            { name: 'proxy', value: rep.ownership.isProxy },
            { name: 'ownershipRenounced', value: rep.ownership.isRenounced },
            { name: 'liquidityLocked', value: rep.liquidity.isLocked },
          ],
          timestamp: rep.verifiedAt,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'VERIFICATION_EXCEPTION',
        message: error instanceof Error ? error.message : 'Unexpected token verification error.',
      },
    };
  }
}
