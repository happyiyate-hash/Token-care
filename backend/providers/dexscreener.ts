import { NormalizedTokenDetails } from '../types/tokenDetails';

export const CHAIN_MAP_DEXSCREENER: Record<string, string> = {
  '1': 'ethereum',
  '137': 'polygon',
  '56': 'bsc',
  '42161': 'arbitrum',
  '10': 'optimism',
  '8453': 'base',
  '43114': 'avalanche',
  'solana': 'solana',
  'polygon': 'polygon',
  'ethereum': 'ethereum',
  'bsc': 'bsc',
  'arbitrum': 'arbitrum',
  'optimism': 'optimism',
  'base': 'base',
  'avalanche': 'avalanche',
};

export async function fetchDexScreenerToken(
  chain: string,
  contractAddress: string
): Promise<NormalizedTokenDetails | null> {
  const cleanAddr = contractAddress.trim().toLowerCase();
  if (!cleanAddr) return null;

  try {
    const chainKey = CHAIN_MAP_DEXSCREENER[chain.toLowerCase()] || chain.toLowerCase();
    
    // DexScreener token-pairs endpoint
    const url = `https://api.dexscreener.com/latest/dex/tokens/${cleanAddr}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) return null;
    const json = await res.json();
    const pairs = json.pairs;

    if (!pairs || !Array.isArray(pairs) || pairs.length === 0) {
      return null;
    }

    // Filter matching chain if specific, or pick highest liquidity pair
    const matchingPairs = pairs.filter((p: any) => {
      const pChain = (p.chainId || '').toLowerCase();
      return !chainKey || pChain.includes(chainKey) || chainKey.includes(pChain);
    });

    const activePairs = matchingPairs.length > 0 ? matchingPairs : pairs;

    // Sort by USD liquidity descending to get the most canonical pair
    activePairs.sort((a: any, b: any) => {
      const liqA = Number(a?.liquidity?.usd || 0);
      const liqB = Number(b?.liquidity?.usd || 0);
      return liqB - liqA;
    });

    const bestPair = activePairs[0];
    const baseToken = bestPair.baseToken;
    const isBase = (baseToken?.address || '').toLowerCase() === cleanAddr;
    const targetToken = isBase ? baseToken : bestPair.quoteToken;

    // Social and logo extraction
    const info = bestPair.info || {};
    const websites = Array.isArray(info.websites) ? info.websites : [];
    const socials = Array.isArray(info.socials) ? info.socials : [];

    const telegram = socials.find((s: any) => s.type === 'telegram')?.url;
    const twitter = socials.find((s: any) => s.type === 'twitter')?.url;
    const discord = socials.find((s: any) => s.type === 'discord')?.url;
    const website = websites[0]?.url;

    // Determine blockchain standard
    const isSolana = (bestPair.chainId || '').toLowerCase() === 'solana' || chain.toLowerCase() === 'solana';
    const isBsc = (bestPair.chainId || '').toLowerCase() === 'bsc' || chain.toLowerCase() === '56';

    const normalized: NormalizedTokenDetails = {
      name: targetToken?.name || 'Unknown Token',
      symbol: (targetToken?.symbol || 'TOKEN').toUpperCase(),
      decimals: isSolana ? 9 : 18,
      contractAddress: targetToken?.address || cleanAddr,
      chain: bestPair.chainId || chain,
      chainId: chain,
      blockchain: isSolana ? 'Solana' : 'EVM',
      assetStandard: isSolana ? 'SPL' : isBsc ? 'BEP20' : 'ERC20',
      logoUrl: info.imageUrl || undefined,
      bannerUrl: info.header || undefined,
      websiteUrl: website,
      telegramUrl: telegram,
      twitterUrl: twitter,
      discordUrl: discord,
      priceUsd: Number(bestPair.priceUsd) || (isBase ? Number(bestPair.priceUsd) : undefined),
      liquidityUsd: Number(bestPair.liquidity?.usd) || 0,
      fdvUsd: Number(bestPair.fdv) || undefined,
      marketCapUsd: Number(bestPair.marketCap) || Number(bestPair.fdv) || undefined,
      volume24hUsd: Number(bestPair.volume?.h24) || 0,
      priceChange24h: Number(bestPair.priceChange?.h24) || 0,
      pairAddress: bestPair.pairAddress,
      dexName: bestPair.dexId,
      resolvedVia: 'dexscreener',
    };

    return normalized;
  } catch (err) {
    console.error('[DexScreener Provider Error]:', err);
    return null;
  }
}
