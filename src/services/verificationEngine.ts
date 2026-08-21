import { verifyToken as runMultichainVerification } from '../../backend/verification/tokenVerifier';

export interface TrustScoreCategory {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  weightPct: number;
  details: string;
}

export interface CategoryScores {
  security: TrustScoreCategory;
  liquidity: TrustScoreCategory;
  marketData: TrustScoreCategory;
  tradingActivity: TrustScoreCategory;
  holders: TrustScoreCategory;
  blockchainMetadata: TrustScoreCategory;
  contractVerification: TrustScoreCategory;
  logoQuality: TrustScoreCategory;
  community: TrustScoreCategory;
}

export interface ProviderEvidence {
  providerId: 'coingecko' | 'dexscreener' | 'dextools' | 'geckoterminal' | 'goplus' | 'honeypotis' | 'tokensniffer' | 'explorer' | 'defillama' | 'rugcheck';
  name: string;
  endpoint: string;
  status: 'verified' | 'warning' | 'unlisted' | 'failed';
  score: number;
  maxScore: number;
  weightPct: number;
  dataPoints: string[];
  lastChecked: string;
}

export type AuditVerdict =
  | 'APPROVED_EXCELLENT'
  | 'APPROVED_LOW_RISK'
  | 'ACCEPTED_MEDIUM_RISK'
  | 'HIGH_RISK_WARN'
  | 'REJECTED'
  | 'APPROVED'
  | 'NEEDS_OBSERVATION'
  | 'HIGH_RISK';

export interface VerificationReport {
  contractAddress: string;
  chainId: string;
  rawScore: number;
  maxRawScore: number;
  trustScore: number;
  securityScore: number;
  marketMaturityScore: number;
  verdict: AuditVerdict;
  verdictLabel: string;
  status: 'APPROVED' | 'NEEDS_REVIEW' | 'HIGH_RISK' | 'REJECTED';
  riskRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendation: string;
  actionableRecommendation: string;
  warnings: string[];
  passedSecurity: string[];
  passedMarket: string[];
  maturityWarnings: string[];
  securityWarnings: string[];
  whyNotApproved: string[];
  isNewToken: boolean;
  categories: CategoryScores;
  providers: ProviderEvidence[];
  autoRejected?: boolean;
  autoRejectReasons?: string[];
  onChainFallback: { contractExists: boolean; isSourceVerified: boolean; deploymentInfo: string; hasFallbackMetadata: boolean };
  securityChecks: {
    isHoneypot: boolean;
    isMintable: boolean;
    isProxy: boolean;
    isBlacklisted: boolean;
    isOwnershipRenounced: boolean;
    isSourceCodeVerified: boolean;
    buyTaxPct: number;
    sellTaxPct: number;
    liquidityLockedPct: number;
    top10HoldersPct: number;
    holdersCount: number;
    pairAgeDays: number;
  };
  summaryText: string;
  timestamp: string;
}

function makeCategory(id: string, name: string, score: number, weightPct: number, details: string): TrustScoreCategory {
  return { id, name, score: Math.max(0, Math.min(100, score)), maxScore: 100, weightPct, details };
}

function legacyProviderId(id: string): ProviderEvidence['providerId'] {
  if (id === 'on_chain') return 'explorer';
  if (id === 'goplus') return 'goplus';
  if (id === 'honeypot') return 'honeypotis';
  if (id === 'coingecko') return 'coingecko';
  if (id === 'dexscreener') return 'dexscreener';
  if (id === 'geckoterminal') return 'geckoterminal';
  return 'explorer';
}

/**
 * Compatibility API for the existing UI.
 * The previous implementation contained hardcoded provider results and
 * EVM-only "safe" fallbacks. All real verification now runs through the
 * multichain verifier in backend/verification/tokenVerifier.ts.
 */
export async function verifyToken(
  address: string,
  chainId: string | number,
  _logoUrl?: string,
  blockchainType?: string
): Promise<VerificationReport> {
  const result = await runMultichainVerification({
    contractAddress: address,
    chainId,
    blockchain: blockchainType === 'solana' ? 'solana' : undefined,
  });
  const now = new Date().toISOString();

  if (!result.success || !result.data) {
    const message = result.error?.message || 'Token verification failed.';
    return {
      contractAddress: address,
      chainId: String(chainId),
      rawScore: 0,
      maxRawScore: 100,
      trustScore: 0,
      securityScore: 0,
      marketMaturityScore: 0,
      verdict: 'REJECTED',
      verdictLabel: 'Verification failed',
      status: 'REJECTED',
      riskRating: 'CRITICAL',
      recommendation: message,
      actionableRecommendation: 'Do not rely on this token until verification succeeds.',
      warnings: [message],
      passedSecurity: [],
      passedMarket: [],
      maturityWarnings: [],
      securityWarnings: [message],
      whyNotApproved: [message],
      isNewToken: false,
      categories: {
        security: makeCategory('security', 'Security', 0, 40, message),
        liquidity: makeCategory('liquidity', 'Liquidity', 0, 15, 'Unavailable.'),
        marketData: makeCategory('market', 'Market Data', 0, 10, 'Unavailable.'),
        tradingActivity: makeCategory('trading', 'Trading Activity', 0, 10, 'Unavailable.'),
        holders: makeCategory('holders', 'Holders', 0, 10, 'Unavailable.'),
        blockchainMetadata: makeCategory('metadata', 'Blockchain Metadata', 0, 10, 'Unavailable.'),
        contractVerification: makeCategory('contract', 'Contract Verification', 0, 5, 'Unavailable.'),
        logoQuality: makeCategory('logo', 'Logo Quality', 0, 5, 'Unavailable.'),
        community: makeCategory('community', 'Community', 0, 5, 'Unavailable.'),
      },
      providers: [],
      autoRejected: true,
      autoRejectReasons: [message],
      onChainFallback: { contractExists: false, isSourceVerified: false, deploymentInfo: 'Verification failed', hasFallbackMetadata: false },
      securityChecks: { isHoneypot: false, isMintable: false, isProxy: false, isBlacklisted: false, isOwnershipRenounced: false, isSourceCodeVerified: false, buyTaxPct: 0, sellTaxPct: 0, liquidityLockedPct: 0, top10HoldersPct: 0, holdersCount: 0, pairAgeDays: 0 },
      summaryText: message,
      timestamp: now,
    };
  }

  const { token, verification } = result.data;
  const warnings = verification.securityIssues;
  const reportStatus: VerificationReport['status'] = verification.verdict === 'REJECTED'
    ? 'REJECTED'
    : verification.riskLevel === 'CRITICAL' || verification.riskLevel === 'HIGH'
      ? 'HIGH_RISK'
      : verification.isPartial ? 'NEEDS_REVIEW' : 'APPROVED';

  const providerEntries: ProviderEvidence[] = Object.entries(verification.providerStatus).map(([id, status]) => ({
    providerId: legacyProviderId(id),
    name: id === 'on_chain' ? 'Blockchain RPC' : id,
    endpoint: id,
    status: status === 'verified' ? 'verified' : status === 'failed' ? 'failed' : 'unlisted',
    score: status === 'verified' ? 100 : 0,
    maxScore: 100,
    weightPct: 0,
    dataPoints: [],
    lastChecked: verification.verifiedAt,
  }));

  const exists = verification.providerStatus.on_chain === 'verified';
  const categoryScores = verification.categoryScores;

  return {
    contractAddress: token.contractAddress,
    chainId: String(token.chainId),
    rawScore: verification.trustScore,
    maxRawScore: 100,
    trustScore: verification.trustScore,
    securityScore: verification.securityScore,
    marketMaturityScore: verification.marketMaturityScore,
    verdict: verification.verdict as AuditVerdict,
    verdictLabel: verification.verdict.replace(/_/g, ' '),
    status: reportStatus,
    riskRating: verification.riskLevel,
    recommendation: warnings.length ? 'Review the reported security findings before interacting with this token.' : 'No critical issues were reported by the available providers.',
    actionableRecommendation: warnings.join(' ') || 'No critical issues were reported.',
    warnings,
    passedSecurity: verification.passedChecks,
    passedMarket: verification.passedChecks,
    maturityWarnings: verification.isPartial ? ['Some provider data was unavailable, unsupported, or unlisted.'] : [],
    securityWarnings: warnings,
    whyNotApproved: reportStatus === 'APPROVED' ? [] : warnings,
    isNewToken: false,
    categories: {
      security: makeCategory('security', 'Security', categoryScores.security || 0, 40, 'Normalized security result.'),
      liquidity: makeCategory('liquidity', 'Liquidity', categoryScores.liquidity || 0, 15, 'Normalized liquidity result.'),
      marketData: makeCategory('market', 'Market Data', categoryScores.market || 0, 10, 'Normalized market result.'),
      tradingActivity: makeCategory('trading', 'Trading Activity', categoryScores.trading || 0, 10, 'Normalized trading result.'),
      holders: makeCategory('holders', 'Holders', verification.holders.totalHoldersEstimate ? 50 : 0, 10, 'Holder data depends on provider coverage.'),
      blockchainMetadata: makeCategory('metadata', 'Blockchain Metadata', exists ? 100 : 0, 10, 'On-chain token metadata.'),
      contractVerification: makeCategory('contract', 'Contract Verification', exists ? 100 : 0, 5, 'Blockchain RPC inspection.'),
      logoQuality: makeCategory('logo', 'Logo Quality', token.logoUrl ? 100 : 0, 5, token.logoUrl ? 'Logo source found.' : 'No provider logo was found.'),
      community: makeCategory('community', 'Community', token.websiteUrl || token.twitterUrl || token.telegramUrl ? 100 : 0, 5, 'Social metadata coverage.'),
    },
    providers: providerEntries,
    autoRejected: reportStatus === 'REJECTED',
    autoRejectReasons: reportStatus === 'REJECTED' ? warnings : [],
    onChainFallback: {
      contractExists: exists,
      isSourceVerified: verification.providerStatus.goplus === 'verified',
      deploymentInfo: `${token.blockchain} / ${token.chainId}`,
      hasFallbackMetadata: Boolean(token.name || token.symbol || token.decimals !== null),
    },
    securityChecks: {
      isHoneypot: verification.honeypot.isHoneypot === true,
      isMintable: verification.ownership.canMint === true,
      isProxy: verification.ownership.isProxy === true,
      isBlacklisted: warnings.some(w => w.toLowerCase().includes('blacklist')),
      isOwnershipRenounced: verification.ownership.isRenounced === true,
      isSourceCodeVerified: verification.providerStatus.goplus === 'verified',
      buyTaxPct: verification.honeypot.buyTax ?? 0,
      sellTaxPct: verification.honeypot.sellTax ?? 0,
      liquidityLockedPct: verification.liquidity.lockedPercentage ?? 0,
      top10HoldersPct: verification.holders.top10HoldersPercent ?? 0,
      holdersCount: verification.holders.totalHoldersEstimate ?? 0,
      pairAgeDays: 0,
    },
    summaryText: warnings.length ? warnings.join(' ') : 'Verification completed without reported critical issues.',
    timestamp: verification.verifiedAt || now,
  };
}
