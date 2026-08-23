import { ChainId, ERC20Metadata, MarketData } from '../types';
import { fetchERC20MetadataFromBlockchain } from './ethers';
import { fetchDexScreenerData, fetchCoinGeckoSupplyData } from './api';
import { analyzeTokenSafety } from './security';
import { isEvmChain } from '../constants/chains';
import { resolveAssetIdentity, identityToDiscovery } from './assetResolver';

export interface TrustScoreCategory { id: string; name: string; score: number; maxScore: number; weightPct: number; details: string; }
export interface CategoryScores { security: TrustScoreCategory; liquidity: TrustScoreCategory; marketData: TrustScoreCategory; tradingActivity: TrustScoreCategory; holders: TrustScoreCategory; blockchainMetadata: TrustScoreCategory; contractVerification: TrustScoreCategory; logoQuality: TrustScoreCategory; community: TrustScoreCategory; }
export interface ProviderEvidence { providerId: 'coingecko' | 'dexscreener' | 'dextools' | 'geckoterminal' | 'goplus' | 'honeypotis' | 'tokensniffer' | 'explorer' | 'defillama' | 'rugcheck'; name: string; endpoint: string; status: 'verified' | 'warning' | 'unlisted' | 'failed'; score: number; maxScore: number; weightPct: number; dataPoints: string[]; lastChecked: string; }
export type AuditVerdict = 'APPROVED_EXCELLENT' | 'APPROVED_LOW_RISK' | 'ACCEPTED_MEDIUM_RISK' | 'HIGH_RISK_WARN' | 'REJECTED' | 'APPROVED' | 'NEEDS_OBSERVATION' | 'HIGH_RISK';
export interface VerificationReport {
  contractAddress: string; chainId: string; rawScore: number; maxRawScore: number; trustScore: number; securityScore: number; marketMaturityScore: number; verdict: AuditVerdict; verdictLabel: string; status: 'APPROVED' | 'NEEDS_REVIEW' | 'HIGH_RISK' | 'REJECTED'; riskRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; recommendation: string; actionableRecommendation: string; warnings: string[]; passedSecurity: string[]; passedMarket: string[]; maturityWarnings: string[]; securityWarnings: string[]; whyNotApproved: string[]; isNewToken: boolean; categories: CategoryScores; providers: ProviderEvidence[]; autoRejected?: boolean; autoRejectReasons?: string[]; onChainFallback: { contractExists: boolean; isSourceVerified: boolean; deploymentInfo: string; hasFallbackMetadata: boolean }; securityChecks: { isHoneypot: boolean; isMintable: boolean; isProxy: boolean; isBlacklisted: boolean; isOwnershipRenounced: boolean; isSourceCodeVerified: boolean; buyTaxPct: number; sellTaxPct: number; liquidityLockedPct: number; top10HoldersPct: number; holdersCount: number; pairAgeDays: number }; summaryText: string; timestamp: string;
}

function makeCategory(id: string, name: string, score: number, weightPct: number, details: string): TrustScoreCategory {
  return { id, name, score: Math.max(0, Math.min(100, Math.round(score))), maxScore: 100, weightPct, details };
}

/**
 * Normalize only the chains that have special identifier/standard semantics.
 * Unknown chains are deliberately preserved instead of being converted to
 * Polygon/another default EVM network.
 */
function normalizeChain(blockchainType?: string, chainId?: string | number, blockchainName?: string, tokenStandard?: string) {
  const rawBlockchain = String(blockchainType || '').trim();
  const b = rawBlockchain.toLowerCase().replace(/[\s_-]+/g, '');
  const c = String(chainId ?? '').trim().toLowerCase();

  if (['metadata', 'solana', 'sol', 'mainnetbeta', 'solanamainnet'].includes(b) || ['metadata', 'solana', 'sol', 'mainnet-beta', 'solanamainnet'].includes(c)) {
    return { blockchain: 'solana', chainId: 'solana' as ChainId, name: 'Solana', standard: 'SPL' };
  }
  if (['tron', 'trx'].includes(b) || ['tron', 'trx'].includes(c)) return { blockchain: 'tron', chainId: 'mainnet' as ChainId, name: 'TRON', standard: 'TRC-20' };
  if (['ton', 'tonnetwork'].includes(b) || ['ton', 'tonnetwork'].includes(c)) return { blockchain: 'ton', chainId: 'ton' as ChainId, name: 'TON Network', standard: 'Jetton' };
  if (['xrpl', 'xrp', 'ripple'].includes(b) || ['xrpl', 'xrp', 'ripple', 'mainnet'].includes(c)) return { blockchain: 'xrpl', chainId: 'mainnet' as ChainId, name: 'XRP Ledger', standard: 'issued_asset' };

  return {
    blockchain: rawBlockchain || 'unknown',
    chainId: String(chainId || 'unknown') as ChainId,
    name: String(blockchainName || rawBlockchain || 'Unknown Blockchain'),
    standard: String(tokenStandard || 'token'),
  };
}

function emptyMarket(): MarketData {
  return { priceUsd: 0, priceNative: 0, priceChange24h: 0, volume24h: 0, liquidityUsd: 0, marketCapUsd: 0, fdvUsd: 0, pairAddress: '', dexName: '', pairUrl: '' } as MarketData;
}

/**
 * Device-only token verification.
 *
 * Chain identity is resolved before provider-specific verification. A chain
 * that is not yet present in TokenCare's supported-chain registry is still a
 * valid discovery result and is allowed through the pipeline. Provider calls
 * that are not applicable simply return no data; they never invalidate the
 * asset identity.
 */
export async function verifyToken(address: string, chainId: string | number, _logoUrl?: string, blockchainType?: string): Promise<VerificationReport> {
  const startedAt = new Date().toISOString();

  const resolved = await resolveAssetIdentity(address, String(chainId || '137') as ChainId).catch(() => null);
  const identity = resolved?.identity;
  const resolvedDiscovery = resolved ? identityToDiscovery(resolved.identity, resolved.discovery) : null;

  const detected = normalizeChain(
    identity?.blockchainType || blockchainType,
    identity?.chainId || chainId,
    identity?.blockchainName,
    identity?.tokenStandard,
  );
  const effectiveChain = detected.chainId;
  const effectiveBlockchain = detected.blockchain;

  const providerStatus: Record<string, 'verified' | 'unlisted' | 'failed' | 'unsupported'> = {};
  let metadata: ERC20Metadata | null = null;
  let discovered: any = resolvedDiscovery;
  let market: MarketData = emptyMarket();
  let gecko: any = null;

  // Provider calls are independent. A provider that does not understand the
  // detected chain is allowed to fail without cancelling discovery.
  const dexPromise = fetchDexScreenerData(address, effectiveChain as ChainId).catch(() => null);
  const geckoPromise = fetchCoinGeckoSupplyData(address, effectiveChain as ChainId).catch(() => null);
  const metadataPromise = isEvmChain(effectiveChain, effectiveBlockchain)
    ? fetchERC20MetadataFromBlockchain(address, effectiveChain as ChainId).catch(() => null)
    : Promise.resolve(null);

  [market, gecko, metadata] = await Promise.all([dexPromise, geckoPromise, metadataPromise]);

  if (discovered) providerStatus.dexscreener = discovered.source === 'dexscreener' ? 'verified' : 'unlisted';
  else providerStatus.dexscreener = market ? 'verified' : 'unlisted';
  providerStatus.geckoterminal = 'unlisted';
  providerStatus.coingecko = gecko ? 'verified' : 'unlisted';
  providerStatus.on_chain = metadata ? 'verified' : isEvmChain(effectiveChain, effectiveBlockchain) ? 'failed' : 'unsupported';
  providerStatus.goplus = 'unlisted';
  providerStatus.honeypot = 'unlisted';

  const tokenName = metadata?.name || discovered?.name || gecko?.name || 'Detected Token';
  const tokenSymbol = metadata?.symbol || discovered?.symbol || gecko?.symbol || 'TOKEN';
  const decimals = metadata?.decimals ?? discovered?.decimals ?? 0;
  const mergedMarket = { ...emptyMarket(), ...(market || {}) } as MarketData;
  if (!mergedMarket.priceUsd && gecko?.priceUsd) mergedMarket.priceUsd = gecko.priceUsd;
  if (!mergedMarket.marketCapUsd && gecko?.marketCapUsd) mergedMarket.marketCapUsd = gecko.marketCapUsd;

  const security = await analyzeTokenSafety(
    metadata || ({
      address,
      name: tokenName,
      symbol: tokenSymbol,
      decimals,
      totalSupply: metadata?.totalSupply || gecko?.totalSupplyCG || 0,
      ownerAddress: metadata?.ownerAddress,
      isRenounced: metadata?.isRenounced,
      blockchainType: effectiveBlockchain,
    } as any),
    mergedMarket,
    effectiveChain as ChainId,
  ).catch(() => null);

  const hasIdentity = Boolean(identity?.blockchainType || identity?.chainId || discovered);
  const hasMetadata = Boolean(metadata || discovered || gecko);
  const score = security?.score ?? (hasMetadata || hasIdentity ? 50 : 0);
  const warnings = security?.warnings || [];
  const risk: VerificationReport['riskRating'] = score >= 80 ? 'LOW' : score >= 60 ? 'MEDIUM' : score >= 40 ? 'HIGH' : 'CRITICAL';
  const verdict: AuditVerdict = security?.isHoneypot || score < 40 ? 'REJECTED' : score < 70 ? 'ACCEPTED_MEDIUM_RISK' : score < 85 ? 'APPROVED_LOW_RISK' : 'APPROVED_EXCELLENT';
  const status: VerificationReport['status'] = verdict === 'REJECTED' ? 'REJECTED' : risk === 'HIGH' || risk === 'CRITICAL' ? 'HIGH_RISK' : warnings.length ? 'NEEDS_REVIEW' : 'APPROVED';
  const now = new Date().toISOString();

  const providers: ProviderEvidence[] = Object.entries(providerStatus).map(([id, state]) => ({
    providerId: (id === 'on_chain' ? 'explorer' : id) as ProviderEvidence['providerId'],
    name: id === 'on_chain' ? 'Blockchain RPC' : id,
    endpoint: id,
    status: state === 'verified' ? 'verified' : state === 'failed' ? 'failed' : 'unlisted',
    score: state === 'verified' ? 100 : 0,
    maxScore: 100,
    weightPct: 0,
    dataPoints: [],
    lastChecked: now,
  }));

  const categories: CategoryScores = {
    security: makeCategory('security', 'Security', security?.score ?? 0, 40, 'Local security analysis; unsupported chain-specific checks are not treated as failures.'),
    liquidity: makeCategory('liquidity', 'Liquidity', mergedMarket.liquidityUsd > 50000 ? 100 : mergedMarket.liquidityUsd > 5000 ? 70 : mergedMarket.liquidityUsd > 0 ? 30 : 0, 15, 'DEX liquidity when available.'),
    marketData: makeCategory('market', 'Market Data', gecko || market ? 100 : 0, 10, 'Provider market data when available.'),
    tradingActivity: makeCategory('trading', 'Trading Activity', mergedMarket.volume24h > 0 ? 100 : 0, 10, '24h volume when available.'),
    holders: makeCategory('holders', 'Holders', security?.holdersCount ? 50 : 0, 10, 'Holder data when a compatible provider supplies it.'),
    blockchainMetadata: makeCategory('metadata', 'Blockchain Metadata', hasIdentity ? 100 : 0, 10, `${detected.name} identity was resolved before provider-specific verification.`),
    contractVerification: makeCategory('contract', 'Contract Verification', metadata ? 100 : discovered ? 60 : hasIdentity ? 20 : 0, 5, metadata ? 'Direct on-chain metadata read.' : discovered ? 'Indexer/provider metadata.' : hasIdentity ? 'Chain identity resolved; native contract verification is not available for this asset type.' : 'No verification evidence.'),
    logoQuality: makeCategory('logo', 'Logo Quality', discovered?.logoUrl || gecko?.logoUrl ? 100 : 0, 5, 'Provider logo availability.'),
    community: makeCategory('community', 'Community', 0, 5, 'No local community verification performed.'),
  };

  return {
    // This remains the original user-supplied identifier for every chain type.
    contractAddress: address,
    chainId: String(effectiveChain),
    rawScore: score,
    maxRawScore: 100,
    trustScore: score,
    securityScore: security?.score ?? 0,
    marketMaturityScore: categories.marketData.score,
    verdict,
    verdictLabel: verdict.replace(/_/g, ' '),
    status,
    riskRating: risk,
    recommendation: security?.recommendation || (hasIdentity
      ? `Asset identity resolved on ${detected.name}. Continue with available metadata and market evidence; chain-specific security checks may be unavailable.`
      : 'Verification completed with the available device-side data.'),
    actionableRecommendation: warnings.join(' ') || (hasIdentity && !metadata
      ? `TokenCare recognized the blockchain as ${detected.name}, but does not have a native contract verifier for this asset type yet. The original identifier is still valid for display and saving.`
      : 'No critical issue was identified from the available device-side evidence.'),
    warnings,
    passedSecurity: security?.flags.filter((f: any) => f.type === 'pass').map((f: any) => f.title) || [],
    passedMarket: mergedMarket.liquidityUsd > 0 ? ['Market data received from an available provider.'] : [],
    maturityWarnings: [],
    securityWarnings: warnings,
    whyNotApproved: status === 'APPROVED' ? [] : warnings,
    isNewToken: false,
    categories,
    providers,
    autoRejected: verdict === 'REJECTED',
    autoRejectReasons: verdict === 'REJECTED' ? warnings : [],
    onChainFallback: {
      contractExists: hasMetadata || hasIdentity,
      isSourceVerified: Boolean(metadata),
      deploymentInfo: `${detected.name} / ${effectiveChain}`,
      hasFallbackMetadata: hasMetadata,
    },
    securityChecks: {
      isHoneypot: security?.isHoneypot ?? false,
      isMintable: security?.isMintable ?? false,
      isProxy: security?.isProxy ?? false,
      isBlacklisted: warnings.some(w => w.toLowerCase().includes('blacklist')),
      isOwnershipRenounced: security?.isOwnershipRenounced ?? false,
      isSourceCodeVerified: security?.isOpenSource ?? false,
      buyTaxPct: security?.buyTaxPct ?? 0,
      sellTaxPct: security?.sellTaxPct ?? 0,
      liquidityLockedPct: security?.liquidityLockedPct ?? 0,
      top10HoldersPct: security?.top10HoldersPct ?? 0,
      holdersCount: security?.holdersCount ?? 0,
      pairAgeDays: security?.pairAgeDays ?? 0,
    },
    summaryText: `${tokenName} (${tokenSymbol}) detected on ${detected.name}. Original identifier preserved: ${address}`,
    timestamp: startedAt || now,
  };
}
