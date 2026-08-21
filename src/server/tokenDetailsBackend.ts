/**
 * TokenCare Token Details Backend
 *
 * Unified backend verification pipeline for the donation token lookup flow.
 *
 * Input:
 *   { blockchain: string, contractAddress: string, chainId?: number | string }
 *
 * Output:
 *   The complete token-detail shape consumed by the donation UI:
 *   metadata + marketData + safety + verificationReport.
 */

import { verifyToken, TokenDetailsRequest as BackendRequest } from '../../backend';

export interface TokenDetailsRequest {
  blockchain?: string;
  chain?: string;
  contractAddress: string;
  chainId?: number | string;
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
  decimals?: number;
  formattedTotalSupply?: string;
  rawTotalSupply?: string;
  ownerAddress?: string | null;
  renounced?: boolean;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  telegramUrl?: string | null;
  [key: string]: unknown;
}

export interface TokenMarketDataResult {
  priceUsd?: number;
  priceNative?: number;
  change24h?: number;
  tradingVolume24h?: number;
  liquidityUsd?: number;
  marketCap?: number;
  fdv?: number;
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
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function normalizeTokenDetailsRequest(
  request: TokenDetailsRequest
): BackendRequest {
  return {
    blockchain: (request.blockchain || request.chain || 'polygon').trim().toLowerCase(),
    chain: (request.chain || request.blockchain || 'polygon').trim().toLowerCase(),
    contractAddress: (request.contractAddress || '').trim(),
    chainId: request.chainId,
  };
}

/**
 * Main token details backend invocation that routes through the dynamic verification engine.
 */
export async function getTokenDetailsBackend(
  request: TokenDetailsRequest
): Promise<TokenDetailsBackendResult> {
  const normalized = normalizeTokenDetailsRequest(request);

  if (!normalized.contractAddress) {
    return {
      success: false,
      error: {
        code: 'MISSING_CONTRACT_ADDRESS',
        message: "Field 'contractAddress' is required.",
      },
    };
  }

  const result = await verifyToken(normalized);

  if (!result.success || !result.data) {
    const errObj =
      typeof result.error === 'object' && result.error !== null
        ? result.error
        : { code: 'VERIFICATION_FAILED', message: String(result.error || 'Failed to verify token') };

    return {
      success: false,
      error: errObj,
    };
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
        ownerAddress: token.ownerAddress,
        renounced: token.isRenounced,
        logoUrl: token.logoUrl,
        bannerUrl: token.bannerUrl,
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
      },
      verificationReport: {
        trustScore: rep.trustScore,
        securityScore: rep.securityScore,
        marketMaturityScore: rep.marketMaturityScore,
        verdict: rep.verdict,
        status: rep.isVerified ? 'VERIFIED' : 'UNVERIFIED',
        riskRating: rep.riskLevel,
        warnings: rep.securityIssues,
        passedSecurityChecks: rep.passedChecks,
        categoryScores: rep.categoryScores,
        timestamp: rep.verifiedAt,
      },
    },
  };
}
