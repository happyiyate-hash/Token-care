import type { CompleteTokenDetails, VerificationReport } from '../types/tokenDetails';

export function buildVerificationReport(input: {
  metadata?: CompleteTokenDetails['metadata'];
  marketData?: CompleteTokenDetails['marketData'];
  safety?: CompleteTokenDetails['safety'];
  providerEvidence?: Record<string, unknown>;
}): VerificationReport {
  const warnings: string[] = [];
  const passedSecurityChecks: string[] = [];
  const passedMarketChecks: string[] = [];

  if (input.safety?.honeypot === false) passedSecurityChecks.push('honeypot');
  if (input.safety?.mintable === false) passedSecurityChecks.push('mintability');
  if (input.safety?.proxy === false) passedSecurityChecks.push('proxy');
  if (input.safety?.openSource === true) passedSecurityChecks.push('open-source');
  if (input.marketData?.liquidityUsd !== undefined) passedMarketChecks.push('liquidity');
  if (input.marketData?.volume24h !== undefined) passedMarketChecks.push('24h-volume');

  if (!input.metadata?.name || !input.metadata?.symbol) {
    warnings.push('Incomplete token metadata');
  }

  return {
    status: warnings.length ? 'warning' : 'ok',
    verdict: warnings.length ? 'REVIEW' : 'PASS',
    riskRating: input.safety?.rating,
    warnings,
    passedSecurityChecks,
    passedMarketChecks,
    providerEvidence: input.providerEvidence,
    timestamp: new Date().toISOString(),
  };
}
