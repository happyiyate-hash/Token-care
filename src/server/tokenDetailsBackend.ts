/**
 * TokenCare Token Details Backend
 *
 * This is the backend-first implementation for the donation token lookup flow.
 *
 * IMPORTANT:
 * - This file is intentionally separate from the existing Cloudflare save-token
 *   Edge Functions and from the existing frontend workerApi.ts.
 * - The frontend contract must remain unchanged.
 * - Do not deploy this as an Edge Function yet.
 * - Provider implementations should be migrated here incrementally after the
 *   existing donation flow has been fully mapped.
 *
 * Input:
 *   chain + contractAddress
 *
 * Output:
 *   The complete token-detail shape consumed by the existing donation UI:
 *   metadata + marketData + safety + verificationReport (+ logo verification
 *   information where the existing flow supplies it).
 */

export interface TokenDetailsRequest {
  chain: string;
  contractAddress: string;
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
  automaticRejection?: unknown;
  onChainFallback?: unknown;
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
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function normalizeTokenDetailsRequest(
  request: TokenDetailsRequest,
): TokenDetailsRequest {
  return {
    chain: (request.chain || 'ethereum').trim().toLowerCase(),
    contractAddress: (request.contractAddress || '').trim().toLowerCase(),
  };
}

/**
 * Provider aggregation boundary.
 *
 * Each existing provider/verification operation should be moved behind this
 * boundary without changing the response consumed by the frontend.
 */
export interface TokenDetailsProviders {
  getTokenDetails: (
    request: TokenDetailsRequest,
  ) => Promise<unknown>;
  getTokenPrice?: (
    request: TokenDetailsRequest,
  ) => Promise<unknown>;
  inspectToken?: (
    request: TokenDetailsRequest,
  ) => Promise<unknown>;
  getMarketData?: (
    request: TokenDetailsRequest,
  ) => Promise<unknown>;
  getSecurityData?: (
    request: TokenDetailsRequest,
  ) => Promise<unknown>;
  getVerificationData?: (
    request: TokenDetailsRequest,
  ) => Promise<unknown>;
}

/**
 * MVP orchestration entry point.
 *
 * Deliberately does not call providers yet. The existing frontend behaviour
 * must be mapped provider-by-provider before implementation is copied here.
 */
export async function getTokenDetailsBackend(
  request: TokenDetailsRequest,
  _providers?: TokenDetailsProviders,
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

  return {
    success: false,
    error: {
      code: 'TOKEN_DETAILS_BACKEND_NOT_IMPLEMENTED',
      message:
        'Token details backend scaffold created. Provider aggregation is intentionally pending the complete donation-flow migration.',
      details: {
        chain: normalized.chain,
        contractAddress: normalized.contractAddress,
      },
    },
  };
}
