import { SubmittedToken } from '../types';
import { REWARD_RATE_USD } from '../constants/chains';
import { getAllTokensFromWorker } from './workerApi';
import { getNetworkInfo } from './chainLogos';
import { safeSetItem, sanitizeTokenForStorage } from './storage';

const EXPLORE_CACHE_KEY = 'tokencare_explore_directory_v3';
const EXPLORE_CACHE_VERSION = 3;

export interface ExploreDirectoryStatus {
  state: 'cached' | 'loading' | 'success' | 'unavailable';
  message?: string;
}

interface ExploreDirectoryCache {
  version: number;
  date: string;
  tokens: SubmittedToken[];
  status: 'success' | 'unavailable';
}

// Explore is intentionally Cloudflare-only. Supabase is NOT called from this directory.
export const BASELINE_EXPLORE_TOKENS: SubmittedToken[] = [];

function getTodayKey(): string {
  // Calendar-day cache. A new request becomes eligible when the user's local calendar date changes.
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function readCache(): ExploreDirectoryCache | null {
  try {
    const raw = localStorage.getItem(EXPLORE_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.version === EXPLORE_CACHE_VERSION &&
      typeof parsed.date === 'string' &&
      Array.isArray(parsed.tokens) &&
      (parsed.status === 'success' || parsed.status === 'unavailable')
    ) {
      return parsed as ExploreDirectoryCache;
    }
  } catch (err) {
    console.warn('[ExploreCache] Failed to parse directory cache:', err);
  }

  return null;
}

/**
 * Gets today's cached Explore directory. Expired data is deliberately not returned.
 */
export function getCachedExploreTokens(): SubmittedToken[] {
  const cache = readCache();
  return cache?.date === getTodayKey() ? cache.tokens : [];
}

export function getExploreDirectoryStatus(): ExploreDirectoryStatus {
  const cache = readCache();
  if (!cache || cache.date !== getTodayKey()) return { state: 'loading' };
  if (cache.status === 'unavailable') {
    return {
      state: 'unavailable',
      message: 'Token directory is not available right now.',
    };
  }
  return { state: 'cached' };
}

function saveDirectoryCache(tokens: SubmittedToken[], status: 'success' | 'unavailable'): void {
  try {
    const sanitized = (tokens || []).slice(0, 100).map(sanitizeTokenForStorage);
    const cache: ExploreDirectoryCache = {
      version: EXPLORE_CACHE_VERSION,
      date: getTodayKey(),
      tokens: sanitized,
      status,
    };
    safeSetItem(EXPLORE_CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('[ExploreCache] Failed to save directory cache:', err);
  }
}

/**
 * Transforms a raw token item returned by the Cloudflare Worker into SubmittedToken.
 */
export function normalizeWorkerToken(item: any): SubmittedToken {
  const chainKey = item.blockchain || item.chainId || item.chain || 'polygon';
  const netInfo = getNetworkInfo(chainKey);

  const address = item.contractAddress || item.address || item.tokenAddress || '';
  const symbol = (item.symbol || 'TOK').toUpperCase();
  const name = item.name || item.tokenName || symbol;
  const logoUrl = item.logoUrl || item.logo || netInfo.logoUrl;
  const trustScore = Number(item.trustScore || item.safetyScore || item.score || 95);

  return {
    id: item.id || `worker-${netInfo.id}-${address}-${symbol.toLowerCase()}`,
    address,
    chainId: netInfo.id,
    submittedBy: item.submittedBy || 'TokenCare Global Network',
    submittedAt: item.submittedAt || new Date().toISOString(),
    verified: item.verified !== false,
    rewardEarnedTokens: Number(item.rewardEarnedTokens || 50),
    rewardEarnedUsd: Number(item.rewardEarnedTokens || 50) * REWARD_RATE_USD,
    upvotes: Number(item.upvotes || 0),
    metadata: {
      address,
      chainId: netInfo.id,
      name,
      symbol,
      decimals: Number(item.decimals || 18),
      totalSupply: item.totalSupply || '1,000,000,000',
      logoUrl,
      blockchainName: netInfo.name,
    },
    marketData: {
      priceUsd: Number(item.priceUsd || item.price || 0),
      priceNative: Number(item.priceNative || 0),
      priceChange24h: Number(item.change24h || item.priceChange24h || 0),
      marketCapUsd: Number(item.marketCapUsd || item.marketCap || 0),
      volume24h: Number(item.volume24hUsd || item.volume24h || 0),
      liquidityUsd: Number(item.liquidityUsd || item.liquidity || 0),
      fdvUsd: Number(item.fdvUsd || item.marketCapUsd || 0),
    },
    safety: {
      score: trustScore,
      rating: trustScore >= 80 ? 'SAFE' : trustScore >= 50 ? 'CAUTION' : 'HIGH_RISK',
      recommendation: item.recommendation || `Verified smart contract on ${netInfo.name}.`,
      buyTaxPct: Number(item.buyTaxPct || 0),
      sellTaxPct: Number(item.sellTaxPct || 0),
      isHoneypot: Boolean(item.isHoneypot),
      isMintable: Boolean(item.isMintable),
      isProxy: Boolean(item.isProxy),
      isOpenSource: item.isOpenSource !== false,
      isOwnershipRenounced: item.isOwnershipRenounced !== false,
      isLiquidityLocked: item.isLiquidityLocked !== false,
      liquidityLockedPct: Number(item.liquidityLockedPct || 90),
      top10HoldersPct: Number(item.top10HoldersPct || 25),
      holdersCount: Number(item.holdersCount || 100),
      pairAgeDays: Number(item.pairAgeDays || 30),
      warnings: item.warnings || [],
      flags: item.flags || [],
    },
  };
}

/**
 * Initializes Explore using ONLY the Cloudflare Worker directory.
 *
 * Network policy:
 * - At most ONE Worker directory request per calendar day per browser/device.
 * - A valid same-day cache causes ZERO network requests, including on refresh.
 * - A failed Worker request is also cached as unavailable for the day, preventing request storms.
 * - Search is always local and never triggers another Worker/Supabase request.
 */
export async function initGlobalExploreDirectory(
  onUpdate?: (tokens: SubmittedToken[]) => void,
  onStatus?: (status: ExploreDirectoryStatus) => void
): Promise<SubmittedToken[]> {
  const today = getTodayKey();
  const cached = readCache();

  // Same-day cache: absolutely no network request.
  if (cached?.date === today) {
    const status: ExploreDirectoryStatus =
      cached.status === 'success'
        ? { state: 'cached' }
        : { state: 'unavailable', message: 'Token directory is not available right now.' };

    onStatus?.(status);
    onUpdate?.(cached.tokens);
    return cached.tokens;
  }

  onStatus?.({ state: 'loading', message: 'Loading token directory…' });

  try {
    const workerRes = await getAllTokensFromWorker(1, 100);

    if (!workerRes.success || !Array.isArray(workerRes.tokens)) {
      // Cache the failure so refreshes do NOT repeatedly consume the Worker quota.
      saveDirectoryCache([], 'unavailable');
      onUpdate?.([]);
      onStatus?.({
        state: 'unavailable',
        message: 'Token directory is not available right now.',
      });
      return [];
    }

    const workerTokens = workerRes.tokens
      .map(normalizeWorkerToken)
      .filter((token) => Boolean(token.address));

    saveDirectoryCache(workerTokens, 'success');
    onUpdate?.(workerTokens);
    onStatus?.({ state: 'success' });
    return workerTokens;
  } catch (err) {
    console.warn('[ExploreDirectory] Cloudflare Worker request failed:', err);
    saveDirectoryCache([], 'unavailable');
    onUpdate?.([]);
    onStatus?.({
      state: 'unavailable',
      message: 'Token directory is not available right now.',
    });
    return [];
  }
}
