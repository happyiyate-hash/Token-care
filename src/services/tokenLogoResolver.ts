/**
 * Token Logo Fallback & Multi-Provider Resolver System
 *
 * Architecture:
 * 1. Independent Fallback System: Logo failure NEVER fails token verification.
 * 2. Multi-Provider Parallel Query with Deterministic Priority:
 *    - Priority 1: DexScreener (DEX pairs & token profile)
 *    - Priority 2: CoinGecko (by platform contract address or search)
 *    - Priority 3: GeckoTerminal (by network/contract address)
 *    - Priority 4: Specialized On-Chain / Ecosystem Registries (Pump.fun, RugCheck, Jupiter, TonAPI, Tronscan)
 *    - Priority 5: GitHub TrustWallet / CDN token lists
 * 3. Client-Side Rendering & Image Validation:
 *    - Validates URL syntax
 *    - Loads candidate in HTML Image
 *    - Validates image dimensions > 0 and rendering capability
 *    - If broken, immediately attempts next prioritized candidate
 * 4. Caching & Self-Healing:
 *    - Successfully resolved logo + provider stored with token metadata
 *    - If a cached image fails in the UI, re-resolves seamlessly
 */

export interface LogoCandidate {
  provider: 'dexscreener' | 'coingecko' | 'geckoterminal' | 'chain_registry' | 'github_cdn' | 'custom';
  url: string;
  priority: number; // Lower is higher priority
}

export interface ResolvedTokenLogo {
  logoUrl: string;
  logoSource: 'dexscreener' | 'coingecko' | 'geckoterminal' | 'chain_registry' | 'github_cdn' | 'custom' | 'fallback';
  isValid: boolean;
}

// In-memory quick cache for working and failed logo URLs
const workingLogoCache = new Map<string, { url: string; source: string }>();
const failedUrlSet = new Set<string>();

/**
 * Validates whether an image URL can actually load and render in the browser.
 */
export function validateImageRenderable(url: string, timeoutMs: number = 3500): Promise<boolean> {
  if (!url || typeof url !== 'string' || !url.trim()) return Promise.resolve(false);
  const cleanUrl = url.trim();

  // If already confirmed broken, skip immediately
  if (failedUrlSet.has(cleanUrl)) return Promise.resolve(false);

  // Data URLs are already loaded
  if (cleanUrl.startsWith('data:image/')) return Promise.resolve(true);

  // Basic format check
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('blob:')) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let settled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        img.src = '';
        resolve(false);
      }
    }, timeoutMs);

    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          resolve(true);
        } else {
          failedUrlSet.add(cleanUrl);
          resolve(false);
        }
      }
    };

    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        failedUrlSet.add(cleanUrl);
        resolve(false);
      }
    };

    img.src = cleanUrl;
  });
}

/**
 * Normalizes chain identifiers into CoinGecko / GeckoTerminal network platform names
 */
function getPlatformSlug(chainId: string | number, blockchainType?: string): { cg: string; gt: string; tw?: string } {
  const c = String(chainId || '').toLowerCase().trim();
  const b = String(blockchainType || '').toLowerCase().trim();

  if (c === 'solana' || c === 'mainnet-beta' || b === 'solana') {
    return { cg: 'solana', gt: 'solana', tw: 'solana' };
  }
  if (c === '1' || c === 'eth' || c === 'ethereum' || b === 'ethereum') {
    return { cg: 'ethereum', gt: 'eth', tw: 'ethereum' };
  }
  if (c === '137' || c === 'polygon' || c === 'matic' || b === 'polygon') {
    return { cg: 'polygon-pos', gt: 'polygon_pos', tw: 'polygon' };
  }
  if (c === '8453' || c === 'base' || b === 'base') {
    return { cg: 'base', gt: 'base', tw: 'base' };
  }
  if (c === '42161' || c === 'arbitrum' || b === 'arbitrum') {
    return { cg: 'arbitrum-one', gt: 'arbitrum', tw: 'arbitrum' };
  }
  if (c === '56' || c === 'bsc' || c === 'binance' || b === 'bsc') {
    return { cg: 'binance-smart-chain', gt: 'bsc', tw: 'smartchain' };
  }
  if (c === '10' || c === 'optimism' || b === 'optimism') {
    return { cg: 'optimistic-ethereum', gt: 'optimism', tw: 'optimism' };
  }
  if (c === '43114' || c === 'avalanche' || b === 'avalanche') {
    return { cg: 'avalanche', gt: 'avax', tw: 'avalanchec' };
  }
  if (c === 'tron' || b === 'tron') {
    return { cg: 'tron', gt: 'tron', tw: 'tron' };
  }
  if (c === 'ton' || b === 'ton') {
    return { cg: 'the-open-network', gt: 'ton', tw: 'ton' };
  }
  if (c === 'xrpl' || b === 'xrpl') {
    return { cg: 'xrp', gt: 'xrpl', tw: 'xrp' };
  }

  return { cg: c, gt: c };
}

/**
 * Fetches candidates from DexScreener (Priority 1)
 */
async function fetchDexScreenerCandidate(address: string): Promise<LogoCandidate | null> {
  try {
    const cleanAddr = address.includes('__') ? address.split('__')[0] : address;
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${cleanAddr}`).catch(() => null);
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.pairs || data.pairs.length === 0) return null;

    for (const pair of data.pairs) {
      const url = pair.info?.imageUrl || pair.info?.header;
      if (url && typeof url === 'string' && url.startsWith('http')) {
        return { provider: 'dexscreener', url, priority: 1 };
      }
    }
  } catch {}
  return null;
}

/**
 * Fetches candidates from CoinGecko (Priority 2: by contract address + platform)
 */
async function fetchCoinGeckoCandidate(
  address: string,
  chainId: string | number,
  blockchainType?: string
): Promise<LogoCandidate | null> {
  try {
    const cleanAddr = address.includes('__') ? address.split('__')[0] : address;
    const { cg } = getPlatformSlug(chainId, blockchainType);
    if (!cg) return null;

    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cg}/contract/${cleanAddr.toLowerCase()}`
    ).catch(() => null);

    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      const url = data?.image?.large || data?.image?.small || data?.image?.thumb;
      if (url && typeof url === 'string' && url.startsWith('http')) {
        return { provider: 'coingecko', url, priority: 2 };
      }
    }
  } catch {}
  return null;
}

/**
 * Fetches candidates from GeckoTerminal (Priority 3: by network + token contract address)
 */
async function fetchGeckoTerminalCandidate(
  address: string,
  chainId: string | number,
  blockchainType?: string
): Promise<LogoCandidate | null> {
  try {
    const cleanAddr = address.includes('__') ? address.split('__')[0] : address;
    const { gt } = getPlatformSlug(chainId, blockchainType);
    if (!gt) return null;

    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${gt}/tokens/${cleanAddr}`
    ).catch(() => null);

    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      const url = data?.data?.attributes?.image_url;
      if (url && typeof url === 'string' && url.startsWith('http')) {
        return { provider: 'geckoterminal', url, priority: 3 };
      }
    }
  } catch {}
  return null;
}

/**
 * Fetches candidates from on-chain & ecosystem registries (Priority 4: Pump.fun, RugCheck, Jupiter, TonAPI, Tronscan)
 */
async function fetchChainRegistryCandidate(
  address: string,
  chainId: string | number,
  blockchainType?: string
): Promise<LogoCandidate | null> {
  const c = String(chainId || '').toLowerCase().trim();
  const b = String(blockchainType || '').toLowerCase().trim();
  const isSolana = c === 'solana' || c === 'mainnet-beta' || b === 'solana';
  const isTon = c === 'ton' || b === 'ton';
  const isTron = c === 'tron' || b === 'tron';

  const cleanAddr = address.trim();

  // 1. Solana Pump.fun & Jupiter & RugCheck
  if (isSolana) {
    // 1a. Pump.fun
    try {
      const pRes = await fetch(`https://frontend-api.pump.fun/coins/${cleanAddr}`).catch(() => null);
      if (pRes && pRes.ok) {
        const pData = await pRes.json().catch(() => null);
        if (pData?.image_uri && typeof pData.image_uri === 'string' && pData.image_uri.startsWith('http')) {
          return { provider: 'chain_registry', url: pData.image_uri, priority: 4 };
        }
      }
    } catch {}

    // 1b. Jupiter Token List
    try {
      const jRes = await fetch(`https://tokens.jup.ag/token/${cleanAddr}`).catch(() => null);
      if (jRes && jRes.ok) {
        const jData = await jRes.json().catch(() => null);
        if (jData?.logoURI && typeof jData.logoURI === 'string' && jData.logoURI.startsWith('http')) {
          return { provider: 'chain_registry', url: jData.logoURI, priority: 4 };
        }
      }
    } catch {}

    // 1c. RugCheck FileMeta
    try {
      const rRes = await fetch(`https://api.rugcheck.xyz/v1/tokens/${cleanAddr}/report`).catch(() => null);
      if (rRes && rRes.ok) {
        const rData = await rRes.json().catch(() => null);
        if (rData?.fileMeta?.image && typeof rData.fileMeta.image === 'string' && rData.fileMeta.image.startsWith('http')) {
          return { provider: 'chain_registry', url: rData.fileMeta.image, priority: 4 };
        }
      }
    } catch {}
  }

  // 2. TON TonAPI
  if (isTon) {
    try {
      const base = cleanAddr.includes('__') ? cleanAddr.split('__')[0] : cleanAddr;
      const tRes = await fetch(`https://tonapi.io/v2/jettons/${base}`).catch(() => null);
      if (tRes && tRes.ok) {
        const tData = await tRes.json().catch(() => null);
        if (tData?.metadata?.image && typeof tData.metadata.image === 'string' && tData.metadata.image.startsWith('http')) {
          return { provider: 'chain_registry', url: tData.metadata.image, priority: 4 };
        }
      }
    } catch {}
  }

  // 3. TRON Tronscan
  if (isTron) {
    try {
      const trRes = await fetch(`https://apilist.tronscanapi.com/api/token_trc20?contract=${cleanAddr}`).catch(() => null);
      if (trRes && trRes.ok) {
        const trData = await trRes.json().catch(() => null);
        const icon = trData?.trc20_tokens?.[0]?.icon_url || trData?.data?.[0]?.icon_url;
        if (icon && typeof icon === 'string' && icon.startsWith('http')) {
          return { provider: 'chain_registry', url: icon, priority: 4 };
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Fetches candidates from TrustWallet / GitHub CDN (Priority 5)
 */
function getGitHubCdnCandidate(
  address: string,
  chainId: string | number,
  blockchainType?: string
): LogoCandidate | null {
  const { tw } = getPlatformSlug(chainId, blockchainType);
  if (!tw) return null;
  const cleanAddr = address.includes('__') ? address.split('__')[0] : address;
  const cdnUrl = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${tw}/assets/${cleanAddr}/logo.png`;
  return { provider: 'github_cdn', url: cdnUrl, priority: 5 };
}

/**
 * Multi-Provider Token Logo Resolver
 *
 * Queries all candidates in parallel, filters and sorts by deterministic priority:
 * 1. DexScreener (Priority 1)
 * 2. CoinGecko (Priority 2)
 * 3. GeckoTerminal (Priority 3)
 * 4. Chain Registries (Priority 4)
 * 5. GitHub / CDN (Priority 5)
 * 6. Provided Initial URL (Priority 6 if valid)
 *
 * Sequentially tests rendering of candidate URLs; uses the first one that successfully renders in the browser.
 * NEVER throws or fails token verification.
 */
export async function resolveTokenLogoWithFallback(
  address: string,
  chainId: string | number,
  initialLogoUrl?: string,
  blockchainType?: string,
  tokenSymbol?: string
): Promise<ResolvedTokenLogo> {
  const cacheKey = `${chainId}_${address}`.toLowerCase();

  // 1. Check in-memory working cache
  if (workingLogoCache.has(cacheKey)) {
    const cached = workingLogoCache.get(cacheKey)!;
    // Verify cached still renders
    const stillWorks = await validateImageRenderable(cached.url, 1500);
    if (stillWorks) {
      return {
        logoUrl: cached.url,
        logoSource: cached.source as any,
        isValid: true,
      };
    } else {
      workingLogoCache.delete(cacheKey);
      failedUrlSet.add(cached.url);
    }
  }

  const candidatePromises: Promise<LogoCandidate | null>[] = [
    fetchDexScreenerCandidate(address),
    fetchCoinGeckoCandidate(address, chainId, blockchainType),
    fetchGeckoTerminalCandidate(address, chainId, blockchainType),
    fetchChainRegistryCandidate(address, chainId, blockchainType),
  ];

  const results = await Promise.all(candidatePromises);
  const candidates: LogoCandidate[] = results.filter((c): c is LogoCandidate => Boolean(c));

  // Add GitHub CDN candidate
  const gh = getGitHubCdnCandidate(address, chainId, blockchainType);
  if (gh) candidates.push(gh);

  // If caller provided an initial logo URL (e.g. from user input or prior state)
  if (initialLogoUrl && typeof initialLogoUrl === 'string' && initialLogoUrl.trim()) {
    // If not already in candidates list, add as custom/candidate
    const exists = candidates.some((c) => c.url === initialLogoUrl.trim());
    if (!exists) {
      candidates.push({
        provider: 'custom',
        url: initialLogoUrl.trim(),
        priority: 0.5, // prioritize initially supplied valid URL if it works
      });
    }
  }

  // Sort by deterministic priority order (1 -> 2 -> 3 -> 4 -> 5)
  candidates.sort((a, b) => a.priority - b.priority);

  // Sequentially test candidate URLs for rendering validation
  for (const cand of candidates) {
    if (!cand.url || failedUrlSet.has(cand.url)) continue;
    const canRender = await validateImageRenderable(cand.url, 3000);
    if (canRender) {
      // Store in working cache
      workingLogoCache.set(cacheKey, { url: cand.url, source: cand.provider });
      return {
        logoUrl: cand.url,
        logoSource: cand.provider,
        isValid: true,
      };
    }
  }

  // If all providers fail, return fallback without breaking token verification
  return {
    logoUrl: '',
    logoSource: 'fallback',
    isValid: false,
  };
}
