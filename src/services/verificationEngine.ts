import { ChainId, ERC20Metadata, MarketData } from '../types';
import { fetchERC20MetadataFromBlockchain } from './ethers';
import { discoverToken, fetchDexScreenerData, fetchCoinGeckoSupplyData, lookupBlockchainForToken } from './api';
import { analyzeTokenSafety } from './security';
import { isEvmChain } from '../constants/chains';

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

function normalizeChain(blockchainType?: string, chainId?: string | number) {
  const b = String(blockchainType || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const c = String(chainId ?? '').trim().toLowerCase();
  if (['metadata', 'solana', 'sol', 'mainnetbeta', 'solanamainnet'].includes(b) || ['metadata', 'solana', 'sol', 'mainnet-beta'].includes(c)) {
    return { blockchain: 'solana', chainId: 'mainnet-beta' as ChainId, name: 'Solana', standard: 'SPL' };
  }
  if (['tron', 'trx'].includes(b) || ['tron', 'trx'].includes(c)) return { blockchain: 'tron', chainId: 'mainnet' as ChainId, name: 'TRON', standard: 'TRC-20' };
  if (['ton', 'tonnetwork'].includes(b) || ['ton', 'tonnetwork'].includes(c)) return { blockchain: 'ton', chainId: 'ton' as ChainId, name: 'TON Network', standard: 'Jetton' };
  if (['xrpl', 'xrp', 'ripple'].includes(b) || ['xrpl', 'xrp', 'ripple', 'mainnet'].includes(c)) return { blockchain: 'xrpl', chainId: 'mainnet' as ChainId, name: 'XRP Ledger', standard: 'issued_asset' };
  return { blockchain: blockchainType || 'evm', chainId: String(chainId || '137') as ChainId, name: blockchainType || 'Unknown', standard: 'ERC-20' };
}

function emptyMarket(): MarketData {
  return { priceUsd: 0, priceNative: 0, priceChange24h: 0, volume24h: 0, liquidityUsd: 0, marketCapUsd: 0, fdvUsd: 0, pairAddress: '', dexName: '', pairUrl: '' } as MarketData;
}

/**
 * Device-only token verification.
 * No backend endpoint is called. Provider requests are made directly from the user's device.
 */
export async function verifyToken(address: string, chainId: string | number, _logoUrl?: string, blockchainType?: string): Promise<VerificationReport> {
  const startedAt = new Date().toISOString();
  const lookup = await lookupBlockchainForToken(address, String(chainId || '137') as ChainId).catch(() => null);
  const detected = normalizeChain(lookup?.blockchainType || blockchainType, lookup?.chainId || chainId);
  const effectiveChain = lookup?.chainId || detected.chainId;
  const effectiveBlockchain = lookup?.blockchainType || detected.blockchain;

  const providerStatus: Record<string, 'verified' | 'unlisted' | 'failed' | 'unsupported'> = {};
  let metadata: ERC20Metadata | null = null;
  let discovered: any = null;
  let market: MarketData = emptyMarket();
  let gecko: any = null;

  // Run independent provider calls concurrently. One failure must never abort the whole verification.
  const discoveryPromise = discoverToken(address, effectiveChain as ChainId).catch(() => null);
  const dexPromise = fetchDexScreenerData(address, effectiveChain as ChainId).catch(() => null);
  const geckoPromise = fetchCoinGeckoSupplyData(address, effectiveChain as ChainId).catch(() => null);
  const metadataPromise = isEvmChain(effectiveChain, effectiveBlockchain)
    ? fetchERC20MetadataFromBlockchain(address, effectiveChain as ChainId).catch(() => null)
    : Promise.resolve(null);

  [discovered, market, gecko, metadata] = await Promise.all([discoveryPromise, dexPromise, geckoPromise, metadataPromise]);

  if (discovered) providerStatus.dexscreener = discovered.source === 'dexscreener' ? 'verified' : 'unlisted';
  else providerStatus.dexscreener = 'failed';
  providerStatus.geckoterminal = 'unlisted';
  providerStatus.coingecko = gecko ? 'verified' : 'unlisted';
  providerStatus.on_chain = metadata ? 'verified' : isEvmChain(effectiveChain, effectiveBlockchain) ? 'failed' : 'unsupported';
  providerStatus.goplus = 'unlisted';
  providerStatus.honeypot = 'unlisted';

  const tokenName = metadata?.name || discovered?.name || gecko?.name || 'Unknown Token';
  const tokenSymbol = metadata?.symbol || discovered?.symbol || gecko?.symbol || 'UNKNOWN';
  const decimals = metadata?.decimals ?? discovered?.decimals ?? 0;
  const mergedMarket = { ...emptyMarket(), ...(market || {}) } as MarketData;
  if (!mergedMarket.priceUsd && gecko?.priceUsd) mergedMarket.priceUsd = gecko.priceUsd;
  if (!mergedMarket.marketCapUsd && gecko?.marketCapUsd) mergedMarket.marketCapUsd = gecko.marketCapUsd;
  const security = await analyzeTokenSafety(
    metadata || ({ address, name: tokenName, symbol: tokenSymbol, decimals, totalSupply: metadata?.totalSupply || gecko?.totalSupplyCG || 0, ownerAddress: metadata?.ownerAddress, isRenounced: metadata?.isRenounced, blockchainType: effectiveBlockchain } as any),
    mergedMarket,
    effectiveChain as ChainId,
  ).catch(() => null);

  const score = security?.score ?? (metadata || discovered ? 50 : 0);
  const warnings = security?.warnings || [];
  const risk: VerificationReport['riskRating'] = score >= 80 ? 'LOW' : score >= 60 ? 'MEDIUM' : score >= 40 ? 'HIGH' : 'CRITICAL';
  const verdict: AuditVerdict = security?.isHoneypot || score < 40 ? 'REJECTED' : score < 70 ? 'ACCEPTED_MEDIUM_RISK' : score < 85 ? 'APPROVED_LOW_RISK' : 'APPROVED_EXCELLENT';
  const status: VerificationReport['status'] = verdict === 'REJECTED' ? 'REJECTED' : risk === 'HIGH' || risk === 'CRITICAL' ? 'HIGH_RISK' : warnings.length ? 'NEEDS_REVIEW' : 'APPROVED';
  const exists = Boolean(metadata || discovered);
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
    security: makeCategory('security', 'Security', security?.score ?? 0, 40, 'Local security analysis.'),
    liquidity: makeCategory('liquidity', 'Liquidity', mergedMarket.liquidityUsd > 50000 ? 100 : mergedMarket.liquidityUsd > 5000 ? 70 : 30, 15, 'DexScreener liquidity when available.'),
    marketData: makeCategory('market', 'Market Data', gecko || market ? 100 : 0, 10, 'Provider market data.'),
    tradingActivity: makeCategory('trading', 'Trading Activity', mergedMarket.volume24h > 0 ? 100 : 0, 10, '24h DEX volume when available.'),
    holders: makeCategory('holders', 'Holders', security?.holdersCount ? 50 : 0, 10, 'Holder data unavailable unless a provider supplies it.'),
    blockchainMetadata: makeCategory('metadata', 'Blockchain Metadata', exists ? 100 : 0, 10, `${detected.name} token metadata.`),
    contractVerification: makeCategory('contract', 'Contract Verification', metadata ? 100 : discovered ? 60 : 0, 5, metadata ? 'Direct on-chain metadata read.' : 'Indexer metadata only.'),
    logoQuality: makeCategory('logo', 'Logo Quality', discovered?.logoUrl || gecko?.logoUrl ? 100 : 0, 5, 'Provider logo availability.'),
    community: makeCategory('community', 'Community', 0, 5, 'No local community verification performed.'),
  };

  return {
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
    recommendation: security?.recommendation || 'Verification completed with the available device-side data.',
    actionableRecommendation: warnings.join(' ') || 'No critical issue was identified from the available device-side evidence.',
    warnings,
    passedSecurity: security?.flags.filter((f: any) => f.type === 'pass').map((f: any) => f.title) || [],
    passedMarket: mergedMarket.liquidityUsd > 0 ? ['Market data received from available provider.'] : [],
    maturityWarnings: [],
    securityWarnings: warnings,
    whyNotApproved: status === 'APPROVED' ? [] : warnings,
    isNewToken: false,
    categories,
    providers,
    autoRejected: verdict === 'REJECTED',
    autoRejectReasons: verdict === 'REJECTED' ? warnings : [],
    onChainFallback: { contractExists: exists, isSourceVerified: Boolean(metadata), deploymentInfo: `${detected.name} / ${effectiveChain}`, hasFallbackMetadata: Boolean(tokenName || tokenSymbol) },
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
    summaryText: `${tokenName} (${tokenSymbol}) detected on ${detected.name}. Verification ran locally on the device.`,
    timestamp: startedAt || now,
  };
}
