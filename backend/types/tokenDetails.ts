export interface TokenDetailsRequest {
  blockchain?: string;
  chain?: string;
  contractAddress: string;
  address?: string;
  chainId?: string | number;
}

export type AssetStandard = 'ERC20' | 'SPL' | 'BEP20' | 'XRPL_ISSUED' | 'JETTON' | 'NATIVE' | 'UNKNOWN';

export interface OnChainTokenInspection {
  isValidContract: boolean;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
  rawTotalSupply?: string;
  ownerAddress?: string | null;
  isRenounced?: boolean;
  canMint?: boolean;
  isProxy?: boolean;
  implementationAddress?: string | null;
  freezeAuthority?: string | null;
  mintAuthority?: string | null;
  isBlacklistable?: boolean;
  hasBytecode?: boolean;
  inspectedVia: string;
}

export interface NormalizedTokenDetails {
  name: string;
  symbol: string;
  decimals: number;
  contractAddress: string;
  chain: string;
  chainId: string | number;
  blockchain: string;
  assetStandard: AssetStandard;
  logoUrl?: string;
  bannerUrl?: string;
  websiteUrl?: string;
  telegramUrl?: string;
  twitterUrl?: string;
  discordUrl?: string;
  priceUsd?: number;
  priceNative?: number;
  liquidityUsd?: number;
  fdvUsd?: number;
  marketCapUsd?: number;
  volume24hUsd?: number;
  priceChange24h?: number;
  pairAddress?: string;
  dexName?: string;
  totalSupply?: string;
  ownerAddress?: string | null;
  isRenounced?: boolean;
  canMint?: boolean;
  isProxy?: boolean;
  resolvedVia: 'onchain_rpc' | 'dexscreener' | 'geckoterminal' | 'coingecko' | 'hybrid';
}

export interface HoneypotAnalysis {
  isHoneypot: boolean;
  buyTax: number;
  sellTax: number;
  transferTax?: number;
  canModifyTax: boolean;
}

export interface OwnershipAnalysis {
  isRenounced: boolean;
  ownerAddress?: string | null;
  canMint: boolean;
  isProxy: boolean;
  canBlacklist: boolean;
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
}

export interface LiquidityAnalysis {
  isLocked: boolean;
  lockedPercentage: number;
  totalLiquidityUsd: number;
  pairAddress?: string;
  dexName?: string;
}

export interface HolderDistribution {
  top10HoldersPercent: number;
  totalHoldersEstimate: number;
}

export interface TokenVerificationReport {
  isVerified: boolean;
  trustScore: number; // 0 - 100
  securityScore: number;
  marketMaturityScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  verdict: 'APPROVED_LOW_RISK' | 'NEEDS_OBSERVATION' | 'HIGH_RISK_WARNING' | 'REJECTED_CRITICAL_RISK';
  auditBadge: string;
  honeypot: HoneypotAnalysis;
  ownership: OwnershipAnalysis;
  liquidity: LiquidityAnalysis;
  holders: HolderDistribution;
  securityIssues: string[];
  passedChecks: string[];
  categoryScores: {
    security: number;
    liquidity: number;
    marketData: number;
    tradingActivity: number;
    holders: number;
    contractVerification: number;
    metadata: number;
  };
  verifiedAt: string;
}

export interface VerifiedTokenResult {
  token: NormalizedTokenDetails;
  onChainInspection?: OnChainTokenInspection;
  verification: TokenVerificationReport;
  market?: {
    priceUsd?: number;
    volume24hUsd?: number;
    liquidityUsd?: number;
    fdvUsd?: number;
    marketCapUsd?: number;
    priceChange24h?: number;
    pairAddress?: string;
    dexName?: string;
  };
}

export interface BackendTokenDetailsResponse {
  success: boolean;
  data?: VerifiedTokenResult;
  token?: NormalizedTokenDetails; // For backward compatibility
  verification?: TokenVerificationReport; // For backward compatibility
  error?: {
    code: string;
    message: string;
    details?: unknown;
  } | string;
}
