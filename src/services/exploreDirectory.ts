import { SubmittedToken } from '../types';
import { REWARD_RATE_USD } from '../constants/chains';
import { getNetworkInfo } from './chainLogos';
import { safeSetItem, sanitizeTokenForStorage } from './storage';

const EXPLORE_CACHE_KEY = 'tokencare_explore_directory_v4';
const EXPLORE_CACHE_VERSION = 4;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

const WORKER_ENDPOINT = 'https://rough-meadow-6435.happyiyate.workers.dev/';

export interface ExploreDirectoryStatus {
  state: 'cached' | 'loading' | 'success' | 'unavailable';
  message?: string;
}

interface ExploreDirectoryCache {
  version: number;
  timestamp: number; // exact epoch timestamp
  date: string; // YYYY-MM-DD
  tokens: SubmittedToken[];
  status: 'success' | 'unavailable';
}

// Baseline tokens array is kept empty so no fake or database fallback tokens are injected
export const BASELINE_EXPLORE_TOKENS: SubmittedToken[] = [];

function getTodayKey(): string {
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
      typeof parsed.timestamp === 'number' &&
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

function isCacheFresh(cache: ExploreDirectoryCache | null): boolean {
  if (!cache) return false;
  const now = Date.now();
  // Valid if within 15 minutes and same calendar date
  const isWithinTTL = now - cache.timestamp < CACHE_TTL_MS;
  const isSameDay = cache.date === getTodayKey();
  return isWithinTTL && isSameDay;
}

/**
 * Gets cached Explore tokens synchronously from localStorage
 */
export function getCachedExploreTokens(): SubmittedToken[] {
  const cache = readCache();
  // Return cached tokens if valid
  return cache ? cache.tokens : [];
}

export function getExploreDirectoryStatus(): ExploreDirectoryStatus {
  const cache = readCache();
  if (!cache) return { state: 'loading' };
  if (isCacheFresh(cache)) {
    if (cache.status === 'unavailable') {
      return {
        state: 'unavailable',
        message: 'Token directory is not available right now.',
      };
    }
    return { state: 'cached' };
  }
  return { state: 'loading' };
}

function saveDirectoryCache(tokens: SubmittedToken[], status: 'success' | 'unavailable'): void {
  try {
    const sanitized = (tokens || []).slice(0, 150).map(sanitizeTokenForStorage);
    const cache: ExploreDirectoryCache = {
      version: EXPLORE_CACHE_VERSION,
      timestamp: Date.now(),
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
export function normalizeWorkerToken(item: any, index?: number): SubmittedToken {
  const chainKey = item.blockchain || item.chainId || item.chain || 'polygon';
  const netInfo = getNetworkInfo(chainKey);

  const address = String(item.contractAddress || item.address || item.tokenAddress || item.id || '').trim();
  const symbol = (item.symbol || 'TOK').toUpperCase();
  const name = item.name || item.tokenName || symbol;
  const logoUrl = item.logoUrl || item.logo || item.image || item.icon || netInfo.logoUrl;
  const trustScore = Number(item.trustScore || item.safetyScore || item.score || 95);

  const idSuffix = typeof index === 'number' ? `-${index}` : '';
  const id = item.id ? `${item.id}${idSuffix}` : `worker-${netInfo.id}-${address.toLowerCase()}-${symbol.toLowerCase()}${idSuffix}`;

  return {
    id,
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
 * Direct call to Cloudflare Worker to fetch all tokens.
 * Features:
 * - Direct call to https://rough-meadow-6435.happyiyate.workers.dev/
 * - 1 automatic retry on failure
 * - If still failing after 1 retry, gracefully stops retrying
 */
async function fetchTokensFromCloudflareWorker(): Promise<any[]> {
  const payload = { action: 'getAllTokens', page: 1, limit: 150 };

  const attemptFetch = async (): Promise<any[]> => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;

    try {
      const response = await fetch(WORKER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Worker HTTP ${response.status}`);
      }

      const json = await response.json();
      const rawList = json?.tokens || json?.data || (Array.isArray(json) ? json : []);
      if (Array.isArray(rawList)) {
        return rawList;
      }
      return [];
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      throw err;
    }
  };

  // Attempt 1
  try {
    return await attemptFetch();
  } catch (firstErr) {
    console.warn('[ExploreDirectory] Worker fetch attempt 1 failed, retrying once...', firstErr);
    // Exactly 1 retry after 800ms
    await new Promise((res) => setTimeout(res, 800));
    try {
      return await attemptFetch();
    } catch (retryErr) {
      console.warn('[ExploreDirectory] Worker fetch retry failed. Halting further retries.', retryErr);
      throw retryErr;
    }
  }
}

/**
 * Initializes Explore using ONLY the Cloudflare Worker directory.
 *
 * Rules:
 * - Only fetches from Cloudflare Worker (https://rough-meadow-6435.happyiyate.workers.dev/).
 * - No database calls.
 * - If cached and within TTL (15 mins / same day), ZERO network requests.
 * - Saves logos, tokens, metadata into localStorage.
 * - 1 retry on network error, then stops.
 */
export async function initGlobalExploreDirectory(
  onUpdate?: (tokens: SubmittedToken[]) => void,
  onStatus?: (status: ExploreDirectoryStatus) => void
): Promise<SubmittedToken[]> {
  const cached = readCache();

  // Fresh cache in localStorage: return immediately without making any network request
  if (isCacheFresh(cached) && cached) {
    const status: ExploreDirectoryStatus =
      cached.status === 'success'
        ? { state: 'cached' }
        : { state: 'unavailable', message: 'Token directory is not available right now.' };

    onStatus?.(status);
    onUpdate?.(cached.tokens);
    return cached.tokens;
  }

  // If we have stale cache, show it immediately while background fetch executes
  if (cached && cached.tokens.length > 0) {
    onUpdate?.(cached.tokens);
  }

  onStatus?.({ state: 'loading', message: 'Fetching tokens from Cloudflare...' });

  try {
    const rawTokens = await fetchTokensFromCloudflareWorker();

    // Deduplicate incoming worker tokens by unique chain + contract address key
    const seen = new Set<string>();
    const deduplicatedRaw: any[] = [];
    for (const item of rawTokens) {
      if (!item) continue;
      const chain = String(item.blockchain || item.chainId || item.chain || 'polygon').trim().toLowerCase();
      const addr = String(item.contractAddress || item.address || item.tokenAddress || item.id || '').trim().toLowerCase();
      const compositeKey = `${chain}:${addr}`;
      if (!seen.has(compositeKey)) {
        seen.add(compositeKey);
        deduplicatedRaw.push(item);
      }
    }

    const workerTokens = deduplicatedRaw
      .map((t, idx) => normalizeWorkerToken(t, idx))
      .filter((t) => Boolean(t.address));

    saveDirectoryCache(workerTokens, 'success');
    onUpdate?.(workerTokens);
    onStatus?.({ state: 'success' });
    return workerTokens;
  } catch (err) {
    // If request failed after 1 retry, mark unavailable for the current window and stop retrying
    if (!cached || cached.tokens.length === 0) {
      saveDirectoryCache([], 'unavailable');
      onUpdate?.([]);
    }
    onStatus?.({
      state: 'unavailable',
      message: 'Token directory is not available right now.',
    });
    return cached?.tokens || [];
  }
}
