export interface NormalizedTokenDetails {
  name: string;
  symbol: string;
  decimals: number;
  contractAddress: string;
  chain: string;
  chainId: string;
  blockchain: string;
  assetStandard: 'ERC20' | 'SPL' | 'BEP20' | 'NATIVE' | 'UNKNOWN';
  logoUrl?: string;
  bannerUrl?: string;
  websiteUrl?: string;
  telegramUrl?: string;
  twitterUrl?: string;
  discordUrl?: string;
  priceUsd?: number;
  liquidityUsd?: number;
  fdvUsd?: number;
  marketCapUsd?: number;
  volume24hUsd?: number;
  priceChange24h?: number;
  pairAddress?: string;
  dexName?: string;
  totalSupply?: string;
  resolvedVia: 'dexscreener' | 'geckoterminal' | 'coingecko' | 'alchemy' | 'moralis' | 'chain_rpc' | 'fallback_heuristic';
}

export interface TokenVerificationReport {
  isVerified: boolean;
  trustScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  honeypot: {
    isHoneypot: boolean;
    buyTax: number;
    sellTax: number;
    transferTax?: number;
    canModifyTax: boolean;
  };
  securityIssues: string[];
  ownership: {
    isRenounced: boolean;
    ownerAddress?: string;
    canMint: boolean;
    isProxy: boolean;
    canBlacklist: boolean;
  };
  liquidity: {
    isLocked: boolean;
    lockedPercentage: number;
    totalLiquidityUsd: number;
  };
  holders: {
    top10HoldersPercent: number;
    totalHoldersEstimate: number;
  };
  verifiedAt: string;
  auditBadge: string;
}

export interface BackendTokenDetailsResponse {
  success: boolean;
  data?: {
    token: NormalizedTokenDetails;
    verification: TokenVerificationReport;
  };
  error?: string;
}
