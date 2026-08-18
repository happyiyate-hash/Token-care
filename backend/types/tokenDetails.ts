export interface TokenDetailsRequest {
  chain: string;
  contractAddress: string;
}

export interface TokenMetadata {
  address?: string;
  chainId?: string;
  blockchainType?: string;
  blockchainName?: string;
  tokenStandard?: string;
  assetIdentifierType?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: number | string;
  rawTotalSupply?: string;
  circulatingSupply?: number | string;
  maxSupply?: number | string;
  ownerAddress?: string;
  renounced?: boolean;
  logoUrl?: string;
}

export interface MarketData {
  priceUsd?: number;
  priceNative?: number;
  priceChange24h?: number;
  volume24h?: number;
  liquidityUsd?: number;
  marketCapUsd?: number;
  fdvUsd?: number;
  pairAddress?: string;
  dexName?: string;
  pairUrl?: string;
  circulatingSupply?: number;
  totalSupply?: number;
  maxSupply?: number;
}

export interface SafetyData {
  score?: number;
  rating?: string;
  recommendation?: string;
  buyTax?: number;
  sellTax?: number;
  honeypot?: boolean;
  mintable?: boolean;
  proxy?: boolean;
  openSource?: boolean;
  ownershipRenounced?: boolean;
  liquidityLocked?: boolean;
  liquidityLockedPercentage?: number;
  top10HolderPercentage?: number;
  holderCount?: number;
  pairAge?: number;
  warnings?: string[];
  checks?: Record<string, unknown>;
}

export interface VerificationReport {
  trustScore?: number;
  securityScore?: number;
  marketMaturityScore?: number;
  verdict?: string;
  status?: string;
  riskRating?: string;
  recommendation?: string;
  actionableRecommendation?: string;
  warnings?: string[];
  passedSecurityChecks?: string[];
  passedMarketChecks?: string[];
  maturityWarnings?: string[];
  securityWarnings?: string[];
  rejectionReasons?: string[];
  newToken?: boolean;
  categoryScores?: Record<string, number>;
  providerEvidence?: Record<string, unknown>;
  automaticRejection?: unknown;
  securityChecks?: Record<string, unknown>;
  summary?: string;
  timestamp?: string;
}

export interface LogoReport {
  status?: string;
  verified?: boolean;
  url?: string;
  reason?: string;
}

export interface CompleteTokenDetails {
  success: boolean;
  metadata?: TokenMetadata;
  marketData?: MarketData;
  safety?: SafetyData;
  verificationReport?: VerificationReport;
  logoReport?: LogoReport;
  error?: string;
}
