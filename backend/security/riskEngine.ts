import {
  NormalizedTokenDetails,
  OnChainTokenInspection,
  TokenVerificationReport,
} from '../types/tokenDetails';
import {
  analyzeHoneypotAndTaxes,
  analyzeOwnership,
  analyzeLiquidity,
  analyzeHolders,
} from './contractChecks';

export function evaluateTokenRisk(
  token: NormalizedTokenDetails,
  onChain?: OnChainTokenInspection | null
): TokenVerificationReport {
  const issues: string[] = [];
  const passed: string[] = [];

  let securityScore = 100;
  let liquidityScore = 100;
  let marketScore = 100;
  let metadataScore = 100;

  // 1. Contract & Bytecode Verification
  if (onChain) {
    if (onChain.hasBytecode === false) {
      securityScore -= 50;
      issues.push('Contract has empty bytecode or is an un-deployed address');
    } else {
      passed.push('On-chain bytecode confirmed and valid');
    }

    if (onChain.isProxy) {
      securityScore -= 15;
      issues.push('Upgradeable proxy contract detected (implementation can be mutated)');
    } else {
      passed.push('Immutable contract architecture (non-proxy)');
    }

    if (onChain.isRenounced) {
      passed.push('Contract ownership renounced / zero address');
    } else if (onChain.canMint) {
      securityScore -= 15;
      issues.push('Owner retains minting authority');
    }
  }

  // 2. Liquidity Evaluation
  const liquidityUsd = token.liquidityUsd || 0;
  if (liquidityUsd === 0) {
    liquidityScore -= 60;
    issues.push('Zero DEX liquidity detected on public automated market makers');
  } else if (liquidityUsd < 5000) {
    liquidityScore -= 30;
    issues.push('Low liquidity pool (< $5,000 USD)');
  } else if (liquidityUsd >= 50000) {
    passed.push('Deep liquidity pool (> $50,000 USD)');
  } else {
    passed.push('Adequate liquidity pool for standard donation transfers');
  }

  // 3. Market Activity & Volume
  const volume24h = token.volume24hUsd || 0;
  if (volume24h > 10000) {
    passed.push('Active 24h trading volume (> $10,000 USD)');
  } else if (volume24h === 0) {
    marketScore -= 20;
    issues.push('No recorded 24h trading volume');
  }

  // 4. Metadata & Identity
  if (token.logoUrl) {
    passed.push('Verified visual asset identity / icon URL provided');
  } else {
    metadataScore -= 20;
    issues.push('Missing official token logo/icon');
  }

  if (token.websiteUrl || token.twitterUrl || token.telegramUrl) {
    passed.push('Verified public community/social presence');
  } else {
    metadataScore -= 20;
    issues.push('No verified website or social links found in indexers');
  }

  // Composite Trust Score (Weighted)
  const categoryScores = {
    security: Math.max(0, Math.min(100, securityScore)),
    liquidity: Math.max(0, Math.min(100, liquidityScore)),
    marketData: Math.max(0, Math.min(100, marketScore)),
    tradingActivity: volume24h > 1000 ? 95 : volume24h > 0 ? 70 : 40,
    holders: token.marketCapUsd && token.marketCapUsd > 1000000 ? 90 : 65,
    contractVerification: onChain?.isValidContract ? 95 : 40,
    metadata: Math.max(0, Math.min(100, metadataScore)),
  };

  const trustScore = Math.round(
    categoryScores.security * 0.35 +
      categoryScores.liquidity * 0.25 +
      categoryScores.marketData * 0.15 +
      categoryScores.contractVerification * 0.15 +
      categoryScores.metadata * 0.1
  );

  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  let verdict: 'APPROVED_LOW_RISK' | 'NEEDS_OBSERVATION' | 'HIGH_RISK_WARNING' | 'REJECTED_CRITICAL_RISK' =
    'APPROVED_LOW_RISK';

  if (trustScore < 40 || onChain?.hasBytecode === false) {
    riskLevel = 'CRITICAL';
    verdict = 'REJECTED_CRITICAL_RISK';
  } else if (trustScore < 60) {
    riskLevel = 'HIGH';
    verdict = 'HIGH_RISK_WARNING';
  } else if (trustScore < 75) {
    riskLevel = 'MEDIUM';
    verdict = 'NEEDS_OBSERVATION';
  } else {
    riskLevel = 'LOW';
    verdict = 'APPROVED_LOW_RISK';
  }

  const isVerified = trustScore >= 65 && onChain?.isValidContract !== false;

  const honeypot = analyzeHoneypotAndTaxes(onChain, liquidityUsd);
  const ownership = analyzeOwnership(onChain);
  const liquidity = analyzeLiquidity(liquidityUsd, token.pairAddress, token.dexName);
  const holders = analyzeHolders(token.marketCapUsd, volume24h);

  return {
    isVerified,
    trustScore: Math.max(0, Math.min(100, trustScore)),
    securityScore: categoryScores.security,
    marketMaturityScore: categoryScores.marketData,
    riskLevel,
    verdict,
    auditBadge: isVerified
      ? 'VERIFIED_DONATION_ASSET'
      : riskLevel === 'CRITICAL'
      ? 'CRITICAL_RISK_ASSET'
      : 'OBSERVATION_REQUIRED',
    honeypot,
    ownership,
    liquidity,
    holders,
    securityIssues: issues,
    passedChecks: passed,
    categoryScores,
    verifiedAt: new Date().toISOString(),
  };
}
